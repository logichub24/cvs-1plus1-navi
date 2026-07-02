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
  ['아이스크림', /아이스(크림|바|팝)|메로나|설레임|스크류바|비비빅|빠삐코|월드콘|돼지콘|구구콘|하겐다즈|투게더|엑설런트|붕어싸만코|쌍쌍바|더위사냥|뽕따|마시멜로|아이스바|청키몽키/],
  ['라면', /라면|우동|쌀국수|짜장|컵면|떡국|만둣국|짬뽕|냉면|쫄면|소면|당면|잡채/],
  ['간편식', /도시락|김밥|샌드위치|버거|햄버거|핫도그|만두|떡볶이|주먹밥|컵밥|덮밥|삼각|핫바|국밥|죽|스파게티|파스타|치킨|천하장사|어묵|탕수육|갈비|순대|찜닭|꼬치|곰탕|뼈다귀|설렁탕|미역국|육개장|감자탕|부대찌개|해장국|수육|불고기|미트볼|함박|짜글이|교자|크래미|크랩킹|새우볼|참치|명란|장조림|계란찜|수프|후랑크|킬바사|소시지|구이한판/],
  ['스낵·과자', /과자|칩|스낵|크래커|쿠키|초콜릿|초코파이|캔디|젤리|껌\)|비스킷|파이\)|뿌요|뻥튀기|약과|팝콘|씨리얼|그래놀|견과|아몬드|캐슈|땅콩|맥스봉|바나나킥|새우깡|포카칩|꼬깔콘|허니버터|계란과자|빼빼로|에너지바|프로틴바|단백질바|웨이퍼/],
  ['유제품', /요거트|요구르트|요거톡|액티비아|치즈|버터|두유|베지밀|귀리|오트|어메징|요플레|바나나맛우유/],
  ['음료', /콜라|사이다|주스|에이드|음료|워터|생수|우유|커피|라떼|탄산|이온|쉐이크|스무디|식혜|에너지드링크|핫식스|몬스터|레드불|비타500|게토레이|파워에이드|토레타|데미소다|닥터유|컵커피|바리스타|스프라이트|환타|밀키스|암바사|콤부차|아메리카노|티즐|홍차|녹차|이프로|맥콜|아이스티/],
  ['주류', /맥주|소주|막걸리|와인|위스키|하이볼|칵테일|논알콜|무알콜|하이트|클라우드|카스|테라|오비|켈리|필스너|에일|라거|스타우트|버드|하이네켄|아사히|기린|밀러|블랙보리라이트/],
  ['생활용품', /휴지|롤휴지|물티슈|샴푸|린스|치약|칫솔|초극세모|세제|섬유유연제|마스크|KF94|건전지|우산|수세미|면도기|반창고|생리대|라이너|오버나이트|탐폰|팬티라이너|기저귀|배변패드|왁스|쏘피\)|좋은\)|도루코|핸드워시|바디워시|클렌징|로션|선크림|선스틱|에센스|아이크림|토너|마스크팩|스팟패치|콘돔|염색|퍼머|컨디션환|컨디션스틱|\d+롤(?!케이크)|순면|유기농면|오가닛|라엘|디어스킨|예지\)|울날|슬날/],
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

// 이미지 URL에서 EAN-13 바코드 추출
// 세븐일레븐은 경로가 /upload/product/XXXXXXX/YYYYYY.jpg 형태로 분리되어 있어 별도 처리
function extractBarcode(imageUrl) {
  if (!imageUrl) return null;
  const sevenMatch = imageUrl.match(/\/upload\/product\/(\d+)\/(\d+)/);
  if (sevenMatch) {
    const combined = sevenMatch[1] + sevenMatch[2];
    if (combined.length === 13) return combined;
  }
  const ean13 = imageUrl.match(/(?<!\d)(\d{13})(?!\d)/);
  return ean13 ? ean13[1] : null;
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
        barcode: null,
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
    // 바코드가 아직 없으면 이 브랜드 이미지 URL에서 추출 시도
    if (!product.barcode) {
      product.barcode = extractBarcode(item.image);
    }
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

// 재시도 로직: 실패 시 delayMs 간격으로 최대 maxRetries회 재시도
async function withRetry(fn, label, maxRetries = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) console.error(`${label}: ${attempt}번째 시도에서 성공`);
      return result;
    } catch (err) {
      console.error(`${label}: 시도 ${attempt}/${maxRetries} 실패 - ${err.message}`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`${label}: ${maxRetries}회 시도 모두 실패`);
}

