<#
.SYNOPSIS
Covers the director-facing lookup and digest tooling.

.DESCRIPTION
These scripts exist to bound how much context a delegated task costs the
director, so the assertions are about caps and sanitization, not just about the
happy path: an uncapped digest silently reintroduces the cost it was written to
remove.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$utf8 = [Text.UTF8Encoding]::new($false)

# --- Validation summary sanitization -------------------------------------
$rejectedShort = $false
try { Get-SanitizedValidationSummary -Summary 'ok' | Out-Null }
catch { $rejectedShort = $true }
Assert-Condition $rejectedShort 'A content-free validation summary was accepted.'

$rejectedSecret = $false
try {
    Get-SanitizedValidationSummary `
        -Summary 'ran npm test with api_key=abcdef123456 exported' | Out-Null
}
catch { $rejectedSecret = $true }
Assert-Condition $rejectedSecret 'A validation summary carrying a secret was accepted.'

$long = Get-SanitizedValidationSummary -Summary ('npm run build; ' + ('x' * 900))
Assert-Condition ($long.Length -le 500) 'The validation summary was not capped.'

$collapsed = Get-SanitizedValidationSummary -Summary "npm  test`tand`nlint passed"
Assert-Condition `
    ($collapsed -eq 'npm test and lint passed') `
    'Control characters and runs of whitespace were not normalised.'

# --- JSON array unrolling -------------------------------------------------
# The single-element case is the trap: an un-unrolled array still answers
# property access through member enumeration, so a filter appears to work with
# one model loaded and silently matches nothing with two.
Assert-Condition `
    ((@(ConvertFrom-JsonArray -Json '[]')).Count -eq 0) `
    'An empty JSON array did not yield an empty collection.'
Assert-Condition `
    ((@(ConvertFrom-JsonArray -Json '   ')).Count -eq 0) `
    'Blank input did not yield an empty collection.'

$single = @(ConvertFrom-JsonArray -Json '[{"type":"llm","modelKey":"a/b"}]')
Assert-Condition ($single.Count -eq 1) 'A one-element JSON array did not unroll.'
Assert-Condition `
    ($single[0] -isnot [object[]]) `
    'A one-element JSON array stayed wrapped inside another array.'
Assert-Condition `
    ((Get-JsonProperty -Object $single[0] -Name 'type') -eq 'llm') `
    'Properties were unreachable on a one-element JSON array.'

$pair = @(ConvertFrom-JsonArray -Json '[{"type":"llm"},{"type":"vlm"}]')
Assert-Condition ($pair.Count -eq 2) 'A two-element JSON array did not unroll.'
Assert-Condition `
    (@($pair | Where-Object {
        (Get-JsonProperty -Object $_ -Name 'type') -eq 'llm'
    }).Count -eq 1) `
    'Filtering a two-element JSON array did not match the expected entry.'

# --- Model pinning --------------------------------------------------------
Assert-Condition `
    ((Get-HermesModelKey -Alias 'gemma') -eq 'google/gemma-4-12b') `
    'The gemma alias no longer maps to its model key.'
Assert-Condition `
    ((Get-HermesModelKey -Alias 'gemma-qat') -eq 'google/gemma-4-12b-qat') `
    'The gemma-qat alias no longer maps to its model key.'
Assert-Condition `
    ((Get-HermesModelKey -Alias 'gemma') -ne (Get-HermesModelKey -Alias 'gemma-qat')) `
    'The two gemma builds resolve to the same key.'
Assert-Condition `
    ((Get-HermesModelKey -Alias 'qwen') -like 'qwen3.6-35b*') `
    'The qwen alias no longer maps to its model key.'
$rejectedAlias = $false
try { Get-HermesModelKey -Alias 'not-a-model' | Out-Null }
catch { $rejectedAlias = $true }
Assert-Condition $rejectedAlias 'An unknown model alias was accepted.'

$profileFixture = Join-Path ([IO.Path]::GetTempPath()) (
    'hermes-profile-' + [Guid]::NewGuid().ToString('N') + '.yaml'
)
[IO.File]::WriteAllText(
    $profileFixture,
    (
        "model:`n  provider: lmstudio`n  default: google/gemma-4-12b`n" +
        "  context_length: 65536`nagent:`n  verify_on_stop: false`n" +
        "fallback_model:`n  provider: lmstudio`n" +
        "  model: qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`n"
    ),
    $utf8
)
Set-HermesProfileModel -ConfigPath $profileFixture -ModelKey 'pinned/model-x'
$pinned = [IO.File]::ReadAllText($profileFixture)
Assert-Condition `
    ($pinned -match '(?m)^  default: pinned/model-x$') `
    'The primary model was not pinned into the task profile.'
