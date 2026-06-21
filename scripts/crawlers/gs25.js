const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const BASE = 'https://gs25.gsretail.com';
const PAGE_URL = `${BASE}/gscvs/ko/products/event-goods`;
const SEARCH_URL = `${BASE}/gscvs/ko/products/event-goods-search`;

const EVENT_TYPES = { '1+1': 'ONE_TO_ONE', '2+1': 'TWO_TO_ONE' };

function parsePrice(value) {
  const n = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function extractCsrfToken(html) {
  const match = html.match(/name=["']CSRFToken["']\s+value=["']([^"']+)["']/i)
    || html.match(/CSRFToken['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
  return match ? match[1] : null;
}

async function crawlGS25({ delayMs = 300 } = {}) {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));
  const headers = { 'User-Agent': 'Mozilla/5.0' };

  const all = [];

  for (const [promoType, code] of Object.entries(EVENT_TYPES)) {
    const { data: pageHtml } = await client.get(PAGE_URL, { headers });
    const csrfToken = extractCsrfToken(pageHtml);
    if (!csrfToken) {
      console.error(`GS25: CSRF 토큰을 찾지 못해 ${promoType} 수집을 건너뜁니다.`);
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

  return all;
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
