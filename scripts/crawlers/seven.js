const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://www.7-eleven.co.kr';
const FIRST_PAGE_URL = `${BASE}/product/presentList.asp`;
const MORE_URL = `${BASE}/product/listMoreAjax.asp`;
const PAGE_SIZE = 13;

function parsePrice(text) {
  const n = parseInt(String(text).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseItemsFromHtml(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('ul#listUl > li').each((_, el) => {
    const $el = $(el);
    const name = $el.find('.infowrap .name').text().trim() || $el.find('dd.txt_product').text().trim();
    if (!name) return;
    const price = parsePrice($el.find('.infowrap .price span').text());
    const is2plus1 = $el.find('.ico_tag_07').length > 0;
    const rawImg = $el.find('.pic_product img').attr('src') || '';
    const image = rawImg.startsWith('/') && !rawImg.startsWith('//') ? BASE + rawImg : rawImg;
    items.push({ brand: '7-ELEVEN', name, price, promoType: is2plus1 ? '2+1' : '1+1', image });
  });
  return items;
}

async function crawlSeven({ delayMs = 300 } = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0' };
  const { data: firstHtml, status } = await axios.get(FIRST_PAGE_URL, { headers, timeout: 15000 });

  const all = parseItemsFromHtml(firstHtml);
  if (all.length === 0) {
    console.error(`7-ELEVEN: 첫 페이지에서 0건 파싱됨 (status=${status}, html 앞부분: ${String(firstHtml).slice(0, 300).replace(/\s+/g, ' ')})`);
  }

  const totalMatch = firstHtml.match(/intTotalCount\s*=\s*["'](\d+)["']/);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : all.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  for (let page = 2; page <= totalPages; page++) {
    const { data } = await axios.post(
      MORE_URL,
      new URLSearchParams({
        intPageSize: String(PAGE_SIZE),
        intCurrPage: String(page),
        cateCd1: '', cateCd2: '', cateCd3: '', pTab: '',
      }),
      { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, timeout: 15000 }
    );
    const items = parseItemsFromHtml(`<ul id="listUl">${data}</ul>`);
    if (items.length === 0) break;
    all.push(...items);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return all;
}

module.exports = { crawlSeven };

if (require.main === module) {
  crawlSeven().then((items) => {
    console.log(JSON.stringify(items, null, 2));
    console.error(`7-ELEVEN: ${items.length}개 수집`);
  }).catch((err) => {
    console.error('7-ELEVEN 크롤링 실패:', err.message);
    process.exit(1);
  });
}
