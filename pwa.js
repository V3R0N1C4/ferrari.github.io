// Registra il service worker e propone di aggiungere il sito alla schermata Home.
(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker non registrato:', err));
    });
  }

  const DISMISS_KEY = 'pwa-install-dismissed';
  const DISMISS_DAYS = 14;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isMobile = () => window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 900;
  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Su iOS solo Safari può aggiungere alla Home (Chrome/Firefox/Edge iOS hanno CriOS/FxiOS/EdgiOS).
  const isIOSSafari = () => isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

  const recentlyDismissed = () => {
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY));
      return t && Date.now() - t < DISMISS_DAYS * 864e5;
    } catch { return false; }
  };
  const rememberDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  let banner = null;
  const closeBanner = () => { banner?.remove(); banner = null; };

  function showBanner({ text, actionLabel, onAction }) {
    if (banner || isStandalone() || !isMobile() || recentlyDismissed()) return;
    banner = document.createElement('div');
    banner.className = 'pwa-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Installa l\u2019app');
    banner.innerHTML = `
      <img class="pwa-banner-icon" src="assets/icons/icon-192.png" alt="">
      <p class="pwa-banner-text">${text}</p>
      <div class="pwa-banner-actions">
        ${actionLabel ? `<button type="button" class="pwa-banner-install">${actionLabel}</button>` : ''}
        <button type="button" class="pwa-banner-close" aria-label="Chiudi">&times;</button>
      </div>`;
    banner.querySelector('.pwa-banner-close').addEventListener('click', () => { rememberDismiss(); closeBanner(); });
    banner.querySelector('.pwa-banner-install')?.addEventListener('click', onAction);
    document.body.appendChild(banner);
  }

  // Android / Chrome: prompt nativo di installazione.
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner({
      text: '<strong>Installa Ferrari Season Analyzer</strong><span>Aggiungila alla schermata Home come app.</span>',
      actionLabel: 'Installa',
      onAction: async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === 'dismissed') rememberDismiss();
        closeBanner();
      }
    });
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; closeBanner(); });

  // iOS Safari: nessun prompt nativo, mostriamo le istruzioni.
  if (isIOSSafari()) {
    window.addEventListener('load', () => setTimeout(() => showBanner({
      text: '<strong>Aggiungi alla Home</strong><span>Tocca <b>Condividi</b> <span aria-hidden="true">\u2191</span> e poi <b>Aggiungi alla schermata Home</b>.</span>'
    }), 2500));
  }
})();
