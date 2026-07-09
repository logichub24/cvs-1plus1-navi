const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://www.7-eleven.co.kr';
const FIRST_PAGE_URL = `${BASE}/product/presentList.asp`;
const MORE_URL = `${BASE}/product/listMoreAjax.asp`;
const DETAIL_URL = `${BASE}/product/presentView.asp`;
const PAGE_SIZE = 13;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Referer': `${BASE}/product/presentList.asp`,
};

function parsePrice(text) {
  const n = parseInt(String(text).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseItemsFromHtml(html, promoType) {
  const $ = cheerio.load(html);
  const items = [];
  $('ul#listUl > li').each((_, el) => {
    const $el = $(el);
    const name = $el.find('.infowrap .name').text().trim() || $el.find('dd.txt_product').text().trim();
    if (!name) return;
    const price = parsePrice($el.find('.infowrap .price span').text());

    const rawImg = $el.find('.pic_product img').attr('src') || '';
    let image = rawImg.startsWith('/') && !rawImg.startsWith('//') ? BASE + rawImg : rawImg;
    if (image.includes('product_list_01') || !rawImg) image = '';

    // 상세 페이지 코드 추출 (이미지 없는 상품 보완용)
    const pCdHref = $el.find('a[href*=fncGoView]').attr('href') || '';
    const pCd = pCdHref.match(/fncGoView\('(\d+)'\)/)?.[1] || null;

    items.push({ brand: '7-ELEVEN', name, price, promoType, image, pCd });
  });
  return items;
}

async function fetchDetailImage(pCd) {
  if (!pCd) return '';
  try {
    const { data } = await axios.post(
      DETAIL_URL,
      new URLSearchParams({ pCd }),
      { headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );
    const $ = cheerio.load(data);
    const rawImg = $('link[rel="image_src"]').attr('href') || $('meta[property="og:image"]').attr('content') || '';
    if (rawImg && rawImg.includes('/upload/product/')) {
      return rawImg.startsWith('http') ? rawImg : BASE + rawImg;
    }
    const uploadImg = data.match(/\/upload\/product\/\d+\/\d+\.[\w]+/)?.[0];
    return uploadImg ? BASE + uploadImg : '';
  } catch {
    return '';
  }
}

async function crawlTab(pTab, delayMs) {
  const firstUrl = pTab ? `${FIRST_PAGE_URL}?pTab=${pTab}` : FIRST_PAGE_URL;
  const promoType = pTab === '2' ? '2+1' : '1+1';

  const { data: firstHtml } = await axios.get(firstUrl, { headers: HEADERS, timeout: 15000 });
  const all = parseItemsFromHtml(firstHtml, promoType);

  const totalMatch = firstHtml.match(/intTotalCount\s*=\s*["'](\d+)["']/);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : all.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  for (let page = 2; page <= totalPages; page++) {
    const { data } = await axios.post(
      MORE_URL,
      new URLSearchParams({ intPageSize: String(PAGE_SIZE), intCurrPage: String(page), cateCd1: '', cateCd2: '', cateCd3: '', pTab: pTab || '' }),
      { headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, timeout: 15000 }
    );
    const items = parseItemsFromHtml(`<ul id="listUl">${data}</ul>`, promoType);
    if (items.length === 0) break;
    all.push(...items);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return all;
}

async function crawlSeven({ delayMs = 300 } = {}) {
  // 1+1 탭과 2+1 탭 각각 순차 수집
  const tab1 = await crawlTab('1', delayMs);
  const tab2 = await crawlTab('2', delayMs);

  // 중복 제거 (상품명 기준, 1+1 우선)
  const seen = new Map();
  for (const item of [...tab1, ...tab2]) {
    if (!seen.has(item.name)) seen.set(item.name, item);
  }
  const all = Array.from(seen.values());

  // 이미지 없는 상품 → 상세 페이지에서 이미지 보완 (pCd 있는 것만)
  const noImgItems = all.filter(item => !item.image && item.pCd);
  if (noImgItems.length > 0) {
    console.error(`7-ELEVEN: 상세 페이지 이미지 보완 대상 ${noImgItems.length}건`);
    for (const item of noImgItems) {
      item.image = await fetchDetailImage(item.pCd);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // pCd 필드 제거 (deals.json에 불필요)
  return all.map(({ pCd, ...rest }) => rest);
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
