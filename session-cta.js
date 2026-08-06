/**
 * Si hay sesión activa en panel.inboxseguro.com, cambia "Acceso Clientes"
 * por "Ir a mi panel". Usa cookie host-only del panel (credentials include);
 * no requiere SESSION_COOKIE_DOMAIN compartido.
 */
(function () {
  var PANEL = 'https://panel.inboxseguro.com';
  var STATUS_URL = PANEL + '/api/public/session-status';
  var DASHBOARD_URL = PANEL + '/dashboard';

  function isClientAccessLink(a) {
    if (!a || !a.getAttribute) return false;
    var href = (a.getAttribute('href') || '').trim();
    try {
      var u = new URL(href, location.href);
      if (u.hostname !== 'panel.inboxseguro.com') return false;
      if (!/^\/login\/?$/.test(u.pathname)) return false;
    } catch (e) {
      return false;
    }
    var text = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return (
      text.indexOf('acceso') !== -1 ||
      text.indexOf('clientes') !== -1 ||
      text.indexOf('iniciar') !== -1
    );
  }

  function updateLinks(dashboardUrl) {
    var target = dashboardUrl || DASHBOARD_URL;
    var anchors = document.querySelectorAll('a[href*="panel.inboxseguro.com/login"]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (!isClientAccessLink(a)) continue;
      a.href = target;
      a.textContent = 'Ir a mi panel';
      a.setAttribute('data-session-cta', 'logged-in');
    }
  }

  function run() {
    fetch(STATUS_URL, {
      method: 'GET',
      credentials: 'include',
      mode: 'cors',
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.logged_in) return;
        updateLinks(data.dashboard_url || DASHBOARD_URL);
      })
      .catch(function () {
        /* silencioso: landing sigue con Acceso Clientes */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
