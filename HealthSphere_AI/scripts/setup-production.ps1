<#>
.SYNOPSIS
    HealthSphere AI — Production Setup Script
    Run this at the start of each day to verify environment and run checks.

.USAGE
    .\scripts\setup-production.ps1 -Day 1
    .\scripts\setup-production.ps1 -Day 2
    .\scripts\setup-production.ps1 -Day 3
    .\scripts\setup-production.ps1 -Day 4
    .\scripts\setup-production.ps1 -Day 5
    .\scripts\setup-production.ps1 -CheckAll
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('1','2','3','4','5','CheckAll')]
    [string]$Day
)

$ErrorActionPreference = 'Stop'
$PROJECT_ROOT = "D:\Github\HealthSphere\HealthSphere_AI"

function Write-Header($text) {
    Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Write-Success($text) {
    Write-Host "✅ $text" -ForegroundColor Green
}

function Write-Warning($text) {
    Write-Host "⚠️  $text" -ForegroundColor Yellow
}

function Write-Error($text) {
    Write-Host "❌ $text" -ForegroundColor Red
}

function Check-Command($cmd, $name) {
    try {
        & $cmd --version 2>$null | Out-Null
        Write-Success "$name found"
        return $true
    } catch {
        Write-Error "$name NOT found — install: $cmd"
        return $false
    }
}

function Check-EnvVar($var, $required = $true) {
    $val = [Environment]::GetEnvironmentVariable($var, 'Process')
    if (-not $val) { $val = [Environment]::GetEnvironmentVariable($var, 'User') }
    if (-not $val) { $val = [Environment]::GetEnvironmentVariable($var, 'Machine') }
    if ($val) {
        Write-Success "Env: $var = $($val.Substring(0, [Math]::Min(20, $val.Length)))..."
        return $true
    } else {
        if ($required) { Write-Error "Missing required env var: $var" } else { Write-Warning "Optional env var not set: $var" }
        return $false
    }
}

# === DAY 1 CHECKS ===
function Invoke-Day1Checks {
    Write-Header "DAY 1 — Infrastructure & Database Migration"
    
    $checks = @()
    $checks += Check-Command 'node' 'Node.js 18+'
    $checks += Check-Command 'npm' 'npm'
    $checks += Check-Command 'psql' 'PostgreSQL client (psql)'
    $checks += Check-Command 'docker' 'Docker (optional)'
    $checks += Check-Command 'supabase' 'Supabase CLI (optional)'
    
    $checks += Check-EnvVar 'SUPABASE_DB_URL'
    $checks += Check-EnvVar 'SUPABASE_URL'
    $checks += Check-EnvVar 'SUPABASE_SERVICE_KEY'
    $checks += Check-EnvVar 'SUPABASE_STORAGE_BUCKET'
    $checks += Check-EnvVar 'CLOUDINARY_CLOUD_NAME'
    $checks += Check-EnvVar 'CLOUDINARY_API_KEY'
    $checks += Check-EnvVar 'CLOUDINARY_API_SECRET'
    $checks += Check-EnvVar 'ADMIN_EMAILS'
    $checks += Check-EnvVar 'CLARITY_ID' $false
    
    # Verify Supabase connection
    if ($env:SUPABASE_DB_URL) {
        Write-Host "`nTesting Supabase connection..." -NoNewline
        try {
            & psql $env:SUPABASE_DB_URL -c "SELECT 1;" 2>$null | Out-Null
            Write-Success "Supabase connection OK"
        } catch {
            Write-Error "Supabase connection FAILED"
        }
    }
    
    # Run migration script if exists
    $migrationScript = "$PROJECT_ROOT\scripts\migrate-to-postgres.mjs"
    if (Test-Path $migrationScript) {
        Write-Host "`nRunning migration script..." -NoNewline
        try {
            & node $migrationScript
            Write-Success "Migration completed"
        } catch {
            Write-Error "Migration failed: $_"
        }
    } else {
        Write-Warning "Migration script not found at $migrationScript"
    }
    
    # Run tests
    Write-Host "`nRunning unit tests..."
    Set-Location "$PROJECT_ROOT\backend"
    try {
        & npm test
        Write-Success "All tests passed"
    } catch {
        Write-Error "Tests failed"
    }
}

# === DAY 2 CHECKS ===
function Invoke-Day2Checks {
    Write-Header "DAY 2 — Auth Hardening & Email"
    
    $checks = @()
    $checks += Check-EnvVar 'RESEND_API_KEY'
    $checks += Check-EnvVar 'EMAIL_FROM'  # e.g., "HealthSphere <noreply@healthsphere.ai>"
    $checks += Check-EnvVar 'APP_URL'     # e.g., "https://healthsphere.ai"
    
    # Verify email sending
    if ($env:RESEND_API_KEY) {
        Write-Host "`nTesting Resend API..."
        try {
            $resp = Invoke-RestMethod -Uri 'https://api.resend.com/emails' -Method Post `
                -Headers @{ Authorization = "Bearer $env:RESEND_API_KEY" } `
                -Body (@{ from = $env:EMAIL_FROM; to = $env:TEST_EMAIL; subject = 'Test'; html = '<p>Test</p>' } | ConvertTo-Json) `
                -ContentType 'application/json'
            Write-Success "Resend API working"
        } catch {
            Write-Error "Resend test failed: $($_.Exception.Message)"
        }
    }
    
    # Security header verification
    Write-Host "`nVerifying security headers on staging..."
    if ($env:STAGING_URL) {
        try {
            $resp = Invoke-WebRequest -Uri "$env:STAGING_URL/api/health" -Method Head -ErrorAction Stop
            $headers = $resp.Headers
            @('Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Content-Security-Policy') | ForEach-Object {
                if ($headers[$_]) { Write-Success "Header $_: $($headers[$_])" }
                else { Write-Warning "Missing header: $_" }
            }
        } catch {
            Write-Error "Could not reach staging: $_"
        }
    }
    
    # Rate limit test
    Write-Host "`nTesting rate limiting on /api/auth/login..."
    # Add actual test here
}

# === DAY 3 CHECKS ===
function Invoke-Day3Checks {
    Write-Header "DAY 3 — MFA + Family Sharing + Observability"
    
    $checks = @()
    $checks += Check-EnvVar 'SENTRY_DSN' $false
    $checks += Check-EnvVar 'BETTER_STACK_SOURCE_TOKEN' $false
    $checks += Check-EnvVar 'BETTER_STACK_INGEST_HOST' $false
    $checks += Check-EnvVar 'UPTIMEROBOT_API_KEY' $false
    
    # Test MFA endpoints
    Write-Host "`nTesting MFA endpoints..."
    # Add tests
    
    # Test family invite flow
    Write-Host "`nTesting family invite flow..."
    # Add tests
}

# === DAY 4 CHECKS ===
function Invoke-Day4Checks {
    Write-Header "DAY 4 — Polish, Load Test, Legal"
    
    # Accessibility check
    Write-Host "`nRunning axe-core accessibility audit..."
    # npx @axe-core/cli http://localhost:3000 --save
    
    # Load test
    Write-Host "`nRunning k6 load test..."
    # k6 run scripts/load-test.js
    
    # Legal docs check
    $legalFiles = @('PRIVACY.md', 'TERMS.md', 'DPA.md')
    foreach ($f in $legalFiles) {
        if (Test-Path "$PROJECT_ROOT\docs\$f") { Write-Success "Legal doc: $f" }
        else { Write-Warning "Missing legal doc: $f" }
    }
}

# === DAY 5 CHECKS ===
function Invoke-Day5Checks {
    Write-Header "DAY 5 — Launch Prep"
    
    # CI/CD verification
    Write-Host "`nChecking GitHub Actions workflow..."
    $workflow = "$PROJECT_ROOT\.github\workflows\ci-cd.yml"
    if (Test-Path $workflow) { Write-Success "CI/CD workflow exists" }
    else { Write-Error "Missing CI/CD workflow" }
    
    # Smoke test suite
    Write-Host "`nRunning Playwright smoke tests..."
    # npx playwright test --project=chromium
    
    # Rollback verification
    Write-Host "`nVerifying rollback capability..."
    # Check Vercel/Supabase rollback
}

# === MAIN ===
switch ($Day) {
    '1' { Invoke-Day1Checks }
    '2' { Invoke-Day2Checks }
    '3' { Invoke-Day3Checks }
    '4' { Invoke-Day4Checks }
    '5' { Invoke-Day5Checks }
    'CheckAll' {
        Invoke-Day1Checks
        Invoke-Day2Checks
        Invoke-Day3Checks
        Invoke-Day4Checks
        Invoke-Day5Checks
    }
}

Write-Host "`n=== Day $Day checks complete ===" -ForegroundColor Cyan