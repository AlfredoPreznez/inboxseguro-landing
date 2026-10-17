/* Captura de correo tras el resultado de una herramienta gratis.
   Reutiliza el endpoint de notify.js (Discord). Si falla, no rompe la herramienta. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.InboxSeguroToolLead = api;
})(typeof window !== 'undefined' ? window : null, function () {
    var COPY = 'Déjanos tu correo y te contactamos con el detalle de tu diagnóstico.';
    var THANKS = 'Gracias. Recibimos tu correo y te contactaremos con el detalle de tu diagnóstico.';
    var ERR = 'No pudimos enviar tu solicitud. La herramienta sigue disponible; intenta de nuevo en unos segundos.';

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function leadMarkup(opts) {
        var prefix = (opts && opts.idPrefix) || 'toolLead';
        return (
            '<div data-tool-lead class="mt-6 p-5 rounded-xl bg-slate-900/60 border border-white/10 text-left" id="' + escapeHtml(prefix) + 'Wrap">' +
            '<h3 class="text-white font-bold mb-1">Recibe el detalle de tu diagnóstico</h3>' +
            '<p class="text-slate-300 text-sm mb-4">' + COPY + '</p>' +
            '<form id="' + escapeHtml(prefix) + 'Form" class="flex flex-col sm:flex-row gap-3" novalidate>' +
            '<label for="' + escapeHtml(prefix) + 'Email" class="sr-only">Tu correo electrónico</label>' +
            '<input type="email" name="email" id="' + escapeHtml(prefix) + 'Email" required autocomplete="email" ' +
            'aria-label="Tu correo electrónico" placeholder="tu@empresa.com" ' +
            'class="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600">' +
            '<button type="submit" id="' + escapeHtml(prefix) + 'Btn" ' +
            'class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl text-sm">Quiero el detalle</button>' +
            '</form>' +
            '<p id="' + escapeHtml(prefix) + 'Ok" class="hidden mt-3 text-sm text-emerald-400" role="status">' + THANKS + '</p>' +
            '<p id="' + escapeHtml(prefix) + 'Err" class="hidden mt-3 text-sm text-red-400" role="alert">' + ERR + '</p>' +
            '</div>'
        );
    }

    function readValue(maybeFn, fallback) {
        try {
            if (typeof maybeFn === 'function') return maybeFn();
        } catch (err) { /* ignore */ }
        return fallback;
    }

    function bind(root, opts) {
        if (!root || root.getAttribute('data-tool-lead-bound') === '1') return;
        root.setAttribute('data-tool-lead-bound', '1');
        var prefix = (opts && opts.idPrefix) || 'toolLead';
        var form = root.querySelector('#' + prefix + 'Form') || root.querySelector('form');
        var emailInput = root.querySelector('#' + prefix + 'Email') || root.querySelector('input[type="email"]');
        var btn = root.querySelector('#' + prefix + 'Btn') || root.querySelector('button[type="submit"]');
        var ok = root.querySelector('#' + prefix + 'Ok');
        var err = root.querySelector('#' + prefix + 'Err');
        if (!form || !emailInput || !btn) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (ok) ok.classList.add('hidden');
            if (err) err.classList.add('hidden');
            var email = String(emailInput.value || '').trim();
            if (!email || email.indexOf('@') < 1) {
                if (err) err.classList.remove('hidden');
                return;
            }
            var domain = String(readValue(opts.getDomain, opts.domain) || '').trim();
            var score = String(readValue(opts.getScore, opts.score) || '').trim();
            var results = readValue(opts.getResults, opts.results) || {};
            btn.disabled = true;
            var prev = btn.textContent;
            btn.textContent = 'Enviando...';
            var pending;
            try {
                if (!window.InboxSeguroNotify || typeof window.InboxSeguroNotify.notifyLead !== 'function') {
                    throw new Error('notify unavailable');
                }
                pending = window.InboxSeguroNotify.notifyLead({
                    tool: opts.tool || '',
                    domain: domain,
                    email: email,
                    score: score,
                    results: results
                });
            } catch (ex) {
                pending = Promise.reject(ex);
            }
            Promise.resolve(pending).then(function () {
                form.classList.add('hidden');
                if (ok) ok.classList.remove('hidden');
                if (typeof window.gtag === 'function') {
                    window.gtag('event', 'generate_lead', {
                        lead_source: opts.leadSource || opts.tool || 'tool',
                        tool: opts.tool || ''
                    });
                }
            }).catch(function () {
                if (err) err.classList.remove('hidden');
            }).then(function () {
                btn.disabled = false;
                btn.textContent = prev || 'Quiero el detalle';
            });
        });
    }

    function mount(container, opts) {
        if (!container) return null;
        var existing = container.querySelector('[data-tool-lead]');
        if (existing) {
            bind(existing, opts || {});
            return existing;
        }
        var holder = document.createElement('div');
        holder.innerHTML = leadMarkup(opts || {});
        var node = holder.firstElementChild;
        container.appendChild(node);
        bind(node, opts || {});
        return node;
    }

    return {
        COPY: COPY,
        THANKS: THANKS,
        leadMarkup: leadMarkup,
        mount: mount,
        bind: bind
    };
});
