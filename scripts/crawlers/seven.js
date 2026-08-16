const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://www.7-eleven.co.kr';
const FIRST_PAGE_URL = `${BASE}/product/presentList.asp`;
const MORE_URL = `${BASE}/product/listMoreAjax.asp`;
const DETAIL_URL = `${BASE}/product/presentView.asp`;
const PAGE_SIZE = 13;
// 15초로는 첫 페이지 응답(약 2초)에 비해 여유가 없어 간헐적으로 끊겼다.
const PAGE_TIMEOUT_MS = 30000;
const IMAGE_BUDGET_MS = 90000;
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

  const { data: firstHtml } = await axios.get(firstUrl, { headers: HEADERS, timeout: PAGE_TIMEOUT_MS });
  const all = parseItemsFromHtml(firstHtml, promoType);

  const totalMatch = firstHtml.match(/intTotalCount\s*=\s*["'](\d+)["']/);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : all.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // 페이지가 60개 넘게 이어지는데, 그중 한 건만 느려도 예전에는 크롤링 전체가 죽었다.
  // (1+1 탭 중간에서 죽으면 2+1 탭은 시작도 못 하고 그날 세븐일레븐 데이터가 통째로 날아간다)
  // 한 번 재시도하고 그래도 안 되면 거기까지 모은 것만 들고 빠져나온다.
  for (let page = 2; page <= totalPages; page++) {
    let data = null;
    for (let attempt = 1; attempt <= 2 && data === null; attempt++) {
      try {
        const res = await axios.post(
          MORE_URL,
          new URLSearchParams({ intPageSize: String(PAGE_SIZE), intCurrPage: String(page), cateCd1: '', cateCd2: '', cateCd3: '', pTab: pTab || '' }),
          { headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, timeout: PAGE_TIMEOUT_MS }
        );
        data = res.data;
      } catch (e) {
        if (attempt === 2) {
          console.error(`7-ELEVEN(${promoType}): page ${page} 실패(${e.message}) - 여기까지 ${all.length}건으로 마감`);
        } else {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    if (data === null) break;

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
  // 이미지 보완은 상품 하나당 요청 1건이라 대상이 많으면 10분을 넘긴다.
  // 이미지는 없어도 이모지로 대체되는 부가 정보이므로 시간 예산을 두고 끊는다.
  // 못 채운 건수는 반드시 남긴다(조용히 잘리면 '원래 이미지가 없는 상품'과 구분이 안 된다).
  const noImgItems = all.filter(item => !item.image && item.pCd);
  if (noImgItems.length > 0) {
    console.error(`7-ELEVEN: 상세 페이지 이미지 보완 대상 ${noImgItems.length}건 (예산 ${IMAGE_BUDGET_MS / 1000}초)`);
    const until = Date.now() + IMAGE_BUDGET_MS;
    let done = 0;
    for (const item of noImgItems) {
      if (Date.now() > until) break;
      item.image = await fetchDetailImage(item.pCd);
      done++;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    console.error(`7-ELEVEN: 이미지 보완 ${done}건 완료, ${noImgItems.length - done}건은 예산 초과로 건너뜀`);
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
