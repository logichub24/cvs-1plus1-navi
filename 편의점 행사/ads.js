// 토스인앱(Apps in Toss) 광고 SDK 연동.
// 일반 브라우저(GitHub Pages 등)에서는 isSupported()가 false라 전부 조용히 no-op되고,
// 토스 앱 WebView 안에서 열렸을 때만 실제 광고가 붙는다.
//
// 실제 광고 그룹 ID는 앱인토스 콘솔에서 앱 등록 승인 후 발급받아 아래 AD_CONFIG에 채워 넣으면 됨.
// 지금은 문서에 공개된 테스트 ID로 동작 확인용으로 연결해둔 상태.
import { TossAds, loadFullScreenAd, showFullScreenAd } from 'https://esm.sh/@apps-in-toss/web-bridge@2.9.2';

const AD_CONFIG = {
  banner: 'ait-ad-test-banner-id',
  interstitial: 'ait-ad-test-interstitial-id',
  rewarded: 'ait-ad-test-rewarded-id',
};

const INTERSTITIAL_EVERY_N_STORE_OPENS = 3;
let storeOpenCount = 0;
let interstitialReady = false;
let rewardAdReady = false;

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

// 매장 바텀시트를 N번째 열 때 전면 광고 노출 (너무 자주 끼우면 이탈률 올라가므로 빈도 제한)
window.onStoreOpened = function onStoreOpened() {
  storeOpenCount++;
  if (storeOpenCount % INTERSTITIAL_EVERY_N_STORE_OPENS !== 0) return;
  if (!interstitialReady) return;

  showFullScreenAd({
    options: { adGroupId: AD_CONFIG.interstitial },
    onEvent: (event) => {
      if (event.type === 'dismissed' || event.type === 'failedToShow') {
        interstitialReady = false;
        loadInterstitial(); // 다음 노출을 위해 재로드
      }
    },
    onError: () => {},
  });
};

// 보상형 광고 하나로 여러 보상(절약 포인트 2배, 위성 보기 잠금해제 등)을 처리하는 공용 함수.
// onEarned은 실제로 광고를 끝까지 본 경우(userEarnedReward)에만 호출됨.
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

// 위성 보기 잠금해제 - 토스 앱 안에서 광고가 준비됐을 때만 사용.
// 준비 안 됐으면 false를 반환해서 호출 쪽(1_1.html)이 바로 토글하게 둠(웹 버전은 항상 무료).
window.unlockSatelliteWithAd = function unlockSatelliteWithAd(onUnlocked) {
  return requestRewardAd(onUnlocked);
};

function init() {
  if (!TossAds.initialize.isSupported || !TossAds.initialize.isSupported()) return; // 토스 앱이 아니면 전부 스킵

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
};

document.addEventListener('DOMContentLoaded', init);
