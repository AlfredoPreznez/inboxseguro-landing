/**
 * Carga GA4 / Clarity solo tras consentimiento explícito.
 * Si aún no hay decisión, muestra el banner de cookies (barra inferior).
 * Persistencia: cookie + localStorage, 365 días.
 */
(function () {
  var CONSENT_KEY = 'inboxseguro_cookie_consent';
  var CONSENT_MAX_AGE_SEC = 365 * 24 * 60 * 60;
  var BANNER_ID = 'inboxseguro-cookie-banner';

  function readConsent() {
    try {
      var fromLs = (localStorage.getItem(CONSENT_KEY) || '').trim();
      if (fromLs === 'accepted' || fromLs === 'essential') return fromLs;
    } catch (e) { /* ignore */ }
    try {
      var parts = (document.cookie || '').split(';');
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (p.indexOf(CONSENT_KEY + '=') === 0) {
          var v = decodeURIComponent(p.slice(CONSENT_KEY.length + 1)).trim();
          if (v === 'accepted' || v === 'essential') return v;
        }
      }
    } catch (e2) { /* ignore */ }
    return null;
  }

  function writeConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (e) { /* ignore */ }
    try {
      var secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie =
        CONSENT_KEY +
        '=' +
        encodeURIComponent(value) +
        '; Path=/; Max-Age=' +
        CONSENT_MAX_AGE_SEC +
        '; SameSite=Lax' +
        secure;
    } catch (e2) { /* ignore */ }
  }

  function loadAnalytics() {
    if (window.__inboxseguroAnalyticsLoaded) return;
    window.__inboxseguroAnalyticsLoaded = true;

    var cfg = window.INBOXSEGURO_ANALYTICS || {};
    var ga4Id = (cfg.ga4Id || '').trim();
    var clarityId = (cfg.clarityId || '').trim();

    if (ga4Id) {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4Id);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', ga4Id);
    }

    if (clarityId) {
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r);
        t.async = 1;
        t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0];
        y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', clarityId);
    }
  }

  function hideBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function applyChoice(value) {
    writeConsent(value);
    hideBanner();
    if (value === 'accepted') loadAnalytics();
  }

  function showBanner() {
    if (document.getElementById(BANNER_ID)) return;

    var wrap = document.createElement('div');
    wrap.id = BANNER_ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Aviso de cookies');
    // Estilos inline: Tailwind no scanea este JS (clases flex/gap/etc. no
    // llegan a styles.css) y el click atravesaba el banner al hero.
    wrap.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;z-index:9999;pointer-events:none;' +
      'padding:12px 16px;box-sizing:border-box;';
    wrap.innerHTML =
      '<div style="pointer-events:auto;position:relative;z-index:1;' +
      'max-width:48rem;margin:0 auto;border-radius:12px;' +
      'border:1px solid rgba(148,163,184,0.55);background:rgba(30,41,59,0.98);' +
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'box-shadow:0 12px 36px rgba(2,6,23,0.55),0 0 0 1px rgba(96,165,250,0.12);' +
      'padding:14px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 14px;' +
      'font-family:inherit;">' +
      '<p style="flex:1 1 16rem;margin:0;min-width:0;font-size:14px;line-height:1.45;' +
      'color:#f1f5f9;">' +
      'Usamos cookies <strong style="color:#fff;font-weight:600;">esenciales</strong> ' +
      'para que el sitio funcione. Si aceptas, también activamos ' +
      '<strong style="color:#fff;font-weight:600;">Google Analytics</strong> ' +
      'para mejorar el producto. ' +
      '<a href="/privacidad" style="color:#93c5fd;text-decoration:underline;' +
      'text-underline-offset:2px;">Política de privacidad</a>.' +
      '</p>' +
      '<div style="display:flex;flex:0 0 auto;flex-wrap:wrap;align-items:center;gap:8px;">' +
      '<button type="button" data-cookie-choice="essential" ' +
      'style="cursor:pointer;padding:8px 12px;border-radius:8px;font-size:13px;' +
      'font-weight:600;color:#e2e8f0;background:rgba(15,23,42,0.55);' +
      'border:1px solid #64748b;">Solo esenciales</button>' +
      '<button type="button" data-cookie-choice="accepted" ' +
      'style="cursor:pointer;padding:8px 14px;border-radius:8px;font-size:13px;' +
      'font-weight:600;color:#fff;background:#2563eb;border:1px solid #3b82f6;">' +
      'Aceptar Analytics</button>' +
      '</div></div>';

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cookie-choice]');
      if (!btn) return;
      var choice = btn.getAttribute('data-cookie-choice');
      if (choice === 'accepted' || choice === 'essential') applyChoice(choice);
    });

    function mount() {
      if (!document.body) return;
      document.body.appendChild(wrap);
    }
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }

  window.InboxSeguroConsent = {
    get: readConsent,
    set: applyChoice,
    loadAnalytics: loadAnalytics,
  };

  var consent = readConsent();
  if (consent === 'accepted') {
    loadAnalytics();
  } else if (consent === 'essential') {
    // sin GA / Clarity
  } else {
    showBanner();
  }
})();