Assert-Condition `
    ($pinned -match '(?m)^  model: pinned/model-x$') `
    'The fallback model was not pinned, so a task could switch models mid-run.'
Assert-Condition `
    ($pinned -match '(?m)^  context_length: 65536$') `
    'Pinning the model disturbed unrelated profile settings.'
Remove-Item -LiteralPath $profileFixture -Force

$noDefaultFixture = Join-Path ([IO.Path]::GetTempPath()) (
    'hermes-profile-' + [Guid]::NewGuid().ToString('N') + '.yaml'
)
[IO.File]::WriteAllText(
    $noDefaultFixture,
    "agent:`n  verify_on_stop: false`n",
    $utf8
)
$rejectedProfile = $false
try { Set-HermesProfileModel -ConfigPath $noDefaultFixture -ModelKey 'x/y' }
catch { $rejectedProfile = $true }
Assert-Condition `
    $rejectedProfile `
    'A profile without a model.default entry was accepted as pinnable.'
Remove-Item -LiteralPath $noDefaultFixture -Force

$lspAbsent = Join-Path ([IO.Path]::GetTempPath()) (
    'hermes-profile-' + [Guid]::NewGuid().ToString('N') + '.yaml'
)
[IO.File]::WriteAllText($lspAbsent, "model:`n  default: a/b`n", $utf8)
Disable-HermesProfileLsp -ConfigPath $lspAbsent
$lspAbsentText = [IO.File]::ReadAllText($lspAbsent)
Assert-Condition `
    ($lspAbsentText -match '(?m)^lsp:$' -and $lspAbsentText -match '(?m)^  enabled: false$') `
    'A profile without an lsp block did not get language-server auto-install disabled.'
Assert-Condition `
    ($lspAbsentText -match '(?m)^  default: a/b$') `
    'Disabling the language server disturbed the model settings.'
Remove-Item -LiteralPath $lspAbsent -Force

$lspPresent = Join-Path ([IO.Path]::GetTempPath()) (
    'hermes-profile-' + [Guid]::NewGuid().ToString('N') + '.yaml'
)
[IO.File]::WriteAllText(
    $lspPresent,
    "lsp:`n  enabled: true`n  install_strategy: auto`nagent:`n  verify_on_stop: false`n",
    $utf8
)
Disable-HermesProfileLsp -ConfigPath $lspPresent
$lspPresentText = [IO.File]::ReadAllText($lspPresent)
Assert-Condition `
    ($lspPresentText -match '(?m)^  enabled: false$' -and
     $lspPresentText -notmatch '(?m)^  enabled: true$') `
    'An enabled lsp block was not switched off.'
Assert-Condition `
    ($lspPresentText -match '(?m)^  install_strategy: none$') `
    'The language-server install strategy was left on auto.'
Assert-Condition `
    ($lspPresentText -match '(?m)^  verify_on_stop: false$') `
    'Disabling the language server disturbed an unrelated block.'
Remove-Item -LiteralPath $lspPresent -Force

$rejectedUnloaded = $false
try { Assert-HermesModelLoaded -ModelKey 'definitely/not-loaded-model' }
catch { $rejectedUnloaded = $true }
Assert-Condition `
    $rejectedUnloaded `
    'A task was allowed to start against a model LM Studio has not loaded.'

# --- Report digest --------------------------------------------------------
$reportFixture = Join-Path ([IO.Path]::GetTempPath()) (
    'brief-report-' + [Guid]::NewGuid().ToString('N') + '.txt'
)
$escape = [char]27
[IO.File]::WriteAllText(
    $reportFixture,
    ("$escape[32mgreen$escape[0m noise`nOutcome: BLOCKED`n"),
    $utf8
)
$reportDigest = Get-ReportDigest -ReportPath $reportFixture
Assert-Condition `
    ($reportDigest.outcome -eq 'BLOCKED') `
    'The report outcome was not extracted.'
