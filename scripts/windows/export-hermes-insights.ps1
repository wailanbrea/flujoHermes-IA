<#
.SYNOPSIS
Exports sanitized Hermes usage metrics for TRAMA without prompts or responses.
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 3650)]
    [int]$Days = 30,
    [string]$HermesHome,
    [string]$OutputPath,

    # Per-task callers need only the overview totals. The full report exists for
    # the TRAMA dashboard, which reads the shared profile once.
    [switch]$Compact
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

if (-not $HermesHome) {
    $HermesHome = Join-Path (
        [Environment]::GetFolderPath('LocalApplicationData')
    ) 'hermes\profiles\localai'
}
if (-not $OutputPath) {
    $OutputPath = Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\hermes-insights.json'
}

$python = Join-Path (
    [Environment]::GetFolderPath('LocalApplicationData')
) 'hermes\hermes-agent\venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'The Hermes Python runtime is unavailable.'
}
if (-not (Test-Path -LiteralPath $HermesHome -PathType Container)) {
    throw 'The requested Hermes home does not exist.'
}

$previousHermesHome = $env:HERMES_HOME
try {
    $env:HERMES_HOME = [IO.Path]::GetFullPath($HermesHome)
    $pythonCode = @(
        'import json',
        'import sys',
        'from hermes_state import SessionDB',
        'from agent.insights import InsightsEngine',
        'db = SessionDB()',
        'try:',
        '    report = InsightsEngine(db).generate(days=int(sys.argv[1]))',
        '    print(json.dumps(report, ensure_ascii=True))',
        'finally:',
        '    db.close()'
    ) -join "`n"
    $raw = & $python -c $pythonCode ([string]$Days)
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        throw 'Hermes InsightsEngine did not return a report.'
    }
    $report = ($raw -join [Environment]::NewLine) | ConvertFrom-Json
}
finally {
    $env:HERMES_HOME = $previousHermesHome
}

$inputPricePerMillionUsd = 5.0
$outputPricePerMillionUsd = 30.0
$models = @($report.models | ForEach-Object {
    $avoided = (
        ([double]$_.input_tokens * $inputPricePerMillionUsd) +
        ([double]$_.output_tokens * $outputPricePerMillionUsd)
    ) / 1000000
    [ordered]@{
        model = [string]$_.model
        sessions = [int]$_.sessions
        inputTokens = [int64]$_.input_tokens
        outputTokens = [int64]$_.output_tokens
        totalTokens = [int64]$_.total_tokens
        reasoningTokens = [int64]$_.reasoning_tokens
        apiCalls = [int]$_.api_calls
        toolCalls = [int]$_.tool_calls
        localCostUsd = 0.0
        avoidedGpt56SolCostUsd = [Math]::Round($avoided, 6)
    }
})

$overviewAvoided = (
    ([double]$report.overview.total_input_tokens * $inputPricePerMillionUsd) +
    ([double]$report.overview.total_output_tokens * $outputPricePerMillionUsd)
) / 1000000
$sanitized = [ordered]@{
    schemaVersion = 1
    generatedAt = [DateTime]::UtcNow.ToString('o')
    days = $Days
    pricing = [ordered]@{
        referenceModel = 'gpt-5.6-sol'
        tier = 'standard-short-context'
        inputPerMillionUsd = $inputPricePerMillionUsd
        outputPerMillionUsd = $outputPricePerMillionUsd
        localInputPerMillionUsd = 0.0
        localOutputPerMillionUsd = 0.0
        source = 'https://developers.openai.com/api/docs/pricing'
        checkedAt = '2026-07-28'
    }
    overview = [ordered]@{
        sessions = [int]$report.overview.total_sessions
        messages = [int]$report.overview.total_messages
        userMessages = [int]$report.overview.user_messages
        assistantMessages = [int]$report.overview.assistant_messages
        toolMessages = [int]$report.overview.tool_messages
        toolCalls = [int]$report.overview.total_tool_calls
        inputTokens = [int64]$report.overview.total_input_tokens
        outputTokens = [int64]$report.overview.total_output_tokens
        totalTokens = [int64]$report.overview.total_tokens
        activeHours = [Math]::Round([double]$report.overview.total_hours, 3)
        averageSessionSeconds = [Math]::Round([double]$report.overview.avg_session_duration, 1)
        averageMessagesPerSession = [Math]::Round([double]$report.overview.avg_messages_per_session, 1)
        avoidedCloudTokens = [int64](
            $report.overview.total_input_tokens +
            $report.overview.total_output_tokens
        )
        localCostUsd = 0.0
        avoidedGpt56SolCostUsd = [Math]::Round($overviewAvoided, 6)
    }
    models = $models
    platforms = @($report.platforms | ForEach-Object {
        [ordered]@{
            platform = [string]$_.platform
            sessions = [int]$_.sessions
            messages = [int]$_.messages
            totalTokens = [int64]$_.total_tokens
            toolCalls = [int]$_.tool_calls
        }
    })
    tools = @($report.tools | ForEach-Object {
        [ordered]@{
            tool = [string]$_.tool
            calls = [int]$_.count
            percentage = [Math]::Round([double]$_.percentage, 1)
        }
    })
    skills = [ordered]@{
        totalLoads = [int]$report.skills.summary.total_skill_loads
        totalEdits = [int]$report.skills.summary.total_skill_edits
        distinct = [int]$report.skills.summary.distinct_skills_used
        top = @($report.skills.top_skills | ForEach-Object {
            [ordered]@{
                skill = [string]$_.skill
                loads = [int]$_.view_count
                edits = [int]$_.manage_count
                total = [int]$_.total_count
            }
        })
    }
    activity = [ordered]@{
        byDay = @($report.activity.by_day | ForEach-Object {
            [ordered]@{ day = [string]$_.day; count = [int]$_.count }
        })
        byHour = @($report.activity.by_hour | ForEach-Object {
            [ordered]@{ hour = [int]$_.hour; count = [int]$_.count }
        })
        busiestDay = [string]$report.activity.busiest_day.day
        busiestHour = [int]$report.activity.busiest_hour.hour
        activeDays = [int]$report.activity.active_days
        maxStreak = [int]$report.activity.max_streak
    }
    topSessions = @($report.top_sessions | ForEach-Object {
        [ordered]@{
            label = [string]$_.label
            value = [string]$_.value
            date = [string]$_.date
        }
    })
}

if ($Compact) {
    $sanitized = [ordered]@{
        schemaVersion = 1
        generatedAt = $sanitized.generatedAt
        days = $Days
        compact = $true
        pricing = $sanitized.pricing
        overview = $sanitized.overview
    }
}

$parent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw 'The insights output parent does not exist.'
}
$temporary = "$OutputPath.$([Guid]::NewGuid().ToString('N')).tmp"
[IO.File]::WriteAllText(
    $temporary,
    ($sanitized | ConvertTo-Json -Depth 12),
    [Text.UTF8Encoding]::new($false)
)
Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
$sanitized | ConvertTo-Json -Depth 12 -Compress