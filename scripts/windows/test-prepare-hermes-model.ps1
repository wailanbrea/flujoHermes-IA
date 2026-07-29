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
    $fakeBody = @'
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$state = @(Get-Content -LiteralPath $env:HERMES_MODEL_TEST_STATE -Raw | ConvertFrom-Json)
Add-Content -LiteralPath $env:HERMES_MODEL_TEST_LOG -Value ($Arguments -join '|')
switch ($Arguments[0]) {
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
    $env:HERMES_MODEL_TEST_LOG = $logPath
    & (Join-Path $PSScriptRoot 'prepare-hermes-model.ps1') `
        -Model gemma `
        -LmsExecutable $fakeCommand | Out-Null

    $loaded = @(Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json)
    Assert-Condition ($loaded.Count -eq 1) 'More than one LLM remained loaded.'
    Assert-Condition `
        ($loaded[0].modelKey -eq 'google/gemma-4-12b') `
        'Gemma 4 12B was not restored.'
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
}
finally {
    Remove-Item Env:HERMES_MODEL_TEST_STATE -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_MODEL_TEST_LOG -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}

'Hermes model preparation tests passed.'
