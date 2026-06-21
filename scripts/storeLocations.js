// 소상공인시장진흥공단 상가(상권)정보 API로 반경 내 편의점을 가져와 4사로 분류해 stores.json에 저장한다.
//
// 사용법: SBIZ_API_KEY=발급받은키 node scripts/storeLocations.js [중심위도] [중심경도] [반경m]
// API 신청: https://www.data.go.kr/data/15012005/openapi.do (무료, 자동승인)
//
// 주의:
// - storeListInRadius는 상호명으로 서버단 필터링을 지원하지 않으므로, 업종코드(indsSclsCd=G20405,
//   상권업종소분류 "편의점")로만 좁혀 받은 뒤 상호명 패턴으로 4사를 클라이언트에서 분류한다.
// - 실제 데이터상 CU는 "씨유"/"CU" 두 표기가 섞여 있고, GS25는 "GS25"/"지에스25"/"지에스" 등으로
//   등록되어 있다. 미니스톱(미니스톱) 등 4사 외 브랜드와 BGF리테일 본사 명의 항목은 제외한다.
// - 반경 파라미터는 한 지점 기준이라 도시 전체를 커버하려면 여러 중심점으로 나눠 호출해야 한다.
//   (1회 호출 = 한 원형 영역. 필요시 격자 좌표 배열로 확장)

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SERVICE_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius';
const OUT_PATH = path.join(__dirname, '..', '편의점 행사', 'stores.json');
const CONVENIENCE_STORE_CODE = 'G20405'; // 상권업종소분류코드: 편의점

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

async function fetchAllInRadius(serviceKey, { lat, lng, radius }) {
  const stores = [];
  let pageNo = 1;
  const numOfRows = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await axios.get(SERVICE_URL, {
      params: {
        serviceKey,
        type: 'json',
        cx: lng,
        cy: lat,
        radius,
        indsSclsCd: CONVENIENCE_STORE_CODE,
        numOfRows,
        pageNo,
      },
      timeout: 20000,
    });

    const body = data && data.body;
    const items = (body && body.items) || [];

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
      });
    });

    const totalCount = (body && body.totalCount) || 0;
    if (pageNo * numOfRows >= totalCount || items.length === 0) break;
    pageNo++;
  }

  return stores;
}

async function run() {
  const serviceKey = process.env.SBIZ_API_KEY;
  if (!serviceKey) {
    console.error('SBIZ_API_KEY 환경변수가 필요합니다. https://www.data.go.kr/data/15012005/openapi.do 에서 발급받으세요.');
    process.exit(1);
  }

  const lat = parseFloat(process.argv[2]) || 37.498095;
  const lng = parseFloat(process.argv[3]) || 127.027610;
  const radius = parseInt(process.argv[4], 10) || 2000;

  const stores = await fetchAllInRadius(serviceKey, { lat, lng, radius });

  const byBrand = stores.reduce((acc, s) => {
    acc[s.brand] = (acc[s.brand] || 0) + 1;
    return acc;
  }, {});
  console.error('브랜드별 매장 수:', byBrand);

  fs.writeFileSync(OUT_PATH, JSON.stringify(stores, null, 2), 'utf-8');
  console.error(`stores.json 작성 완료: 매장 ${stores.length}건 (${OUT_PATH})`);
}

run();
