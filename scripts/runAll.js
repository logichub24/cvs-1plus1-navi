const fs = require('fs');
const path = require('path');

const { crawlCU } = require('./crawlers/cu');
const { crawlGS25 } = require('./crawlers/gs25');
const { crawlSeven } = require('./crawlers/seven');
const { crawlEmart24 } = require('./crawlers/emart24');

const OUT_PATH = path.join(__dirname, '..', '편의점 행사', 'deals.json');

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
        category: '미분류',
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

async function run() {
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
      console.error(`${brand} 크롤링 실패, 이전 데이터 유지:`, err.message);
      results[brand] = [];
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
