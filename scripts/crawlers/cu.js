const axios = require('axios');
const cheerio = require('cheerio');

const ENDPOINT = 'https://cu.bgfretail.com/event/plusAjax.do';

function parsePrice(text) {
  const n = parseInt(String(text).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchPage(pageIndex) {
  const { data } = await axios.post(
    ENDPOINT,
    new URLSearchParams({ pageIndex: String(pageIndex), listType: '1', searchCondition: '' }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 15000,
    }
  );
  const $ = cheerio.load(data);
  const items = [];
  $('li.prod_list').each((_, el) => {
    const $el = $(el);
    const name = $el.find('.prod_text .name p').text().trim();
    if (!name) return;
    const price = parsePrice($el.find('.prod_text .price strong').text());
    const badge = $el.find('.badge span').text().trim();
    const promoType = badge.includes('2+1') ? '2+1' : '1+1';
    const rawImg = $el.find('.prod_img img').attr('src') || '';
    const image = rawImg.startsWith('//') ? 'https:' + rawImg : rawImg;
    items.push({ brand: 'CU', name, price, promoType, image });
  });
  return items;
}

async function crawlCU({ maxPages = 60, delayMs = 300 } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchPage(page);
    if (items.length === 0) break;
    all.push(...items);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return all;
}

module.exports = { crawlCU };

if (require.main === module) {
  crawlCU().then((items) => {
    console.log(JSON.stringify(items, null, 2));
    console.error(`CU: ${items.length}개 수집`);
  }).catch((err) => {
    console.error('CU 크롤링 실패:', err.message);
    process.exit(1);
  });
}
