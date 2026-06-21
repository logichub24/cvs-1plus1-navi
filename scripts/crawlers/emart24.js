const axios = require('axios');
const cheerio = require('cheerio');

const LIST_URL = 'https://www.emart24.co.kr/goods/event';
const PAGE_SIZE = 20;

function parsePrice(text) {
  const n = parseInt(String(text).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function promoTypeFromClass(html) {
  if (html.includes('onepl')) return '1+1';
  if (html.includes('twopl')) return '2+1';
  return null;
}

async function fetchPage(page, categorySeq) {
  const { data } = await axios.get(LIST_URL, {
    params: { page, category_seq: categorySeq, search: '', align: '' },
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });
  const $ = cheerio.load(data);
  const items = [];
  $('div.itemWrap').each((_, el) => {
    const $el = $(el);
    const name = $el.find('.itemTxtWrap .itemtitle p a').text().trim();
    if (!name) return;
    const price = parsePrice($el.find('.itemTxtWrap span a.price').text());
    const badgeHtml = $el.find('.itemTit span.floatR').html() || '';
    const promoType = promoTypeFromClass(badgeHtml) || (categorySeq === '2' ? '2+1' : '1+1');
    const image = $el.find('.itemSpImg img').attr('src') || '';
    items.push({ brand: 'EMART24', name, price, promoType, image });
  });

  const totalMatch = data.match(/totalCount\s*=\s*["'](\d+)["']/);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : items.length;
  return { items, totalCount };
}

async function crawlEmart24({ delayMs = 300 } = {}) {
  const all = [];
  // category_seq: 1 = 1+1, 2 = 2+1
  for (const categorySeq of ['1', '2']) {
    let page = 1;
    let totalPages = 1;
    do {
      const { items, totalCount } = await fetchPage(page, categorySeq);
      if (items.length === 0) break;
      all.push(...items);
      totalPages = Math.ceil(totalCount / PAGE_SIZE);
      page++;
      await new Promise((r) => setTimeout(r, delayMs));
    } while (page <= totalPages);
  }
  return all;
}

module.exports = { crawlEmart24 };

if (require.main === module) {
  crawlEmart24().then((items) => {
    console.log(JSON.stringify(items, null, 2));
    console.error(`EMART24: ${items.length}개 수집`);
  }).catch((err) => {
    console.error('EMART24 크롤링 실패:', err.message);
    process.exit(1);
  });
}
