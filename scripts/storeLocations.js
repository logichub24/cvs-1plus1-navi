// 소상공인시장진흥공단 상가(상권)정보 API로 CU/GS25/세븐일레븐/이마트24 매장 위치를 가져와
// stores.json으로 저장한다.
//
// 사용법: SBIZ_API_KEY=발급받은키 node scripts/storeLocations.js [중심위도] [중심경도] [반경m]
//
// API 신청: https://www.data.go.kr/data/15012005/openapi.do (무료, 즉시 승인)

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SERVICE_URL = 'http://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius';
const OUT_PATH = path.join(__dirname, '..', '편의점 행사', 'stores.json');

// 상가업소정보의 표준산업분류/업종 검색은 상호명 키워드 기반이 가장 안정적이라
// brandKeyword로 필터링한다 (업종코드는 지역마다 갱신 주기가 달라 상호명 매칭이 더 정확함).
const BRANDS = [
  { brand: 'CU', keyword: 'CU' },
  { brand: 'GS25', keyword: 'GS25' },
  { brand: '7-ELEVEN', keyword: '세븐일레븐' },
  { brand: 'EMART24', keyword: '이마트24' },
];

async function fetchStoresForBrand(serviceKey, { brand, keyword }, { lat, lng, radius }) {
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
        indsLclsCd: '', // 업종 대분류 필터는 비워두고 상호명으로 거름
        bizesNm: keyword,
        pageNo,
        numOfRows,
      },
      timeout: 20000,
    });

    const body = data && data.body;
    const items = (body && body.items) || [];
    items.forEach((item) => {
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
  const radius = parseInt(process.argv[4], 10) || 5000; // API 최대 반경 제약 확인 필요(보통 1~2km 권장, 필요시 분할 호출)

  const allStores = [];
  for (const brandInfo of BRANDS) {
    try {
      const stores = await fetchStoresForBrand(serviceKey, brandInfo, { lat, lng, radius });
      console.error(`${brandInfo.brand}: ${stores.length}개 매장 조회`);
      allStores.push(...stores);
    } catch (err) {
      console.error(`${brandInfo.brand} 매장 조회 실패:`, err.message);
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(allStores, null, 2), 'utf-8');
  console.error(`stores.json 작성 완료: 매장 ${allStores.length}건 (${OUT_PATH})`);
}

run();
