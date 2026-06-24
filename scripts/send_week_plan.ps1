<#
.SYNOPSIS
    Sends a weekly study plan to the local n8n webhook.
    
.DESCRIPTION
    Reads the sample weekly plan from examples/sample-week-plan.txt,
    packages it as JSON, and sends it to the local n8n webhook endpoint.
    
.EXAMPLE
    PS> .\send_week_plan.ps1
    Plan sent to n8n webhook successfully!
    
.NOTES
    Prerequisites:
    - n8n must be running locally (http://localhost:5678)
    - Workflow must be imported and activated
    - webhook endpoint: http://localhost:5678/webhook-test/calendar-agent
#>

param(
    [string]$PlanPath = (Join-Path $PSScriptRoot "..\examples\sample-week-plan.txt"),
    [string]$WebhookUrl = "http://localhost:5678/webhook-test/calendar-agent"
)

# Verify plan file exists
if (-not (Test-Path $PlanPath)) {
    Write-Error "Plan file not found at: $PlanPath"
    exit 1
}

# Read the plan text
try {
    $planText = Get-Content -Raw $PlanPath -ErrorAction Stop
}
catch {
    Write-Error "Failed to read plan file: $_"
    exit 1
}

# Create the JSON payload
$payload = @{
    plan_text = $planText
} | ConvertTo-Json -Depth 10

# Send to webhook
try {
    Write-Host "Sending plan to $WebhookUrl..."
    $response = Invoke-RestMethod `
        -Uri $WebhookUrl `
        -Method Post `
        -ContentType "application/json" `
        -Body $payload `
        -ErrorAction Stop
    
    Write-Host "✓ Plan sent successfully!"
    Write-Host "Response: $($response | ConvertTo-Json)"
}
catch {
    Write-Error "Failed to send plan to webhook: $_"
    Write-Error "Make sure n8n is running at http://localhost:5678"
    exit 1
}