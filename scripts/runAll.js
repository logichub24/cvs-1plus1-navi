const fs = require('fs');
const path = require('path');

const { crawlCU } = require('./crawlers/cu');
const { crawlGS25 } = require('./crawlers/gs25');
const { crawlSeven } = require('./crawlers/seven');
const { crawlEmart24 } = require('./crawlers/emart24');

const OUT_PATH = path.join(__dirname, '..', '편의점 행사', 'deals.json');

// 크롤러는 카테고리를 안 주므로 상품명 키워드로 추정한다. 앱의 CATEGORIES 목록과 맞춰야 함.
// 순서가 우선순위 — 위에서부터 먼저 매칭되는 카테고리로 분류한다.
const CATEGORY_RULES = [
  ['아이스크림', /아이스(크림|바)|메로나|설레임|스크류바|비비빅|빠삐코|월드콘|돼지콘|구구콘|하겐다즈|투게더|엑설런트|붕어싸만코|쌍쌍바/],
  ['라면', /라면|우동|쌀국수|짜장|컵면|떡국|만둣국|짬뽕|냉면/],
  ['간편식', /도시락|김밥|샌드위치|버거|햄버거|핫도그|만두|떡볶이|주먹밥|컵밥|덮밥|삼각|핫바|소시지|국밥|죽|스파게티|파스타|치킨|천하장사|어묵/],
  [
    '생활용품',
    /휴지|롤휴지|물티슈|샴푸|린스|치약|칫솔|세제|섬유유연제|마스크|건전지|우산|수세미|면도기|반창고|생리대|라이너|오버나이트|탐폰|팬티라이너|기저귀|배변패드|위생|왁스|좋은\)|쏘피\)|\d+롤(?!케이크)|클린/,
  ],
  ['과자', /과자|칩|스낵|크래커|쿠키|초콜릿|초코파이|캔디|젤리|껌\)|비스킷|파이\)|뿌요|뻥튀기|약과/],
  [
    '음료',
    /콜라|사이다|주스|에이드|음료|워터|생수|우유|커피|라떼|탄산|이온|두유|요구르트|요거트|쉐이크|스무디|식혜|차\)|티\)|에너지드링크|핫식스|몬스터|레드불|비타500|게토레이|파워에이드|토레타|데미소다|식초|액티비아|닥터유|컵커피|바리스타|스프라이트|환타|밀키스|암바사/,
  ],
];

// 위 규칙으로 못 잡았을 때 마지막으로 시도하는 약한 신호: 음료/유제품 용량 표기(500ml, 1L 등)
const WEAK_BEVERAGE_HINT = /\d+\s?(ml|L)\b/i;

function guessCategory(name) {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(name)) return category;
  }
  if (WEAK_BEVERAGE_HINT.test(name)) return '음료';
  return '기타';
}

// 브랜드마다 표기가 조금씩 다른 상품명을 비교검색(MASTER_DB)용으로 묶기 위한 정규화
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[()[\]]/g, ' ')
    .replace(/\d+(ml|g|kg|l|입|개|매)\b/gi, ' ')
    .replace(/[^a-z0-9가-힣]/g, '')
    .trim();
}

function buildMasterDB(brandResults) {
  // brandResults: { CU: [...], GS25: [...], '7-ELEVEN': [...], EMART24: [...] }
  const byNormName = new Map();

  Object.values(brandResults).flat().forEach((item) => {
    if (!item.name || !item.price) return;
    const key = normalizeName(item.name);
    if (!key) return;

    if (!byNormName.has(key)) {
      byNormName.set(key, {
        id: key,
        name: item.name,
        category: guessCategory(item.name),
        price: item.price,
        saving: item.promoType === '2+1' ? Math.round(item.price / 3) : item.price,
        events: {},
      });
    }
    const product = byNormName.get(key);
    product.events[item.brand] = {
      type: item.promoType,
      isNew: false,
      daysLeft: null,
      image: item.image || '',
    };
  });

  return Array.from(byNormName.values());
}

// 기존 deals.json(브랜드별로 합쳐진 형태)에서 특정 브랜드의 항목만 다시 풀어낸다.
// 크롤러가 그날 0건을 반환했을 때, 그 브랜드만 통째로 사라지는 대신
// 전날 데이터를 그대로 유지하기 위한 폴백용.
function extractBrandItemsFromOldDB(oldMasterDB, brand) {
  return oldMasterDB
    .filter((p) => p.events && p.events[brand])
    .map((p) => ({
      brand,
      name: p.name,
      price: p.price,
      promoType: p.events[brand].type,
      image: p.events[brand].image || '',
    }));
}

async function run() {
  let oldMasterDB = [];
  try {
    oldMasterDB = JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8'));
  } catch (e) {
    // 첫 실행 등으로 기존 파일이 없으면 폴백 없이 진행
  }

  const results = {};
  const crawlers = [
    ['CU', crawlCU],
    ['GS25', crawlGS25],
    ['7-ELEVEN', crawlSeven],
    ['EMART24', crawlEmart24],
  ];

  for (const [brand, crawlFn] of crawlers) {
    try {
      results[brand] = await crawlFn();
      console.error(`${brand}: ${results[brand].length}개 수집 완료`);
    } catch (err) {
      console.error(`${brand} 크롤링 실패:`, err.message);
      results[brand] = [];
    }

    // 크롤러가 예외 없이 끝났어도 0건이면 사이트 구조 변경/차단 등으로 의심 -
    // 그 브랜드만 전날 데이터로 대체해서 화면에서 통째로 사라지지 않게 한다.
    if (results[brand].length === 0 && oldMasterDB.length > 0) {
      const fallback = extractBrandItemsFromOldDB(oldMasterDB, brand);
      if (fallback.length > 0) {
        console.error(`${brand}: 0건 수집되어 전날 데이터 ${fallback.length}건으로 대체합니다. (크롤러 점검 필요)`);
        results[brand] = fallback;
      }
    }
  }

  const totalCollected = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
  if (totalCollected === 0) {
    console.error('모든 브랜드 수집에 실패하여 deals.json을 갱신하지 않습니다.');
    process.exit(1);
  }

  const masterDB = buildMasterDB(results);
  fs.writeFileSync(OUT_PATH, JSON.stringify(masterDB, null, 2), 'utf-8');
  console.error(`deals.json 작성 완료: 상품 ${masterDB.length}건 (${OUT_PATH})`);
}

run();
