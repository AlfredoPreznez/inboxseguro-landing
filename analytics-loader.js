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
    // Inline z-index + pointer-events: Tailwind no scanea este JS, así que
    // clases como pointer-events-auto no existen en styles.css y el click
    // atravesaba el banner hacia el main (hero z-10).
    wrap.className = 'fixed bottom-0 inset-x-0 p-4 md:p-6';
    wrap.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;z-index:9999;pointer-events:none;';
    wrap.innerHTML =
      '<div class="mx-auto max-w-5xl rounded-2xl border border-slate-700/80 ' +
      'bg-slate-900/95 backdrop-blur-md shadow-2xl shadow-slate-900/40 ' +
      'px-5 py-5 md:px-8 md:py-6 flex flex-col md:flex-row md:items-center gap-5" ' +
      'style="pointer-events:auto;position:relative;z-index:1;">' +
      '<div class="flex-1 min-w-0">' +
      '<p class="text-base text-slate-200 leading-relaxed">' +
      'Usamos cookies <span class="font-semibold text-white">esenciales</span> para el funcionamiento ' +
      'del sitio y, si aceptas, ' +
      '<span class="font-semibold text-white">analíticas (Google Analytics)</span> para mejorar InboxSeguro. ' +
      'Más info en nuestra ' +
      '<a href="/privacidad" class="text-blue-400 hover:text-blue-300 underline underline-offset-2">Política de privacidad</a>.' +
      '</p></div>' +
      '<div class="flex flex-shrink-0 flex-wrap items-center gap-3 w-full md:w-auto">' +
      '<button type="button" data-cookie-choice="essential" ' +
      'class="flex-1 md:flex-none px-5 py-2.5 rounded-lg text-base font-semibold text-slate-300 ' +
      'border border-slate-600 hover:bg-slate-800 transition">Solo esenciales</button>' +
      '<button type="button" data-cookie-choice="accepted" ' +
      'class="flex-1 md:flex-none px-5 py-2.5 rounded-lg text-base font-semibold text-white ' +
      'bg-brand-600 hover:bg-brand-700 shadow-lg shadow-blue-600/20 transition">Aceptar</button>' +
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
