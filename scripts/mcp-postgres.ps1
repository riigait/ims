$envPath = Join-Path $PSScriptRoot '..\backend\.env'
$databaseUrlLine = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1

if (-not $databaseUrlLine) {
    throw 'DATABASE_URL is not configured in backend/.env'
}

$databaseUrl = ($databaseUrlLine -split '=', 2)[1].Trim().Trim('"').Trim("'")

& npx.cmd -y '@modelcontextprotocol/server-postgres' $databaseUrl
exit $LASTEXITCODE