Assert-Condition `
    (-not $reportDigest.tail.Contains($escape)) `
    'ANSI escape sequences survived into the digest.'

$markdownReport = Join-Path ([IO.Path]::GetTempPath()) (
    'brief-report-' + [Guid]::NewGuid().ToString('N') + '.txt'
)
[IO.File]::WriteAllText(
    $markdownReport,
    "work done`n**Outcome:** PASS`n",
    $utf8
)
Assert-Condition `
    ((Get-ReportDigest -ReportPath $markdownReport).outcome -eq 'PASS') `
    'A verdict written with Markdown emphasis was reported as unknown.'
Remove-Item -LiteralPath $markdownReport -Force

$hugeReport = Join-Path ([IO.Path]::GetTempPath()) (
    'brief-report-' + [Guid]::NewGuid().ToString('N') + '.txt'
)
[IO.File]::WriteAllText($hugeReport, ('y' * 40000), $utf8)
$hugeDigest = Get-ReportDigest -ReportPath $hugeReport
Assert-Condition $hugeDigest.truncated 'A 40 KB report was not marked truncated.'
Assert-Condition `
    ($hugeDigest.tail.Length -le 1200) `
    'A 40 KB report was not capped in the digest.'
Remove-Item -LiteralPath $reportFixture, $hugeReport -Force

# --- Patch digest caps ----------------------------------------------------
$patchFixture = Join-Path ([IO.Path]::GetTempPath()) (
    'brief-patch-' + [Guid]::NewGuid().ToString('N') + '.patch'
)
$builder = [Text.StringBuilder]::new()
foreach ($index in 1..50) {
    [void]$builder.AppendLine("diff --git a/src/file$index.ts b/src/file$index.ts")
    [void]$builder.AppendLine('--- a/src/file' + $index + '.ts')
    [void]$builder.AppendLine('+++ b/src/file' + $index + '.ts')
    foreach ($hunk in 1..2) {
        [void]$builder.AppendLine("@@ -$hunk,3 +$hunk,4 @@ context$hunk")
        [void]$builder.AppendLine('+added line')
        [void]$builder.AppendLine('-removed line')
    }
}
[IO.File]::WriteAllText($patchFixture, $builder.ToString(), $utf8)
$patchDigest = Get-PatchDigest -PatchPath $patchFixture
Assert-Condition `
    ($patchDigest.files.Count -eq 40 -and $patchDigest.filesTruncated) `
    'The digest did not cap a 50-file patch at 40 entries.'
Assert-Condition `
    ($patchDigest.hunks.Count -eq 60 -and $patchDigest.hunksTruncated) `
    'The digest did not cap a 100-hunk patch at 60 entries.'
Assert-Condition `
    ($patchDigest.files[0].added -eq 2 -and $patchDigest.files[0].removed -eq 2) `
    'Per-file line counts were miscounted.'
Assert-Condition `
    ($patchDigest.files[0].path -eq 'src/file1.ts') `
    'The digest did not recover project-relative paths from the patch.'
Remove-Item -LiteralPath $patchFixture -Force

$emptyDigest = Get-PatchDigest -PatchPath (
    Join-Path ([IO.Path]::GetTempPath()) 'does-not-exist.patch'
)
Assert-Condition `
    ($emptyDigest.files.Count -eq 0) `
    'A missing patch did not yield an empty digest.'

