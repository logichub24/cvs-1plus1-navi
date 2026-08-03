// 토스인앱(Apps in Toss) 광고 SDK 연동.
// 일반 브라우저(GitHub Pages 등)에서는 isSupported()가 false라 전부 조용히 no-op되고,
// 토스 앱 WebView 안에서 열렸을 때만 실제 광고가 붙는다.
import { TossAds, loadFullScreenAd, showFullScreenAd, share, getCurrentLocation, Accuracy, requestNotificationAgreement } from '@apps-in-toss/web-bridge';

const AD_CONFIG = {
  banner:       'ait.v2.live.45bb0aad48d04636',
  interstitial: 'ait.v2.live.1c35b52379294244',
  rewarded:     'ait.v2.live.710d4eb070854a59',
};

// ── 전면광고 전략 ───────────────────────────────────────────────────
// 1. 길찾기 실행 전  → 100%
// 2. 앱 종료(pagehide) → 100% (WebView 구조상 실제 발동 불확실)
// 3. 브랜드 변경 시  → 25%, 횟수 제한 없음

let interstitialReady = false;
let rewardAdReady = false;

const AD_BRAND_PROBABILITY = 0.25;

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
        document.getElementById('rewardAdBtn')?.classList.remove('hidden');
        document.getElementById('wishUnlockAdBtn')?.classList.remove('hidden');
      }
    },
    onError: () => { rewardAdReady = false; },
  });
}

function showInterstitial(onAfter) {
  if (!interstitialReady) { if (onAfter) onAfter(); return; }
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

// 리워드 광고 공통. onEarned = 끝까지 시청 시 콜백. 광고 없으면 false 반환.
function requestRewardAd(onEarned, onDismiss) {
  if (!rewardAdReady) return false;
  showFullScreenAd({
    options: { adGroupId: AD_CONFIG.rewarded },
    onEvent: (event) => {
      if (event.type === 'userEarnedReward') onEarned();
      if (event.type === 'dismissed' || event.type === 'failedToShow') {
        rewardAdReady = false;
        loadRewardAd();
        if (onDismiss) onDismiss();
      }
    },
    onError: () => { if (onDismiss) onDismiss(); },
  });
  return true;
}

// ── 전면광고 트리거 1: 길찾기 ──────────────────────────────────────
window.onNavigateToMap = function onNavigateToMap(url) {
  showInterstitial(() => { location.href = url; });
};

// ── 전면광고 트리거 2: 앱 종료 ─────────────────────────────────────
let exitAdShown = false;
window.addEventListener('pagehide', () => {
  if (exitAdShown) return;
  exitAdShown = true;
  showInterstitial(null);
});

// ── 전면광고 트리거 3: 브랜드 변경 ────────────────────────────────
window.onBrandChanged = function onBrandChanged() {
  if (Math.random() >= AD_BRAND_PROBABILITY) return;
  showInterstitial(null);
};


// ── 리워드 2: 찜 목록 무제한 (오늘 하루) ──────────────────────────
window.watchRewardAdForWish = function watchRewardAdForWish() {
  const succeeded = requestRewardAd(
    () => {
      localStorage.setItem('cvs_wishUnlocked', todayStr());
      window.closeWishLimitModal?.();
      // 대기 중이던 찜 아이템 처리
      if (window._pendingLikeId) {
        const id = window._pendingLikeId;
        window._pendingLikeId = null;
        window.toggleLike?.(id);
      }
      window.showToast?.('광고 시청 완료! 오늘 하루 찜 목록을 무제한으로 사용할 수 있어요 💝');
    },
    () => { window.closeWishLimitModal?.(); }
  );
  if (!succeeded) {
    // 광고 미준비 시 무료 허용 (웹 환경)
    localStorage.setItem('cvs_wishUnlocked', todayStr());
    window.closeWishLimitModal?.();
    if (window._pendingLikeId) {
      const id = window._pendingLikeId;
      window._pendingLikeId = null;
      window.toggleLike?.(id);
    }
  }
};

// ── 리워드 3: 5km 반경 검색 ───────────────────────────────────────
window.watchRewardAdForRadius = function watchRewardAdForRadius() {
  const succeeded = requestRewardAd(
    () => {
      window.setRadius?.(5000);
      window.showToast?.('광고 시청 완료! 반경 5km 검색이 열렸습니다 🗺️');
    },
    () => { window.showToast?.('광고를 끝까지 시청해야 5km 검색이 열립니다.'); }
  );
  if (!succeeded) {
    // 광고 미준비 시 무료 허용 (웹 환경)
    window.setRadius?.(5000);
  }
};

// ── 토스 SDK 유틸 ─────────────────────────────────────────────────
window.tossShare = function tossShare(message) {
  return share({ message });
};

window.tossGetCurrentLocation = function tossGetCurrentLocation() {
  return getCurrentLocation({ accuracy: Accuracy.Balanced });
};

// 토스 알림 동의. 실제 발송은 토스 콘솔에 등록한 템플릿으로 서버가 보내므로
// 앱이 하는 일은 "동의를 받아두는 것"까지다. (WebView에는 서비스워커/Notification이
// 없어서 기존 로컬 알림 방식은 토스 안에서 아예 발동하지 않았다.)
// TEMPLATE_CODE는 토스 콘솔에서 발급받은 값으로 채워야 동작한다.
const NOTIFICATION_TEMPLATE_CODE = '';

window.tossNotificationSupported = function tossNotificationSupported() {
  return Boolean(NOTIFICATION_TEMPLATE_CODE)
    && requestNotificationAgreement.isSupported
    && requestNotificationAgreement.isSupported();
};

window.tossRequestNotificationAgreement = function tossRequestNotificationAgreement() {
  return new Promise(resolve => {
    if (!window.tossNotificationSupported()) { resolve(false); return; }
    requestNotificationAgreement({
      options: { templateCode: NOTIFICATION_TEMPLATE_CODE },
      onEvent: result => resolve(result.type === 'newAgreement' || result.type === 'alreadyAgreed'),
      onError: () => resolve(false),
    });
  });
};

function init() {
  if (!TossAds.initialize.isSupported || !TossAds.initialize.isSupported()) return;
  document.body.classList.add('in-toss-app');
  const wrap = document.getElementById('adBannerWrap');
  if (wrap) { wrap.classList.remove('hidden'); wrap.classList.add('flex'); }
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
