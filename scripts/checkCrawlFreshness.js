// 브랜드별 데이터가 며칠째 갱신이 멈췄는지 확인한다.
//
// 크롤링이 실패하면 전날 데이터로 대체되기 때문에 화면상으로는 멀쩡해 보인다.
// 실제로 2026-08-11~16에 GS25와 세븐일레븐이 6일간 얼어 있었는데 아무도 몰랐다.
// 워크플로도 계속 초록불이었다.
//
// '이번 실행에서 대체됨'이 아니라 '며칠째 갱신 없음'을 기준으로 삼는 이유:
// GitHub 러너에서는 GS25가 상시 차단돼 매번 대체되는데, PC에서 저녁에 돌리면
// 그날 갱신이 된다. 실행 단위로 보면 매일 경보가 울려 소음이 되고,
// 날짜 기준으로 보면 '진짜 방치된 경우'에만 울린다.
//
// 사용법: npm run check:crawl  (임계일수 변경은 STALE_DAYS 환경변수)

const fs = require('fs');
const path = require('path');

const STATUS_PATH = path.join(__dirname, '..', '편의점 행사', 'crawl-status.json');
const BRANDS = ['CU', 'GS25', '7-ELEVEN', 'EMART24'];
const STALE_DAYS = Number(process.env.STALE_DAYS) || 3;

function daysSince(dateStr) {
  const then = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((today - then) / 86400000);
}

function main() {
  let status = {};
  try {
    status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf-8'));
  } catch (e) {
    console.error(`crawl-status.json을 읽지 못했습니다(${e.message}). 크롤링을 한 번 돌리면 생성됩니다.`);
    process.exit(0); // 파일이 아직 없는 것은 장애가 아니다
  }

  const stale = [];
  for (const brand of BRANDS) {
    const entry = status[brand];
    if (!entry || !entry.lastFreshAt) {
      stale.push({ brand, days: null, note: '수집 기록 없음' });
      continue;
    }
    const d = daysSince(entry.lastFreshAt);
    const label = `${brand}: 마지막 수집 ${entry.lastFreshAt} (${d}일 전, ${entry.count}건)`;
    if (d !== null && d >= STALE_DAYS) {
      stale.push({ brand, days: d, note: label });
    } else {
      console.log(`  OK  ${label}`);
    }
  }

  if (stale.length === 0) {
    console.log(`\n모든 브랜드가 ${STALE_DAYS}일 이내에 갱신되었습니다.`);
    return;
  }

  console.error(`\n${STALE_DAYS}일 이상 갱신이 멈춘 브랜드 ${stale.length}건:`);
  stale.forEach((s) => console.error(`  - ${s.note || s.brand}`));
  console.error('\nPC에서 `npm run crawl`을 돌리면 대부분 해결됩니다.');
  console.error('(GitHub 러너에서는 GS25가 TLS 단계에서 차단되어 실패합니다.)');
  process.exit(1);
}

main();
