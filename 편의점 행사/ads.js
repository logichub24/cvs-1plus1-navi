// 토스인앱(Apps in Toss) 광고 SDK 연동.
// 일반 브라우저(GitHub Pages 등)에서는 isSupported()가 false라 전부 조용히 no-op되고,
// 토스 앱 WebView 안에서 열렸을 때만 실제 광고가 붙는다.
//
// 앱인토스 콘솔에서 발급받은 실제 광고 그룹 ID.
import { TossAds, loadFullScreenAd, showFullScreenAd, share, getCurrentLocation, Accuracy } from 'https://esm.sh/@apps-in-toss/web-bridge@2.9.2';

const AD_CONFIG = {
  banner: 'ait.v2.live.45bb0aad48d04636',
  interstitial: 'ait.v2.live.1c35b52379294244',
  rewarded: 'ait.v2.live.710d4eb070854a59',
};

// ── 전면광고 노출 전략 ──────────────────────────────────────────────
// 1. 길찾기 실행 전  → 100% 노출 (사용자가 이미 이동 결심한 시점)
// 2. 앱 종료 시     → 100% 노출 (사용 완료 시점)
// 3. 브랜드 변경 시 → 30% 확률, 하루 최대 2회 (반복 사용 방해 최소화)
// ✗ 제거: 매장 N번 열기마다 → 탐색 흐름 방해로 이탈률 원인

let interstitialReady = false;
let rewardAdReady = false;

// 브랜드 변경 광고 빈도 제어
const AD_BRAND_DAILY_MAX = 2;
const AD_BRAND_PROBABILITY = 0.3;
let brandAdTodayCount = 0;
let brandAdLastDate = '';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadInterstitial() {
  if (!loadFullScreenAd.isSupported || !loadFullScreenAd.isSupported()) return;
  loadFullScreenAd({
    options: { adGroupId: AD_CONFIG.interstitial },
    onEvent: (event) => { if (event.type === 'loaded') interstitialReady = true; },
    onError: () => { interstitialReady = false; },
  });
}

function loadRewardAd() {
  if (!loadFullScreenAd.isSupported || !loadFullScreenAd.isSupported()) return;
  loadFullScreenAd({
    options: { adGroupId: AD_CONFIG.rewarded },
    onEvent: (event) => {
      if (event.type === 'loaded') {
        rewardAdReady = true;
        const btn = document.getElementById('rewardAdBtn');
        if (btn) btn.classList.remove('hidden');
      }
    },
    onError: () => { rewardAdReady = false; },
  });
}

// 전면광고 노출 공통 함수. onAfter는 광고가 닫힌 뒤(또는 광고 없을 때) 즉시 실행할 콜백.
function showInterstitial(onAfter) {
  if (!interstitialReady) {
    if (onAfter) onAfter();
    return;
  }
  showFullScreenAd({
    options: { adGroupId: AD_CONFIG.interstitial },
    onEvent: (event) => {
      if (event.type === 'dismissed' || event.type === 'failedToShow') {
        interstitialReady = false;
        loadInterstitial();
        if (onAfter) onAfter();
      }
    },
    onError: () => { if (onAfter) onAfter(); },
  });
}

// ── 광고 트리거 1: 길찾기 실행 전 ──────────────────────────────────
// 1_1.html의 openDirections()가 직접 window.open 하는 대신 이 함수를 호출.
// 광고 닫히면 실제 지도 앱이 열린다.
window.onNavigateToMap = function onNavigateToMap(url) {
  showInterstitial(() => { window.open(url, '_blank'); });
};

// ── 광고 트리거 2: 앱 종료 (뒤로가기) ─────────────────────────────
// 토스 앱의 네이티브 뒤로가기는 popstate 또는 visibilitychange로 잡기 어려우므로
// pagehide + visibilitychange 조합으로 최선을 다해 탐지한다.
// 광고가 준비된 경우에만 노출 (종료를 막으면 UX 해침).
let exitAdShown = false;
window.addEventListener('pagehide', () => {
  if (exitAdShown) return;
  exitAdShown = true;
  showInterstitial(null); // onAfter 없음 — 앱 종료 흐름을 막지 않음
});

// ── 광고 트리거 3: 브랜드 변경 ────────────────────────────────────
// 하루 최대 AD_BRAND_DAILY_MAX회, AD_BRAND_PROBABILITY 확률로 노출.
window.onBrandChanged = function onBrandChanged() {
  const today = todayStr();
  if (brandAdLastDate !== today) { brandAdTodayCount = 0; brandAdLastDate = today; }
  if (brandAdTodayCount >= AD_BRAND_DAILY_MAX) return;
  if (Math.random() >= AD_BRAND_PROBABILITY) return;
  brandAdTodayCount++;
  showInterstitial(null);
};

// ── 보상형 광고 ────────────────────────────────────────────────────
function requestRewardAd(onEarned) {
  if (!rewardAdReady) return false;
  showFullScreenAd({
    options: { adGroupId: AD_CONFIG.rewarded },
    onEvent: (event) => {
      if (event.type === 'userEarnedReward') onEarned();
      if (event.type === 'dismissed' || event.type === 'failedToShow') {
        rewardAdReady = false;
        document.getElementById('rewardAdBtn')?.classList.add('hidden');
        loadRewardAd();
      }
    },
    onError: () => {},
  });
  return true;
}

// "내 지갑"의 [광고 보고 절약 포인트 2배 받기] 버튼
window.watchRewardAdForBonus = function watchRewardAdForBonus() {
  if (!window.purchasedHistory || window.purchasedHistory.length === 0) return;
  requestRewardAd(() => {
    const last = window.purchasedHistory[0];
    window.addSavings(last.amount, `${last.name} (광고 보너스)`);
  });
};

// 위성 보기 잠금해제 — 토스 앱 안에서 광고가 준비됐을 때만 사용.
window.unlockSatelliteWithAd = function unlockSatelliteWithAd(onUnlocked) {
  return requestRewardAd(onUnlocked);
};

// ── 토스 SDK 유틸 ─────────────────────────────────────────────────
window.tossShare = function tossShare(message) {
  return share({ message });
};

window.tossGetCurrentLocation = function tossGetCurrentLocation() {
  return getCurrentLocation({ accuracy: Accuracy.Balanced });
};

function init() {
  if (!TossAds.initialize.isSupported || !TossAds.initialize.isSupported()) return;

  document.body.classList.add('in-toss-app');

  TossAds.initialize({
    callbacks: {
      onInitialized: () => {
        const slot = document.getElementById('adBannerSlot');
        if (slot) TossAds.attachBanner(AD_CONFIG.banner, slot);
        loadInterstitial();
        loadRewardAd();
      },
    },
  });
}

document.addEventListener('DOMContentLoaded', init);
