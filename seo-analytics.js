/**
 * Eventos de conversión SEO (GA4 gtag o dataLayer).
 * En producción: cargar GA4 antes de este script o definir window.gtag.
 */
(function () {
    function track(name, params) {
        if (typeof window.gtag === 'function') {
            window.gtag('event', name, params || {});
            return;
        }
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(Object.assign({ event: name }, params || {}));
    }

    document.addEventListener('click', function (e) {
        var el = e.target.closest('[data-seo-event]');
        if (!el) return;
        track(el.getAttribute('data-seo-event'), {
            link_url: el.getAttribute('href') || '',
            link_text: (el.textContent || '').trim().slice(0, 80),
        });
    });

    window.trackCheckerSubmit = function (toolName) {
        track('checker_submit', { tool_name: toolName || 'unknown' });
    };

    window.trackCheckerHighRisk = function (domain) {
        track('checker_high_risk', { domain: (domain || '').slice(0, 120) });
    };

    window.trackCtaInformeDemo = function () {
        track('cta_informe_demo', {});
    };

    window.trackCtaFundador = function () {
        track('cta_fundador', {});
    };
})();
