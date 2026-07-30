[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) (
    'hermes-model-test-' + [Guid]::NewGuid().ToString('N')
)
$statePath = Join-Path $fixtureRoot 'state.json'
$catalogPath = Join-Path $fixtureRoot 'catalog.json'
$logPath = Join-Path $fixtureRoot 'calls.log'
$fakeScript = Join-Path $fixtureRoot 'fake-lms.ps1'
$fakeCommand = Join-Path $fixtureRoot 'lms-test.cmd'
$utf8 = [Text.UTF8Encoding]::new($false)

try {
    New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
    @(
        [ordered]@{
            type = 'llm'
            modelKey = 'other/model-a'
            identifier = 'other-a'
            contextLength = 4096
            parallel = 2
        },
        [ordered]@{
            type = 'llm'
            modelKey = 'other/model-b'
            identifier = 'other-b'
            contextLength = 4096
            parallel = 1
        }
    ) | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    # The on-disk catalog is independent of what happens to be loaded: it is
    # what `lms ls --json` would report, and is what the pre-load guard checks
    # an alias's resolved key against before ever calling `load`.
    @(
        [ordered]@{ type = 'llm'; modelKey = 'google/gemma-4-12b-qat' },
        [ordered]@{ type = 'llm'; modelKey = 'other/model-a' },
        [ordered]@{ type = 'llm'; modelKey = 'other/model-b' }
    ) | ConvertTo-Json | Set-Content -LiteralPath $catalogPath -Encoding UTF8
    $fakeBody = @'
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$state = @(Get-Content -LiteralPath $env:HERMES_MODEL_TEST_STATE -Raw | ConvertFrom-Json)
Add-Content -LiteralPath $env:HERMES_MODEL_TEST_LOG -Value ($Arguments -join '|')
switch ($Arguments[0]) {
    'ls' {
        Get-Content -LiteralPath $env:HERMES_MODEL_TEST_CATALOG -Raw
        exit 0
    }
    'ps' {
        $state | ConvertTo-Json -Compress
        exit 0
    }
    'unload' {
        if ($Arguments.Count -ne 2) { exit 9 }
        @($state | Where-Object { $_.identifier -ne $Arguments[1] }) |
            ConvertTo-Json |
            Set-Content -LiteralPath $env:HERMES_MODEL_TEST_STATE -Encoding UTF8
        exit 0
    }
    'load' {
        $contextIndex = [Array]::IndexOf($Arguments, '--context-length')
        $parallelIndex = [Array]::IndexOf($Arguments, '--parallel')
        @([ordered]@{
            type = 'llm'
            modelKey = $Arguments[1]
            identifier = $Arguments[1]
            contextLength = [int64]$Arguments[$contextIndex + 1]
            parallel = [int]$Arguments[$parallelIndex + 1]
        }) | ConvertTo-Json | Set-Content -LiteralPath $env:HERMES_MODEL_TEST_STATE -Encoding UTF8
        exit 0
    }
}
exit 8
'@
    [IO.File]::WriteAllText($fakeScript, $fakeBody, $utf8)
    [IO.File]::WriteAllText(
        $fakeCommand,
        "@echo off`r`npowershell.exe -NoProfile -NonInteractive -File `"$fakeScript`" %*`r`n",
        [Text.ASCIIEncoding]::new()
    )
    $env:HERMES_MODEL_TEST_STATE = $statePath
    $env:HERMES_MODEL_TEST_CATALOG = $catalogPath
    $env:HERMES_MODEL_TEST_LOG = $logPath
    & (Join-Path $PSScriptRoot 'prepare-hermes-model.ps1') `
        -Model gemma `
        -LmsExecutable $fakeCommand | Out-Null

    $loaded = @(Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json)
    Assert-Condition ($loaded.Count -eq 1) 'More than one LLM remained loaded.'
    Assert-Condition `
        ($loaded[0].modelKey -eq 'google/gemma-4-12b-qat') `
        'The gemma alias did not resolve to the QAT build.'
    Assert-Condition ([int64]$loaded[0].contextLength -eq 65536) 'Context is unsafe.'
    Assert-Condition ([int]$loaded[0].parallel -eq 4) 'Parallelism default drifted.'
    $calls = @(Get-Content -LiteralPath $logPath)
    foreach ($unload in @($calls | Where-Object { $_ -like 'unload|*' })) {
        Assert-Condition `
            (($unload -split '\|').Count -eq 2) `
            'Unload received more than one identifier.'
    }
    Assert-Condition `
        (@($calls | Where-Object { $_ -like '*--gpu|max*' }).Count -eq 1) `
        'GPU max was not requested.'
    Assert-Condition `
        (@($calls | Where-Object { $_ -like '*--no-speculative-draft-mtp*' }).Count -eq 1) `
        'MTP was not disabled.'
    Assert-Condition `
        (@($calls | Where-Object { $_ -like 'load|*--ttl*' }).Count -eq 0) `
        'The resident Gemma model received an idle TTL.'

    # The core regression this test file exists to catch now: `lms.exe load`
    # resolves an unrecognised key by substring match against whatever is on
    # disk and silently loads that instead, under the requested identifier -
    # confirmed against the real CLI after the plain gemma-4-12b build was
    # removed. A model no longer on disk must fail loudly before `load` is
    # ever attempted, not silently substitute a different one.
    @(
        [ordered]@{ type = 'llm'; modelKey = 'google/gemma-4-12b-qat' },
        [ordered]@{ type = 'llm'; modelKey = 'other/model-a' }
    ) | ConvertTo-Json | Set-Content -LiteralPath $catalogPath -Encoding UTF8
    '[]' | Set-Content -LiteralPath $statePath -Encoding UTF8
    Clear-Content -LiteralPath $logPath -ErrorAction SilentlyContinue
    $rejectedMissingModel = $false
    try {
        & (Join-Path $PSScriptRoot 'prepare-hermes-model.ps1') `
            -Model qwen `
            -LmsExecutable $fakeCommand | Out-Null
    }
    catch {
        $rejectedMissingModel = $true
    }
    Assert-Condition `
        $rejectedMissingModel `
        'A model absent from the on-disk catalog was not rejected before loading.'
    $loadCallsAfterRejection = @(
        Get-Content -LiteralPath $logPath -ErrorAction SilentlyContinue |
            Where-Object { $_ -like 'load|*' }
    )
    Assert-Condition `
        ($loadCallsAfterRejection.Count -eq 0) `
        'A missing model reached the load call instead of being rejected first.'

    @(
        [ordered]@{
            type = 'llm'
            modelKey = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive'
        }
    ) | ConvertTo-Json | Set-Content -LiteralPath $catalogPath -Encoding UTF8
    Clear-Content -LiteralPath $logPath
    & (Join-Path $PSScriptRoot 'prepare-hermes-model.ps1') `
        -Model qwen `
        -LmsExecutable $fakeCommand | Out-Null
    $qwenCalls = @(Get-Content -LiteralPath $logPath)
    Assert-Condition `
        (@($qwenCalls | Where-Object {
            $_ -like 'load|*--gpu|0.50*--ttl|900*'
        }).Count -eq 1) `
        'The manual Qwen load did not use the safe split and idle TTL.'
}
finally {
    Remove-Item Env:HERMES_MODEL_TEST_STATE -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_MODEL_TEST_CATALOG -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_MODEL_TEST_LOG -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}

'Hermes model preparation tests passed.'
