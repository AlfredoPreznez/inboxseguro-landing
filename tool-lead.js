/**
 * Optional post-result lead capture for Email Sender Checker.
 * Backend recalculates signals; frontend only sends email/domain/tool/consent.
 */
(function (root) {
    var ENDPOINT = 'https://panel.inboxseguro.com/api/public/tool-lead-summary';
    var TOOL_NAME = 'sending_systems';
    var CONSENT_SUMMARY_VERSION = 'summary_email_v1';

    function track(name, params) {
        if (typeof root.trackLeadFormEvent === 'function') {
            root.trackLeadFormEvent(name, params || {});
            return;
        }
        if (typeof root.gtag === 'function') {
            root.gtag('event', name, Object.assign({
                page_path: (root.location && root.location.pathname) || '',
                tool_name: TOOL_NAME
            }, params || {}));
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    }

    function setStatus(els, state, message) {
        els.form.classList.toggle('opacity-60', state === 'loading');
        els.submit.disabled = state === 'loading' || state === 'success';
        els.submit.textContent = state === 'loading' ? 'Enviando…' : 'Enviarme el resumen';
        els.message.classList.toggle('hidden', !message);
        els.message.textContent = message || '';
        els.message.className = 'mt-3 text-xs leading-relaxed ' + (
            state === 'error' ? 'text-red-300' :
            state === 'success' ? 'text-emerald-300' : 'text-slate-400'
        );
        els.block.setAttribute('data-lead-state', state);
    }

    function initLeadForm(options) {
        var opts = options || {};
        var block = document.getElementById(opts.blockId || 'leadSummaryBlock');
        if (!block) return null;

        var els = {
            block: block,
            form: document.getElementById('leadSummaryForm'),
            email: document.getElementById('leadSummaryEmail'),
            marketing: document.getElementById('leadSummaryMarketing'),
            submit: document.getElementById('leadSummarySubmit'),
            message: document.getElementById('leadSummaryMessage')
        };

        var currentDomain = '';
        var viewed = false;

        function showForDomain(domain) {
            currentDomain = domain || '';
            block.classList.remove('hidden');
            setStatus(els, 'idle', '');
            if (els.email) els.email.value = '';
            if (els.marketing) els.marketing.checked = false;
            if (!viewed) {
                viewed = true;
                track('lead_form_view', { tool_name: TOOL_NAME, status: 'visible' });
            }
        }

        function hide() {
            block.classList.add('hidden');
            setStatus(els, 'idle', '');
        }

        if (els.form) {
            els.form.addEventListener('submit', function (event) {
                event.preventDefault();
                if (!currentDomain) {
                    setStatus(els, 'error', 'Analiza un dominio antes de pedir el resumen.');
                    track('lead_form_error', { tool_name: TOOL_NAME, status: 'no_domain' });
                    return;
                }
                var email = String(els.email.value || '').trim().toLowerCase();
                if (!isValidEmail(email)) {
                    setStatus(els, 'error', 'Escribe un correo válido, por ejemplo nombre@empresa.com.');
                    track('lead_form_error', { tool_name: TOOL_NAME, status: 'invalid_email' });
                    return;
                }

                track('lead_form_submit', { tool_name: TOOL_NAME, status: 'submit' });
                setStatus(els, 'loading', '');

                fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'omit',
                    body: JSON.stringify({
                        email: email,
                        domain: currentDomain,
                        tool_name: TOOL_NAME,
                        consent_summary: true,
                        consent_summary_version: CONSENT_SUMMARY_VERSION,
                        consent_marketing: !!(els.marketing && els.marketing.checked)
                    })
                }).then(function (res) {
                    return res.json().catch(function () { return {}; }).then(function (data) {
                        return { res: res, data: data };
                    });
                }).then(function (result) {
                    if (result.res.status === 429) {
                        setStatus(els, 'error', 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.');
                        track('lead_form_error', { tool_name: TOOL_NAME, status: 'rate_limit' });
                        return;
                    }
                    if (!result.res.ok || !result.data || result.data.ok === false) {
                        setStatus(els, 'error', (result.data && result.data.message) || 'No pudimos enviar el resumen. Intenta más tarde.');
                        track('lead_form_error', { tool_name: TOOL_NAME, status: 'server' });
                        return;
                    }
                    setStatus(els, 'success', 'Si el correo es válido, te enviaremos el resumen en breve.');
                    track('lead_form_success', { tool_name: TOOL_NAME, status: 'accepted' });
                }).catch(function () {
                    setStatus(els, 'error', 'Error de conexión. Verifica tu internet e inténtalo de nuevo.');
                    track('lead_form_error', { tool_name: TOOL_NAME, status: 'network' });
                });
            });
        }

        return { showForDomain: showForDomain, hide: hide, getDomain: function () { return currentDomain; } };
    }

    root.InboxSeguroToolLead = {
        initLeadForm: initLeadForm,
        isValidEmail: isValidEmail,
        TOOL_NAME: TOOL_NAME,
        CONSENT_SUMMARY_VERSION: CONSENT_SUMMARY_VERSION
    };
})(typeof window !== 'undefined' ? window : globalThis);
