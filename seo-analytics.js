/**
 * Eventos de conversión SEO (GA4 gtag o dataLayer).
 * Nunca enviar email, dominio u otra PII.
 */
(function () {
    var BLOCKED_KEYS = {
        email: true,
        domain: true,
        name: true,
        ip: true,
        full_name: true,
        phone: true
    };

    function sanitizeParams(params) {
        var clean = {};
        var src = params || {};
        Object.keys(src).forEach(function (key) {
            if (BLOCKED_KEYS[key]) return;
            var value = src[key];
            if (value == null) return;
            if (typeof value === 'string' && value.indexOf('@') !== -1) return;
            clean[key] = value;
        });
        return clean;
    }

    function track(name, params) {
        var payload = Object.assign({
            page_path: (window.location && window.location.pathname) || ''
        }, sanitizeParams(params));
        if (typeof window.gtag === 'function') {
            window.gtag('event', name, payload);
            return;
        }
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(Object.assign({ event: name }, payload));
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

    window.trackCheckerOutcome = function (toolName, status, extra) {
        track('checker_outcome', Object.assign({
            tool_name: toolName || 'unknown',
            status: status || 'unknown'
        }, sanitizeParams(extra)));
    };

    // No domain / PII. Keep a non-identifying risk signal only.
    window.trackCheckerHighRisk = function (/* domain ignored */) {
        track('checker_high_risk', { status: 'high_risk' });
    };

    window.trackLeadFormEvent = function (name, params) {
        track(name, Object.assign({ tool_name: 'sending_systems' }, sanitizeParams(params)));
    };

    window.trackCtaInformeDemo = function () {
        track('cta_informe_demo', {});
    };

    window.trackCtaFundador = function () {
        track('cta_fundador', {});
    };
})();
