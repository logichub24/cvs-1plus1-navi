// 날씨 추천 결과를 눈으로 확인하기 위한 점검 스크립트.
// 데이터가 갱신될 때마다 더운 날/추운 날/비 오는 날 상위 20개를 찍어두고,
// 사람이 봐도 이상한 상품이 보일 때만 규칙을 고치는 방식으로 운영한다.
//
// 규칙을 여기에 복사하지 않고 '편의점 행사/1_1.html'의 [weather-rules] 블록을 그대로
// 읽어서 실행한다. 복사해두면 앱과 점검 결과가 조용히 갈라진다.
//
// 사용법: npm run check:weather

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_DIR = path.join(__dirname, '..', '편의점 행사');
const HTML_PATH = path.join(SRC_DIR, '1_1.html');
const DEALS_PATH = path.join(SRC_DIR, 'deals.json');
const TOP_N = 20;

// 앱이 실제로 쓰는 규칙 블록을 추출한다. 마커가 없으면 조용히 넘어가지 않고 실패시킨다.
function loadWeatherRules() {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const start = html.indexOf('// [weather-rules:start]');
  const end = html.indexOf('// [weather-rules:end]');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('1_1.html에서 [weather-rules] 마커를 찾지 못했습니다. 마커가 지워졌는지 확인하세요.');
  }
  const code = html.slice(start, end);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${code}\nthis.matchesWeather = matchesWeather; this.weatherKeywords = weatherKeywords;`, sandbox);
  return sandbox;
}

// 앱의 renderNearbyFullList와 같은 순서(신규 우선 → 절약액)를 쓴다.
// 다만 '지난 방문 이후 신규'는 사용자별 상태라 여기서는 알 수 없어 절약액 순만 적용한다.
function pick(deals, weather, rules) {
  const wk = rules.weatherKeywords(weather);
  if (!wk) return { msg: '(선선 - 날씨 필터 없음)', matched: [], total: 0 };
  const matched = deals.filter((d) => rules.matchesWeather(d, wk));
  matched.sort((a, b) => (b.saving || 0) - (a.saving || 0));
  return { msg: wk.msg, matched: matched.slice(0, TOP_N), total: matched.length };
}

function main() {
  const rules = loadWeatherRules();
  const deals = JSON.parse(fs.readFileSync(DEALS_PATH, 'utf-8'));

  const scenarios = [
    ['더운 날 (27℃)', { temp: 27, code: 0, precip: 0 }],
    ['추운 날 (5℃)', { temp: 5, code: 0, precip: 0 }],
    ['비 오는 날 (18℃)', { temp: 18, code: 61, precip: 1 }],
  ];

  console.log(`전체 상품 ${deals.length}건 기준 날씨 추천 점검\n`);
  for (const [label, weather] of scenarios) {
    const { msg, matched, total } = pick(deals, weather, rules);
    console.log(`── ${label} · ${msg} · 매칭 ${total}건 중 상위 ${matched.length}개`);
    matched.forEach((d, i) => {
      console.log(`   ${String(i + 1).padStart(2)}. [${d.category}] ${d.name}`);
    });
    console.log('');
  }
  console.log('사람이 봐도 이상한 상품이 있을 때만 1_1.html의 [weather-rules] 블록을 고치세요.');
}

main();
