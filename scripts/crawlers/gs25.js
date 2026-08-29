const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const BASE = 'https://gs25.gsretail.com';
const PAGE_URL = `${BASE}/gscvs/ko/products/event-goods`;
const SEARCH_URL = `${BASE}/gscvs/ko/products/event-goods-search`;

const EVENT_TYPES = { '1+1': 'ONE_TO_ONE', '2+1': 'TWO_TO_ONE' };
const FALLBACK_SITE = 'https://pyeondori.com';

function parsePrice(value) {
  const n = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function extractCsrfToken(html) {
  const match = html.match(/name=["']CSRFToken["']\s+value=["']([^"']+)["']/i)
    || html.match(/CSRFToken['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
  return match ? match[1] : null;
}

// GS25가 기존 공개 행사 API를 종료해 0건을 반환할 때만 사용하는 공개 보완 데이터 경로.
// 외부 페이지의 공개 클라이언트 설정을 매 실행 시 읽어 토큰을 코드에 저장하지 않는다.
async function crawlFallbackGS25() {
  const page = (await axios.get(`${FALLBACK_SITE}/store/gs25`, { timeout: 15000 })).data;
  const scripts = [...String(page).matchAll(/<script[^>]+src="([^"]+)/g)].map((match) => match[1]);
  let chunk = '';
  for (const src of scripts) {
    const code = (await axios.get(new URL(src, FALLBACK_SITE).href, { timeout: 15000 })).data;
    if (String(code).includes('.supabase.co')) { chunk = String(code); break; }
  }
  const apiKey = chunk.match(/eyJ[a-zA-Z0-9._-]+/)?.[0];
  const apiBase = chunk.match(/https:\/\/[^"\\]+\.supabase\.co/)?.[0];
  if (!apiKey || !apiBase) throw new Error('GS25 보완 데이터 연결 정보를 찾지 못했습니다.');

  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
  const products = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await axios.get(`${apiBase}/rest/v1/products`, {
      headers,
      params: {
        select: 'product_name,promo_type,price,image_url,year_month',
        store_id: 'eq.2',
        order: 'year_month.desc',
        limit: 1000,
        offset,
      },
      timeout: 15000,
    });
    products.push(...data);
    if (data.length < 1000) break;
  }

  const latestMonth = products[0]?.year_month;
  return products
    .filter((item) => item.year_month === latestMonth && item.product_name && item.price && EVENT_TYPES[item.promo_type])
    .map((item) => ({
      brand: 'GS25',
      name: item.product_name.trim(),
      price: parsePrice(item.price),
      promoType: item.promo_type,
      image: item.image_url || '',
    }));
}

async function crawlGS25({ delayMs = 300 } = {}) {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));
  const headers = { 'User-Agent': 'Mozilla/5.0' };

  const all = [];

  for (const [promoType, code] of Object.entries(EVENT_TYPES)) {
    const { data: pageHtml, status } = await client.get(PAGE_URL, { headers });
    const csrfToken = extractCsrfToken(pageHtml);
    if (!csrfToken) {
      console.error(`GS25: CSRF 토큰을 찾지 못해 ${promoType} 수집을 건너뜁니다. (status=${status}, html 앞부분: ${String(pageHtml).slice(0, 300).replace(/\s+/g, ' ')})`);
      continue;
    }

    let pageNum = 1;
    let totalPages = 1;
    do {
      const { data: raw } = await client.post(
        SEARCH_URL,
        new URLSearchParams({
          pageNum: String(pageNum),
          pageSize: '20',
          searchType: '',
          searchWord: '',
          parameterList: code,
          CSRFToken: csrfToken,
        }),
        {
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: PAGE_URL,
          },
        }
      );

      let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);

      const results = parsed.results || parsed.resultList || [];
      results.forEach((item) => {
        all.push({
          brand: 'GS25',
          name: (item.goodsNm || '').trim(),
          price: parsePrice(item.price),
          promoType: item.eventTypeNm && item.eventTypeNm.includes('2+1') ? '2+1' : '1+1',
          image: item.attFileNm || '',
        });
      });

      totalPages = (parsed.pagination && parsed.pagination.numberOfPages) || 1;
      pageNum++;
      await new Promise((r) => setTimeout(r, delayMs));
    } while (pageNum <= totalPages);
  }

  if (all.length > 0) return all;

  const fallback = await crawlFallbackGS25();
  console.error(`GS25: 기존 공식 API 대신 공개 보완 경로에서 ${fallback.length}개 수집 완료`);
  return fallback;
}

module.exports = { crawlGS25 };

if (require.main === module) {
  crawlGS25().then((items) => {
    console.log(JSON.stringify(items, null, 2));
    console.error(`GS25: ${items.length}개 수집`);
  }).catch((err) => {
    console.error('GS25 크롤링 실패:', err.message);
    process.exit(1);
  });
}
