<#
.SYNOPSIS
Runs sanitized, reproducible probes against the local model used by Hermes.
#>
[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
if (-not $OutputPath) {
    $workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $OutputPath = Join-Path $workspaceRoot 'telemetry\runtime\hermes-benchmark.json'
}
$model = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive'
$endpoint = 'http://127.0.0.1:1234/v1/chat/completions'
$gpuOffload = 0.70
$results = @()

function Invoke-Probe([hashtable]$Payload) {
    $body = $Payload | ConvertTo-Json -Depth 20 -Compress
    $watch = [Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-RestMethod `
            -Uri $endpoint `
            -Method Post `
            -ContentType 'application/json' `
            -Body $body `
            -TimeoutSec 120
        return [pscustomobject]@{
            Response = $response
            DurationMs = [int]$watch.ElapsedMilliseconds
            Error = $null
        }
    }
    catch {
        return [pscustomobject]@{
            Response = $null
            DurationMs = [int]$watch.ElapsedMilliseconds
            Error = 'api-error'
        }
    }
    finally {
        $watch.Stop()
    }
}

function Add-Result(
    [string]$Id,
    [bool]$Passed,
    [int]$DurationMs,
    [string]$Category
) {
    $script:results += [ordered]@{
        id = $Id
        passed = $Passed
        durationMs = $DurationMs
        category = $Category
    }
}

$base = @{
    model = $model
    temperature = 0
    reasoning_effort = 'none'
}

$exact = @{} + $base
$exact.messages = @(@{
    role = 'user'
    content = 'Reply with exactly HERMES_LAB_OK and nothing else.'
})
$exact.max_tokens = 24
$exactProbe = Invoke-Probe -Payload $exact
$exactText = if ($exactProbe.Response) {
    [string]$exactProbe.Response.choices[0].message.content
}
else { '' }
$exactPassed = $exactText.Trim() -eq 'HERMES_LAB_OK'
Add-Result `
    -Id 'exact-response' `
    -Passed $exactPassed `
    -DurationMs $exactProbe.DurationMs `
    -Category $(if ($exactProbe.Error) { $exactProbe.Error } elseif ($exactPassed) {
        'pass'
    } else { 'response-mismatch' })

$statusTool = @{
    type = 'function'
    function = @{
        name = 'get_synthetic_status'
        description = 'Reads a synthetic benchmark status.'
        parameters = @{
            type = 'object'
            properties = @{ task_id = @{ type = 'string' } }
            required = @('task_id')
            additionalProperties = $false
        }
    }
}
$toolPayload = @{} + $base
$toolPayload.messages = @(@{
    role = 'user'
    content = 'Read the synthetic status for task HERMES-LAB.'
})
$toolPayload.tools = @($statusTool)
$toolPayload.tool_choice = 'required'
$toolPayload.max_tokens = 128
$toolProbe = Invoke-Probe -Payload $toolPayload
$toolPassed = $false
if ($toolProbe.Response) {
    $call = @($toolProbe.Response.choices[0].message.tool_calls)[0]
    if ($call -and $call.function.name -eq 'get_synthetic_status') {
        try {
            $arguments = $call.function.arguments | ConvertFrom-Json
            $toolPassed = $arguments.task_id -eq 'HERMES-LAB'
        }
        catch { $toolPassed = $false }
    }
}
Add-Result `
    -Id 'tool-calling' `
    -Passed $toolPassed `
    -DurationMs $toolProbe.DurationMs `
    -Category $(if ($toolProbe.Error) { $toolProbe.Error } elseif ($toolPassed) {
        'pass'
    } else { 'invalid-tool-call' })

$writeTool = @{
    type = 'function'
    function = @{
        name = 'write_fixture_file'
        description = 'Writes one file inside a synthetic isolated fixture.'
        parameters = @{
            type = 'object'
            properties = @{
                path = @{ type = 'string'; enum = @('result.txt') }
                content = @{ type = 'string' }
            }
            required = @('path', 'content')
            additionalProperties = $false
        }
    }
}
$scopePayload = @{} + $base
$scopePayload.messages = @(@{
    role = 'user'
    content = 'Write HERMES_SCOPE_OK to result.txt in the synthetic fixture.'
})
$scopePayload.tools = @($writeTool)
$scopePayload.tool_choice = 'required'
$scopePayload.max_tokens = 128
$scopeProbe = Invoke-Probe -Payload $scopePayload
$scopePassed = $false
if ($scopeProbe.Response) {
    $call = @($scopeProbe.Response.choices[0].message.tool_calls)[0]
    if ($call -and $call.function.name -eq 'write_fixture_file') {
        try {
            $arguments = $call.function.arguments | ConvertFrom-Json
            $scopePassed = $arguments.path -eq 'result.txt' -and
                $arguments.content -eq 'HERMES_SCOPE_OK'
        }
        catch { $scopePassed = $false }
    }
}
Add-Result `
    -Id 'scoped-edit' `
    -Passed $scopePassed `
    -DurationMs $scopeProbe.DurationMs `
    -Category $(if ($scopeProbe.Error) { $scopeProbe.Error } elseif ($scopePassed) {
        'pass'
    } else { 'scope-mismatch' })

$throughput = @{} + $base
$throughput.messages = @(@{
    role = 'user'
    content = 'Generate exactly 128 lowercase words about software testing.'
})
$throughput.max_tokens = 256
$throughputProbe = Invoke-Probe -Payload $throughput
$completionTokens = if ($throughputProbe.Response) {
    [int]$throughputProbe.Response.usage.completion_tokens
}
else { 0 }
$tokensPerSecond = if ($completionTokens -gt 0 -and $throughputProbe.DurationMs -gt 0) {
    [Math]::Round($completionTokens / ($throughputProbe.DurationMs / 1000), 2)
}
else { 0 }

$passed = @($results | Where-Object { $_.passed }).Count
$report = [ordered]@{
    schemaVersion = 1
    generatedAt = [DateTime]::UtcNow.ToString('o')
    model = $model
    gpuOffload = $gpuOffload
    total = $results.Count
    passed = $passed
    tokensPerSecond = $tokensPerSecond
    tests = $results
}
$parent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw 'Benchmark output parent does not exist.'
}
$temporary = "$OutputPath.$([Guid]::NewGuid().ToString('N')).tmp"
[IO.File]::WriteAllText(
    $temporary,
    ($report | ConvertTo-Json -Depth 10),
    [Text.UTF8Encoding]::new($false)
)
Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
$report | ConvertTo-Json -Depth 10 -Compress
if ($passed -ne $results.Count) { exit 1 }
