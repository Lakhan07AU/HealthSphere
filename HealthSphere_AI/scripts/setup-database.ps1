# HealthSphere AI — PostgreSQL Database Setup
# Run this once to create the database and user
# Run in PowerShell as Administrator if needed

$ErrorActionPreference = "Stop"

Write-Host "=== HealthSphere AI — PostgreSQL Setup ===" -ForegroundColor Cyan

# Check if psql is available
$psqlPath = Get-Command "psql" -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "ERROR: psql not found in PATH. Ensure PostgreSQL is installed and added to PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Found psql at: $($psqlPath.Source)" -ForegroundColor Green

# Check PostgreSQL is running
Write-Host "Checking PostgreSQL connectivity..."
try {
    $result = & psql -h localhost -p 5432 -U postgres -c "SELECT version();" 2>&1
    if ($result -match "PostgreSQL") {
        Write-Host "PostgreSQL is running and accessible." -ForegroundColor Green
    } else {
        Write-Host "WARNING: Could not connect to PostgreSQL. Is it running?" -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: PostgreSQL connection failed. You may need to start it first." -ForegroundColor Yellow
}

# Create database
$dbName = "healthsphere"
$pgUser = "postgres"
$pgPassword = "postgres"

Write-Host "Creating database '$dbName' (if not exists)..."
& psql -h localhost -p 5432 -U $pgUser -tc "SELECT 1 FROM pg_database WHERE datname = '$dbName'" | Out-Null
$dbExists = $LASTEXITCODE -eq 0

if (-not $dbExists) {
    & psql -h localhost -p 5432 -U $pgUser -c "CREATE DATABASE $dbName;"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database '$dbName' created successfully." -ForegroundColor Green
    } else {
        Write-Host "Failed to create database. You may need to create it manually." -ForegroundColor Red
    }
} else {
    Write-Host "Database '$dbName' already exists." -ForegroundColor Green
}

# Set password for postgres user (optional)
Write-Host "Setting postgres password..."
& psql -h localhost -p 5432 -U $pgUser -c "ALTER USER $pgUser WITH PASSWORD '$pgPassword';" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Password set." -ForegroundColor Green
} else {
    Write-Host "Could not set password (may already be set)." -ForegroundColor Yellow
}

# Run schema
$schemaPath = Join-Path $PSScriptRoot "..\backend\lib\schema.sql"
if (Test-Path $schemaPath) {
    Write-Host "Loading schema from $schemaPath..."
    & psql -h localhost -p 5432 -U $pgUser -d $dbName -f $schemaPath
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Schema loaded successfully." -ForegroundColor Green
    } else {
        Write-Host "Schema load had issues (may already exist)." -ForegroundColor Yellow
    }
} else {
    Write-Host "Schema file not found at $schemaPath" -ForegroundColor Yellow
}

# Create .env file from example if it doesn't exist
$envPath = Join-Path $PSScriptRoot "..\backend\.env"
$envExample = Join-Path $PSScriptRoot "..\backend\.env.example"
if (-not (Test-Path $envPath)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envPath
        Write-Host "Created .env from .env.example" -ForegroundColor Green
    } else {
        Write-Host "No .env.example found." -ForegroundColor Yellow
    }
} else {
    Write-Host ".env already exists, skipping." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Setup complete ===" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review backend/.env and adjust PG_PASSWORD if needed"
Write-Host "  2. Run migration: node scripts/migrate-to-postgres.mjs"
Write-Host "  3. Start app: cd backend && npm run dev"
