/* Aviso fire-and-forget cuando alguien usa una herramienta gratis.
   Mismo endpoint que Email Security Check (el panel lo reenvía a Discord).
   Si falla, no bloquea ni rompe la consulta. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.InboxSeguroNotify = api;
})(typeof window !== 'undefined' ? window : null, function () {
    var ENDPOINT = 'https://panel.inboxseguro.com/api/public/diagnosis-notify';

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

    function postPayload(payload) {
        if (!payload.domain || typeof fetch !== 'function') {
            return Promise.resolve({ skipped: true });
        }
        return fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (res) {
            if (!res.ok) throw new Error('notify status ' + res.status);
            return res;
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
        buildPayload: buildPayload,
        notifyToolUse: notifyToolUse,
        notifyLead: notifyLead
    };
});
