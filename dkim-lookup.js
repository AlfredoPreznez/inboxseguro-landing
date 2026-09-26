/* Interpreta un selector DKIM o el resultado de una búsqueda de selectores habituales.
   No afirma que DKIM falte cuando solo fallan los selectores comunes. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.InboxDkimLookup = api;
})(typeof window !== 'undefined' ? window : null, function () {
    function state(status, text) {
        var labels = {
            ok: 'Correcto',
            attention: 'Requiere atención',
            missing: 'No detectado',
            unknown: 'No verificable'
        };
        return { status: status, label: labels[status], text: text };
    }

    function normalizeDkimSelector(value) {
        var raw = String(value || '').trim().toLowerCase();
        if (!raw) return { ok: true, selector: '' };
        if (!/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/.test(raw)) {
            return { ok: false, selector: '' };
        }
        return { ok: true, selector: raw };
    }

    function publicKey(record) {
        var match = String(record || '').match(/(?:^|;)\s*p\s*=\s*([^;]*)/i);
        return match ? match[1].trim() : null;
    }

    function classifyRecords(records) {
        var rows = records || [];
        var revoked = false;
        var present = false;
        rows.forEach(function (record) {
            var text = String(record || '');
            var key = publicKey(text);
            if (key === '') revoked = true;
            else if (/v\s*=\s*DKIM1/i.test(text) || key) present = true;
        });
        return { present: present, revoked: revoked && !present };
    }

    function interpretSelectorQuery(records, selector, queryOk) {
        var name = selector || 'indicado';
        if (!queryOk) {
            return state('unknown', 'No pudimos consultar el selector «' + name + '». No afirmamos si publica una clave DKIM.');
        }
        var found = classifyRecords(records);
        if (found.present) {
            return state('ok', 'Hay una clave DKIM en el selector «' + name + '». Verificar este registro no demuestra que los mensajes actuales se firmen con él.');
        }
        if (found.revoked) {
            return state('attention', 'El selector «' + name + '» publica p vacío: la clave está revocada y no sirve para verificar firmas nuevas.');
        }
        return state('missing', 'No hay clave DKIM en el selector «' + name + '». Otros selectores pueden existir.');
    }

    function interpretCommonScan(found, selector) {
        if (found && selector) {
            return state('ok', 'Hay una clave DKIM en el selector habitual «' + selector + '». Verificar este registro no demuestra que los mensajes actuales se firmen con él. Pueden existir otros selectores.');
        }
        return state('unknown', 'No apareció una clave DKIM en los selectores habituales. Eso no demuestra que falte DKIM. Si conoces el selector, indícalo en el campo opcional.');
    }

    return {
        normalizeDkimSelector: normalizeDkimSelector,
        interpretSelectorQuery: interpretSelectorQuery,
        interpretCommonScan: interpretCommonScan
    };
});