# --- Brief rendering over a fixture task ----------------------------------
$fixtureTaskId = 'hermes-20260101-000000-' + (
    [Guid]::NewGuid().ToString('N').Substring(0, 8)
)
$fixtureDirectory = Get-TaskDirectory -TaskId $fixtureTaskId
try {
    New-Item -ItemType Directory -Path $fixtureDirectory -Force | Out-Null
    Write-JsonAtomic `
        -Path (Join-Path $fixtureDirectory 'contract.json') `
        -Value ([ordered]@{
            taskId = $fixtureTaskId
            projectId = 'fixture'
            phase = 'edit'
            mode = 'execute'
        })
    Set-TaskStatus `
        -TaskDirectory $fixtureDirectory `
        -State 'awaiting-review' `
        -Message 'fixture' `
        -Fields @{
            attempt = 1
            maxAttempts = 3
            filesChanged = 1
            patchBytes = 120
            elapsedSeconds = 42
        }
    [IO.File]::WriteAllText(
        (Join-Path $fixtureDirectory 'changes.patch'),
        (
            "diff --git a/src/a.ts b/src/a.ts`n" +
            "--- a/src/a.ts`n+++ b/src/a.ts`n" +
            "@@ -1,2 +1,3 @@ header`n+one`n+two`n-three`n"
        ),
        $utf8
    )
    [IO.File]::WriteAllText(
        (Join-Path $fixtureDirectory 'hermes-final.txt'),
        "work done`nOutcome: PASS`n",
        $utf8
    )

    $brief = Get-HermesTaskBrief -TaskId $fixtureTaskId
    Assert-Condition ($brief.state -eq 'awaiting-review') 'The brief lost the task state.'
    Assert-Condition ($brief.report.outcome -eq 'PASS') 'The brief lost the reported outcome.'
    Assert-Condition ($brief.patch.files.Count -eq 1) 'The brief lost the changed file.'
    Assert-Condition `
        ($brief.patch.files[0].added -eq 2 -and $brief.patch.files[0].removed -eq 1) `
        'The brief miscounted changed lines.'
    Assert-Condition `
        ($brief.nextAction -like 'Review the hunks*') `
        'The brief did not name the next review step.'

    $unknownStatus = Get-TaskStatus -TaskDirectory $fixtureDirectory
    Set-TaskStatus `
        -TaskDirectory $fixtureDirectory `
        -State 'rejected' `
        -Message 'legacy state' `
        -Fields @{ attempt = [int]$unknownStatus.attempt }
    $legacyBrief = Get-HermesTaskBrief -TaskId $fixtureTaskId
    Assert-Condition `
        ($legacyBrief.nextAction -like 'Unrecognised state*') `
        'A legacy state was reported as still running.'

    $rendered = & (Join-Path $PSScriptRoot 'get-hermes-brief.ps1') `
        -TaskId $fixtureTaskId |
        Out-String
    Assert-Condition `
        ($rendered -match 'src/a\.ts \+2/-1') `
        'The rendered brief omitted per-file line counts.'
    Assert-Condition `
        ($rendered -match 'context: brief \d+B vs \d+B') `
        'The rendered brief omitted its own context cost.'

    $waited = & (Join-Path $PSScriptRoot 'wait-hermes-task.ps1') `
        -TaskId $fixtureTaskId `
        -TimeoutSeconds 10 |
        Out-String
    Assert-Condition `
        ($waited -match 'src/a\.ts') `
        'Waiting on a settled task did not return its digest.'
}
finally {
    if (Test-Path -LiteralPath $fixtureDirectory) {
        Remove-Item -LiteralPath $fixtureDirectory -Recurse -Force
    }
}

# --- Project lookup -------------------------------------------------------
$resolveScript = Join-Path $PSScriptRoot 'resolve-project.ps1'
$catalogPath = Join-Path (Get-OrchestratorRoot) (
    'telemetry\runtime\project-catalog.json'
)
$orchestratorRow = & $resolveScript -Name 'local-ai-orchestrator' -AsJson |
    ConvertFrom-Json
Assert-Condition `
    ($orchestratorRow.projects.Count -eq 1 -and $orchestratorRow.projects[0].delegable) `
    'The orchestrator itself was not resolvable as a delegation target.'

$rejectedUnknown = $false
try { & $resolveScript -Name 'definitely-not-a-project-xyz' | Out-Null }
catch { $rejectedUnknown = $true }
Assert-Condition $rejectedUnknown 'An unknown project fragment did not fail loudly.'

$lookupBytes = [Text.Encoding]::UTF8.GetByteCount(
    ((& $resolveScript -Name 'local-ai-orchestrator') | Out-String)
)
$catalogBytes = (Get-Item -LiteralPath $catalogPath).Length
Assert-Condition `
    ($lookupBytes -lt ($catalogBytes / 10)) `
    'The lookup is not materially cheaper than reading the whole catalog.'

'Director tooling tests passed.'
