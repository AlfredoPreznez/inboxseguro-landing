/* Interpreta respuestas DNS públicas para Email Security Check.
   No inventa actividad de envío ni autorización a partir del MX. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.InboxSeguroEmailSecurity = api;
})(typeof window !== 'undefined' ? window : null, function () {
    var MX_PROVIDERS = [
        { name: 'Google Workspace', pattern: /(^|\.)google\.com$|(^|\.)googlemail\.com$/ },
        { name: 'Microsoft 365', pattern: /(^|\.)protection\.outlook\.com$/ },
        { name: 'Zoho Mail', pattern: /(^|\.)zoho\.com$|(^|\.)zoho\.eu$|(^|\.)zoho\.in$/ }
    ];

    function state(status, text) {
        var labels = {
            ok: 'Correcto',
            attention: 'Requiere atención',
            missing: 'No detectado',
            unknown: 'No verificable'
        };
        return { status: status, label: labels[status], text: text };
    }

    function dnsQuerySucceeded(data) {
        return !!(data && (data.Status === 0 || data.Status === 3));
    }

    function analyzeSpfFromTxt(records, queryOk) {
        if (!queryOk) {
            return state('unknown', 'No pudimos consultar el TXT del dominio, así que no afirmamos si hay SPF.');
        }
        var spf = (records || []).filter(function (record) {
            return String(record || '').toLowerCase().indexOf('v=spf1') === 0;
        });
        if (!spf.length) {
            return state('missing', 'No hay un registro SPF. El dominio no publica qué servidores están autorizados para enviar.');
        }
        if (spf.length > 1) {
            return state('attention', 'Hay más de un registro SPF. Conviene dejar uno solo, porque varios pueden hacer fallar la comprobación.');
        }
        var record = spf[0];
        if (/\+all\b/i.test(record)) {
            return state('attention', 'El SPF termina en +all y autoriza a cualquier servidor. Registro: ' + record);
        }
        if (/(?:~all|-all)\b/i.test(record)) {
            return state('ok', 'Hay un SPF que cierra con ~all o -all. No expandimos los include ni contamos el límite de consultas DNS. Registro: ' + record);
        }
        return state('attention', 'Hay un SPF, pero no cierra con ~all ni -all. Registro: ' + record);
    }

    function dmarcPolicy(record) {
        var match = String(record || '').match(/(?:^|;)\s*p\s*=\s*([^;\s]+)/i);
        return match ? match[1].toLowerCase() : '';
    }

    function analyzeDmarcFromTxt(records, queryOk) {
        if (!queryOk) {
            return state('unknown', 'No pudimos consultar _dmarc, así que no afirmamos si hay DMARC.');
        }
        var dmarc = (records || []).filter(function (record) {
            return String(record || '').toLowerCase().indexOf('v=dmarc1') === 0;
        });
        if (!dmarc.length) {
            return state('missing', 'No hay un registro DMARC. El dominio no publica qué hacer con el correo que no autentica.');
        }
        if (dmarc.length > 1) {
            return state('attention', 'Hay más de un registro DMARC. Conviene publicar uno solo.');
        }
        var policy = dmarcPolicy(dmarc[0]);
        if (policy === 'none') {
            return state('attention', 'La política publicada es p=none. Sirve para recibir informes. No pide a los receptores que aparten o rechacen el correo no autenticado.');
        }
        if (policy === 'quarantine') {
            return state('ok', 'La política publicada es p=quarantine. Los receptores que respetan DMARC pueden apartar el correo no autenticado.');
        }
        if (policy === 'reject') {
            return state('ok', 'La política publicada es p=reject. Los receptores que respetan DMARC pueden rechazar el correo no autenticado.');
        }
        return state('attention', 'Hay un registro DMARC, pero no publica una política p=none, p=quarantine o p=reject reconocible.');
    }

    function analyzeDkimLookup(lookup, queryOk) {
        if (!queryOk || !lookup) {
            return state('unknown', 'No pudimos completar la búsqueda de selectores DKIM.');
        }
        if (lookup.found && lookup.selector) {
            return state('ok', 'Hay una clave DKIM en el selector «' + lookup.selector + '». Solo revisamos selectores habituales; puede haber otros.');
        }
        return state('unknown', 'No apareció una clave DKIM en los selectores habituales. Un selector propio puede existir igual. Esto no demuestra que falte DKIM.');
    }

    function extractMX(data) {
        if (!data || !data.Answer) return [];
        return data.Answer.filter(function (answer) {
            return answer && answer.type === 15;
        }).map(function (answer) {
            var parts = String(answer.data || '').trim().split(/\s+/);
            var priority = parseInt(parts[0], 10);
            var host = parts.slice(1).join(' ').replace(/\.$/, '').toLowerCase();
            if (!host || isNaN(priority)) return null;
            return { priority: priority, host: host };
        }).filter(Boolean).sort(function (a, b) {
            return a.priority - b.priority || a.host.localeCompare(b.host);
        });
    }

    function identifyMxProvider(host) {
        var name = String(host || '').toLowerCase();
        for (var i = 0; i < MX_PROVIDERS.length; i++) {
            if (MX_PROVIDERS[i].pattern.test(name)) return MX_PROVIDERS[i].name;
        }
        return '';
    }

    function analyzeMxRecords(records, queryOk) {
        if (!queryOk) {
            return state('unknown', 'No pudimos consultar los registros MX.');
        }
        var rows = records || [];
        if (!rows.length) {
            return state('missing', 'No hay registros MX. El dominio no publica dónde recibe el correo. Esto no dice quién está autorizado para enviar.');
        }
        var shown = rows.slice(0, 8).map(function (row) {
            return row.priority + ' ' + row.host;
        });
        var providers = [];
        rows.forEach(function (row) {
            var provider = identifyMxProvider(row.host);
            if (provider && providers.indexOf(provider) === -1) providers.push(provider);
        });
        var text = 'MX publicados: ' + shown.join(', ') + '. ';
        text += providers.length
            ? 'El host coincide con ' + providers.join(', ') + '. '
            : 'No identificamos el proveedor solo con el nombre del host. ';
        text += 'El MX indica dónde se recibe el correo. No confirma autorización ni actividad de envío.';
        if (rows.length > 8) text += ' Mostramos 8 de ' + rows.length + '.';
        return state('ok', text);
    }

    return {
        dnsQuerySucceeded: dnsQuerySucceeded,
        analyzeSpfFromTxt: analyzeSpfFromTxt,
        analyzeDmarcFromTxt: analyzeDmarcFromTxt,
        dmarcPolicy: dmarcPolicy,
        analyzeDkimLookup: analyzeDkimLookup,
        extractMX: extractMX,
        identifyMxProvider: identifyMxProvider,
        analyzeMxRecords: analyzeMxRecords
    };
});
