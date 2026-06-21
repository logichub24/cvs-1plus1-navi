// 소상공인시장진흥공단 상가(상권)정보 API의 storeListInUpjong(업종 기반 전국 조회) 엔드포인트로
// 전국 편의점(CU/GS25/세븐일레븐/이마트24)을 가져와 시/도 단위 파일로 쪼개 저장한다.
//
// storeListInRadius는 한 지점 기준 반경(최대 10km) 조회라 전국을 커버하려면 격자 좌표가 필요했지만,
// storeListInUpjong은 업종코드 하나로 전국 데이터를 페이지네이션만으로 받을 수 있어 이 방식을 사용한다.
// (indsSclsCd=G20405 기준 전국 약 55,000여 건, 페이지당 1000건 x 약 56페이지)
//
// 출력:
//   편의점 행사/stores/index.json        - 시/도 목록 + 중심좌표 + 매장수 (앱이 가장 가까운 지역 파일을 고를 때 사용)
//   편의점 행사/stores/<시도명>.json      - 해당 시/도의 매장 목록
//
// 사용법: SBIZ_API_KEY=발급받은키 node scripts/storeLocations.js
// API 신청: https://www.data.go.kr/data/15012005/openapi.do (무료, 자동승인)

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SERVICE_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong';
const OUT_DIR = path.join(__dirname, '..', '편의점 행사', 'stores');
const CONVENIENCE_STORE_CODE = 'G20405'; // 상권업종소분류코드: 편의점
const PAGE_SIZE = 1000;

const BRAND_PATTERNS = [
  { brand: 'CU', pattern: /씨유|CU/i },
  { brand: 'GS25', pattern: /GS|지에스/i },
  { brand: '7-ELEVEN', pattern: /세븐/i },
  { brand: 'EMART24', pattern: /이마트\s?24/i },
];

function classifyBrand(name) {
  for (const { brand, pattern } of BRAND_PATTERNS) {
    if (pattern.test(name)) return brand;
  }
  return null;
}

async function fetchAllStores(serviceKey) {
  const stores = [];
  let pageNo = 1;
  let totalCount = Infinity;

  while ((pageNo - 1) * PAGE_SIZE < totalCount) {
    const { data } = await axios.get(SERVICE_URL, {
      params: {
        serviceKey,
        type: 'json',
        divId: 'indsSclsCd',
        key: CONVENIENCE_STORE_CODE,
        numOfRows: PAGE_SIZE,
        pageNo,
      },
      timeout: 20000,
    });

    const body = data && data.body;
    const items = (body && body.items) || [];
    totalCount = (body && body.totalCount) || items.length;

    items.forEach((item) => {
      const brand = classifyBrand(item.bizesNm || '');
      if (!brand) return; // 4사 외 편의점(미니스톱 등) 또는 본사 명의 항목 제외
      stores.push({
        id: `${brand}_${item.bizesId}`,
        brand,
        name: item.bizesNm,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        address: item.lnoAdr || item.rdnmAdr || '',
        province: item.ctprvnNm || '기타',
      });
    });

    console.error(`storeListInUpjong page ${pageNo} (${items.length}건, 누적 ${stores.length}건 / 전체 ${totalCount}건)`);
    pageNo++;
    await new Promise((r) => setTimeout(r, 150));
  }

  return stores;
}

function groupByProvince(stores) {
  const byProvince = new Map();
  stores.forEach((s) => {
    if (!byProvince.has(s.province)) byProvince.set(s.province, []);
    byProvince.get(s.province).push(s);
  });
  return byProvince;
}

function average(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function run() {
  const serviceKey = process.env.SBIZ_API_KEY;
  if (!serviceKey) {
    console.error('SBIZ_API_KEY 환경변수가 필요합니다. https://www.data.go.kr/data/15012005/openapi.do 에서 발급받으세요.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allStores = await fetchAllStores(serviceKey);
  const byProvince = groupByProvince(allStores);

  const index = [];
  for (const [province, stores] of byProvince.entries()) {
    const fileName = `${province}.json`;
    // province 필드는 파일 분류용으로만 쓰고, 매장 객체 자체에는 굳이 안 남긴다.
    const cleaned = stores.map(({ province: _drop, ...rest }) => rest);
    fs.writeFileSync(path.join(OUT_DIR, fileName), JSON.stringify(cleaned), 'utf-8');

    index.push({
      province,
      file: fileName,
      count: cleaned.length,
      centerLat: average(cleaned.map((s) => s.lat)),
      centerLng: average(cleaned.map((s) => s.lng)),
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');

  const byBrand = allStores.reduce((acc, s) => {
    acc[s.brand] = (acc[s.brand] || 0) + 1;
    return acc;
  }, {});
  console.error('브랜드별 매장 수:', byBrand);
  console.error(`전국 ${allStores.length}건을 시/도 ${index.length}개 파일로 저장 완료 (${OUT_DIR})`);
}

run();
