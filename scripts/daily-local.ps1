# Update promotion data locally and push it once a day.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

$log = Join-Path $repo 'scripts\daily-local.log'
function Write-Log($message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message"
    Write-Output $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

try {
    Write-Log '=== Start ==='

    $envPath = Join-Path $repo '.env'
    if (Test-Path $envPath) {
        Get-Content $envPath | ForEach-Object {
            if ($_ -match '^([A-Z_]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2].Trim() }
        }
    }

    git pull --rebase --quiet
    if ($LASTEXITCODE -ne 0) { throw 'git pull failed' }

    Write-Log 'Crawl promotions started (about 9 minutes)'
    npm run crawl
    if ($LASTEXITCODE -ne 0) { Write-Log 'Promotion crawl ended with errors; partial data may have been saved' }

    Write-Log 'Store location sync started'
    npm run sync:stores
    if ($LASTEXITCODE -ne 0) { Write-Log 'Store location sync failed; keeping existing locations' }

    $deals = Get-ChildItem -Path $repo -Recurse -File -Filter 'deals.json' | Select-Object -First 1
    $status = Get-ChildItem -Path $repo -Recurse -File -Filter 'crawl-status.json' | Select-Object -First 1
    $stores = Get-ChildItem -Path $repo -Recurse -Directory -Filter 'stores' | Select-Object -First 1
    if (!$deals -or !$status -or !$stores) { throw 'Data files were not found' }
    git add -- $deals.FullName $status.FullName $stores.FullName
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Log 'No data changes; skipped commit'
    } else {
        git commit -m "chore: local promotion data update $(Get-Date -Format 'yyyy-MM-dd')"
        git push
        if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
        Write-Log 'Commit and push completed'
    }

    npm run check:crawl
    Write-Log '=== Completed ==='
}
catch {
    Write-Log "!! Stopped: $_"
    exit 1
}
