# PC에서 매일 저녁 행사 데이터를 갱신하고 푸시하는 스크립트.
#
# GitHub Actions 러너에서는 GS25(TLS 차단)와 공공데이터포털 매장 API가 막혀 있어
# 일부 브랜드가 전날 데이터로 대체된다. PC에서는 전부 정상 수집되므로,
# 저녁에 한 번 돌려 4사를 모두 갱신한다. Actions는 백업으로 계속 둔다.
#
# 등록 예시 (관리자 권한 PowerShell, 매일 20:00):
#   schtasks /create /tn "cvs-daily-crawl" /tr "powershell -NoProfile -ExecutionPolicy Bypass -File E:\C-APP\scripts\daily-local.ps1" /sc daily /st 20:00

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

$log = Join-Path $repo 'scripts\daily-local.log'
function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Write-Output $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

try {
    Write-Log '=== 시작 ==='

    # .env의 SBIZ_API_KEY를 읽어 매장 동기화에 쓴다 (공개 저장소에 키를 두지 않기 위함)
    $envPath = Join-Path $repo '.env'
    if (Test-Path $envPath) {
        Get-Content $envPath | ForEach-Object {
            if ($_ -match '^([A-Z_]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2].Trim() }
        }
    }

    # 원격에 새벽 자동 갱신 커밋이 있으므로 먼저 맞춘다
    git pull --rebase --quiet
    if ($LASTEXITCODE -ne 0) { throw 'git pull 실패 - 충돌이 있는지 확인하세요' }

    Write-Log '행사 크롤링 시작 (약 9분)'
    npm run crawl
    if ($LASTEXITCODE -ne 0) { Write-Log '크롤링이 실패로 끝났습니다(부분 수집일 수 있음)' }

    Write-Log '매장 위치 동기화'
    npm run sync:stores
    if ($LASTEXITCODE -ne 0) { Write-Log '매장 동기화 실패 - 좌표는 거의 안 바뀌므로 넘어갑니다' }

    git add "편의점 행사/deals.json" "편의점 행사/crawl-status.json" "편의점 행사/stores"
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Log '변경 없음 - 커밋 생략'
    } else {
        git commit -m "chore: 행사/매장 데이터 로컬 갱신 $(Get-Date -Format 'yyyy-MM-dd')"
        git push
        if ($LASTEXITCODE -ne 0) { throw 'git push 실패' }
        Write-Log '커밋·푸시 완료'
    }

    npm run check:crawl
    Write-Log '=== 정상 종료 ==='
}
catch {
    Write-Log "!! 중단: $_"
    exit 1
}
