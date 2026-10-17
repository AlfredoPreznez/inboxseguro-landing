/* Aviso fire-and-forget cuando alguien usa una herramienta gratis.
   Mismo endpoint que Email Security Check (el panel lo reenvía a Discord).
   Si falla, no bloquea ni rompe la consulta.

   Opcional: pide un ticket HMAC al Worker CF y lo envía en headers.
   Si el ticket falla (Worker aún no desplegado), hace POST sin firma —
   válido mientras el panel tenga PUBLIC_DIAGNOSIS_HMAC_REQUIRED=0. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.InboxSeguroNotify = api;
        // Alias usado por diagnóstico / docs del panel.
        root.InboxSeguroDiagnosisNotify = {
            notify: function (opts) {
                return api.notifyToolUse(opts || {});
            }
        };
    }
})(typeof window !== 'undefined' ? window : null, function () {
    var ENDPOINT = 'https://panel.inboxseguro.com/api/public/diagnosis-notify';
    // Preferir ruta en el mismo sitio (CF route); fallback al workers.dev histórico.
    var TICKET_URLS = [
        'https://www.inboxseguro.com/api/diagnosis-ticket',
        'https://inboxseguro-dns-proxy.alfredo-9d8.workers.dev/api/diagnosis-ticket'
    ];

    function buildPayload(input) {
        var data = input || {};
        var tool = String(data.tool || '').trim();
        var domain = String(data.domain || '').trim();
        var email = String(data.email || '').trim();
        var score = data.score == null ? '' : String(data.score);
        var results = data.results && typeof data.results === 'object' ? data.results : {};
        if (tool && score.indexOf(tool + ' · ') !== 0 && score !== tool) {
            score = score ? tool + ' · ' + score : tool;
        }
        var payload = { domain: domain, tool: tool, score: score, results: results };
        if (email) payload.email = email;
        return payload;
    }

    function fetchTicket(domain) {
        if (!domain || typeof fetch !== 'function') {
            return Promise.resolve(null);
        }
        var i = 0;
        function tryNext() {
            if (i >= TICKET_URLS.length) return Promise.resolve(null);
            var url = TICKET_URLS[i++] + '?domain=' + encodeURIComponent(domain);
            return fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' }
            }).then(function (res) {
                if (!res.ok) return tryNext();
                return res.json().then(function (ticket) {
                    if (ticket && ticket.timestamp && ticket.signature) return ticket;
                    return tryNext();
                });
            }).catch(function () {
                return tryNext();
            });
        }
        return tryNext();
    }

    function postPayload(payload) {
        if (!payload.domain || typeof fetch !== 'function') {
            return Promise.resolve({ skipped: true });
        }
        return fetchTicket(payload.domain).then(function (ticket) {
            var headers = { 'Content-Type': 'application/json' };
            if (ticket && ticket.timestamp && ticket.signature) {
                headers['X-Inbox-Diagnosis-Timestamp'] = String(ticket.timestamp);
                headers['X-Inbox-Diagnosis-Signature'] = String(ticket.signature);
            }
            return fetch(ENDPOINT, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            }).then(function (res) {
                if (!res.ok) throw new Error('notify status ' + res.status);
                return res;
            });
        });
    }

    function notifyToolUse(input) {
        try {
            var pending = postPayload(buildPayload(input));
            if (pending && typeof pending.catch === 'function') {
                pending.catch(function (err) { console.warn('Notify failed', err); });
            }
            return pending;
        } catch (err) {
            console.warn('Notify failed', err);
            return Promise.resolve({ skipped: true });
        }
    }

    function notifyLead(input) {
        var payload = buildPayload(input);
        if (!payload.domain) return Promise.reject(new Error('domain required'));
        if (!payload.email) return Promise.reject(new Error('email required'));
        return postPayload(payload);
    }

    return {
        ENDPOINT: ENDPOINT,
        TICKET_URLS: TICKET_URLS,
        buildPayload: buildPayload,
        notifyToolUse: notifyToolUse,
        notifyLead: notifyLead
    };
});