// isNew 계산: 이전 deals.json에 없던 상품 ID를 신규로 마킹
function markIsNew(masterDB, oldMasterDB) {
  if (oldMasterDB.length === 0) return; // 첫 실행은 전부 기존 상품으로 간주
  const oldIds = new Set(oldMasterDB.map((p) => p.id));
  let newCount = 0;
  masterDB.forEach((p) => {
    if (!oldIds.has(p.id)) {
      Object.values(p.events).forEach((e) => { e.isNew = true; });
      newCount++;
    }
  });
  console.error(`isNew 계산 완료: 신규 상품 ${newCount}건`);
}

async function run() {
  let oldMasterDB = [];
  try {
    oldMasterDB = JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8'));
    console.error(`기존 deals.json 로드: ${oldMasterDB.length}건`);
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
      results[brand] = await withRetry(() => crawlFn(), brand);
      console.error(`${brand}: ${results[brand].length}개 수집 완료`);
    } catch (err) {
      console.error(`${brand} 크롤링 최종 실패:`, err.message);
      results[brand] = [];
    }

    // 재시도 후에도 0건이면 사이트 구조 변경/차단 등으로 의심 -
    // 그 브랜드만 전날 데이터로 대체해서 화면에서 통째로 사라지지 않게 한다.
    if (results[brand].length === 0 && oldMasterDB.length > 0) {
      const fallback = extractBrandItemsFromOldDB(oldMasterDB, brand);
      if (fallback.length > 0) {
        console.error(`${brand}: 0건 수집되어 전날 데이터 ${fallback.length}건으로 대체합니다. (크롤러 점검 필요)`);
        results[brand] = fallback;
      }
    }

    // 수집량 급감 감지: 전날 대비 30% 이하면 경고
    const oldCount = oldMasterDB.filter((p) => p.events && p.events[brand]).length;
    if (oldCount > 0 && results[brand].length < oldCount * 0.3) {
      console.error(`⚠️  ${brand}: 수집량 급감 감지 (전날 ${oldCount}건 → 오늘 ${results[brand].length}건). 크롤러 점검 권장.`);
    }
  }

  const totalCollected = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
  if (totalCollected === 0) {
    console.error('모든 브랜드 수집에 실패하여 deals.json을 갱신하지 않습니다.');
    process.exit(1);
  }

  const masterDB = buildMasterDB(results);
  markIsNew(masterDB, oldMasterDB);  // 신규 상품 isNew 마킹

  // 세븐일레븐 이미지 없는 상품 → 타 브랜드 이미지로 폴백
  let sevenImgFixed = 0;
  masterDB.forEach((p) => {
    if (p.events['7-ELEVEN'] && !p.events['7-ELEVEN'].image) {
      const fallbackImg = ['CU', 'GS25', 'EMART24'].map((b) => p.events[b]?.image).find((img) => img);
      if (fallbackImg) { p.events['7-ELEVEN'].image = fallbackImg; sevenImgFixed++; }
    }
  });
  if (sevenImgFixed > 0) console.error(`세븐일레븐 이미지 폴백 적용: ${sevenImgFixed}건`);
  fs.writeFileSync(OUT_PATH, JSON.stringify(masterDB, null, 2), 'utf-8');
  console.error(`deals.json 작성 완료: 상품 ${masterDB.length}건 (${OUT_PATH})`);
}

run();
