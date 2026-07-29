<#
.SYNOPSIS
Renders a bounded review digest for one Hermes task.

.DESCRIPTION
Reviewing a task by reading changes.patch, hermes-final.txt, usage.json and
status.json costs the director tens of thousands of tokens, which is most of the
saving delegation was supposed to buy. This renders a fixed-size digest instead:
verdict, policy violations, per-file line counts, hunk headers and the tail of
Hermes' required report. The full patch stays one deliberate read away, for the
cases where the hunk headers genuinely are not enough.

.PARAMETER TaskId
Identifier returned by submit-hermes-task.ps1.

.PARAMETER AsJson
Emits the structured digest instead of the terser text rendering.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$TaskId,

    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$brief = Get-HermesTaskBrief -TaskId $TaskId

if ($AsJson) {
    $brief | ConvertTo-Json -Depth 6 -Compress
    return
}

$lines = [Collections.Generic.List[string]]::new()
# The extra parentheses matter: inside a method call, a bare comma list would be
# read as separate arguments to Add instead of operands of -f.
$lines.Add((
    '{0} state={1} model={2} phase={3} mode={4} attempt={5}/{6} elapsed={7}s' -f
        $brief.taskId, $brief.state, $brief.model, $brief.phase, $brief.mode,
        $brief.attempt, $brief.maxAttempts, $brief.elapsedSeconds
))
if ($brief.errorCode) {
    $lines.Add('error: ' + $brief.errorCode)
}
if ($brief.childTaskId) {
    $lines.Add('child: ' + $brief.childTaskId)
}

$violations = @($brief.violations)
$policy = if ($null -eq $brief.patchPolicyPassed) {
    'not-evaluated'
}
elseif ([bool]$brief.patchPolicyPassed) { 'pass' } else { 'fail' }
$totalAdded = 0
$totalRemoved = 0
foreach ($file in $brief.patch.files) {
    $totalAdded += [int]$file.added
    $totalRemoved += [int]$file.removed
}
$lines.Add((
    'policy={0} violations={1} files={2} +{3}/-{4} patch={5}B local-tokens={6}' -f
        $policy,
        $(if ($violations.Count -gt 0) { $violations -join ',' } else { 'none' }),
        $brief.filesChanged, $totalAdded, $totalRemoved,
        $brief.patchBytes, $brief.localTokens
))
$lines.Add('outcome: ' + $brief.report.outcome)

if ($brief.patch.files.Count -gt 0) {
    $lines.Add('files:')
    foreach ($file in $brief.patch.files) {
        $lines.Add(('  {0} +{1}/-{2}' -f $file.path, $file.added, $file.removed))
    }
    if ($brief.patch.filesTruncated) {
        $lines.Add('  ... file list truncated; read patch-validation.json for the full set')
    }
}
if ($brief.patch.hunks.Count -gt 0) {
    $lines.Add('hunks:')
    foreach ($hunk in $brief.patch.hunks) {
        $lines.Add('  ' + $hunk)
    }
    if ($brief.patch.hunksTruncated) {
        $lines.Add('  ... hunk list truncated')
    }
}
if ($brief.report.tail) {
    $lines.Add(
        $(if ($brief.report.truncated) { 'report-tail:' } else { 'report:' })
    )
    foreach ($reportLine in ($brief.report.tail -split "`r?`n")) {
        $lines.Add('  ' + $reportLine)
    }
}
$lines.Add('next: ' + $brief.nextAction)

$rendered = ($lines -join [Environment]::NewLine)
$briefBytes = [Text.Encoding]::UTF8.GetByteCount($rendered)
$sourceBytes = [int]$brief.sourceArtifactBytes
$ratio = if ($briefBytes -gt 0) {
    [Math]::Round($sourceBytes / [double]$briefBytes, 1)
}
else { 0 }
Write-Output $rendered
Write-Output (
    'context: brief {0}B vs {1}B of raw task artifacts ({2}x)' -f
        $briefBytes, $sourceBytes, $ratio
)
