/* InboxScore: puntaje 0-100 a partir de señales DNS públicas (SPF, DKIM, DMARC, listas negras).
   Lógica pura y testeable; la página aporta las consultas DNS. Es una señal externa, no una garantía. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.InboxScore = api;
})(typeof window !== 'undefined' ? window : null, function () {
    var WEIGHTS = { spf: 25, dkim: 20, dmarc: 35, rbl: 20 };

    function tag(record, name) {
        var m = String(record || '').match(new RegExp('(?:^|;)\\s*' + name + '\\s*=\\s*([^;]*)', 'i'));
        return m ? m[1].trim() : null;
    }

    function scoreSpf(records, queryOk) {
        var max = WEIGHTS.spf;
        if (!queryOk) return { key: 'spf', name: 'SPF', max: max, points: null, status: 'unknown', detail: 'No pudimos consultar el TXT del dominio. Esta sección no cuenta en el puntaje.', fixes: [] };
        var spf = (records || []).filter(function (r) { return /^v=spf1(\s|$)/i.test(String(r).trim()); });
        if (!spf.length) return { key: 'spf', name: 'SPF', max: max, points: 0, status: 'missing', record: '', detail: 'No hay registro SPF.', fixes: ['Publica un único TXT en la raíz del dominio que liste a tus proveedores de envío y termine en ~all o -all. Ejemplo para Google Workspace: v=spf1 include:_spf.google.com ~all'] };
        if (spf.length > 1) return { key: 'spf', name: 'SPF', max: max, points: 5, status: 'attention', record: spf.join(' | '), detail: 'Hay ' + spf.length + ' registros SPF. Con más de uno, la verificación SPF devuelve error (permerror).', fixes: ['Fusiona todos los mecanismos en un solo registro v=spf1 y elimina los demás.'] };
        var r = spf[0];
        var lookups = (r.match(/\b(include:|a\b|a:|mx\b|mx:|exists:|redirect=|ptr)/gi) || []).length;
        var res;
        if (/[+]all\b/i.test(r) || /\sall\b/i.test(' ' + r.replace(/[-~?+]all/gi, ''))) res = { points: 0, status: 'attention', detail: 'El SPF termina en +all: autoriza a cualquier servidor del mundo a enviar como tu dominio.', fixes: ['Reemplaza +all por ~all (o -all cuando tengas todos tus remitentes listados).'] };
        else if (/-all\b/i.test(r)) res = { points: 25, status: 'ok', detail: 'SPF único que cierra con -all (rechazo estricto).', fixes: [] };
        else if (/~all\b/i.test(r)) res = { points: 22, status: 'ok', detail: 'SPF único que cierra con ~all (fallo suave). Es una configuración habitual y válida, sobre todo junto a DMARC.', fixes: ['Opcional: cuando confirmes que todos tus remitentes están incluidos, puedes pasar a -all.'] };
        else if (/\?all\b/i.test(r)) res = { points: 10, status: 'attention', detail: 'El SPF cierra con ?all (neutral): no indica qué hacer con remitentes no autorizados.', fixes: ['Cambia ?all por ~all o -all.'] };
        else if (/redirect=/i.test(r)) res = { points: 22, status: 'ok', detail: 'El SPF delega en otro dominio con redirect=. No evaluamos el registro de destino.', fixes: [] };
        else res = { points: 10, status: 'attention', detail: 'El SPF no tiene un mecanismo all final.', fixes: ['Agrega ~all o -all al final del registro.'] };
        if (lookups > 10) { res.points = Math.min(res.points, 12); res.status = 'attention'; res.fixes.push('El registro tiene más de 10 mecanismos que consumen consultas DNS en el primer nivel; supera el límite de SPF. Reduce include o usa un proveedor de aplanado.'); }
        res.key = 'spf'; res.name = 'SPF'; res.max = max; res.record = r;
        return res;
    }

    function scoreDkim(lookup, queryOk) {
        var max = WEIGHTS.dkim;
        if (!queryOk || !lookup) return { key: 'dkim', name: 'DKIM', max: max, points: null, status: 'unknown', detail: 'No pudimos completar la búsqueda de selectores DKIM. Esta sección no cuenta en el puntaje.', fixes: [] };
        if (lookup.found) return { key: 'dkim', name: 'DKIM', max: max, points: 20, status: 'ok', record: 'selector ' + lookup.selector, detail: 'Hay una clave DKIM publicada en el selector habitual «' + lookup.selector + '». Publicar la clave no demuestra que cada mensaje se firme con ella.', fixes: [] };
        return { key: 'dkim', name: 'DKIM', max: max, points: 5, status: 'unknown', detail: 'No apareció una clave DKIM en los selectores habituales que probamos. Puede existir con un selector propio; por eso asignamos 5 de 20 en lugar de 0.', fixes: ['Activa la firma DKIM en tu proveedor de correo y publica la clave que te entregue (por ejemplo google._domainkey o selector1._domainkey).', 'Si ya usas DKIM con un selector propio, compruébalo en el Verificador DKIM indicando el selector.'] };
    }

    function scoreDmarc(records, queryOk) {
        var max = WEIGHTS.dmarc;
        if (!queryOk) return { key: 'dmarc', name: 'DMARC', max: max, points: null, status: 'unknown', detail: 'No pudimos consultar _dmarc. Esta sección no cuenta en el puntaje.', fixes: [] };
        var d = (records || []).filter(function (r) { return /^v=DMARC1\b/i.test(String(r).trim()); });
        if (!d.length) return { key: 'dmarc', name: 'DMARC', max: max, points: 0, status: 'missing', record: '', detail: 'No hay registro DMARC en _dmarc. Los receptores no saben qué hacer con correo que suplanta tu dominio, y tú no recibes informes.', fixes: ['Publica un TXT en _dmarc.tudominio con, como mínimo: v=DMARC1; p=none; rua=mailto:dmarc@tudominio', 'Revisa los informes durante unas semanas y sube a p=quarantine y luego a p=reject.'] };
        if (d.length > 1) return { key: 'dmarc', name: 'DMARC', max: max, points: 0, status: 'attention', record: d.join(' | '), detail: 'Hay más de un registro DMARC; los receptores lo tratan como si no existiera.', fixes: ['Deja un solo registro v=DMARC1 en _dmarc.'] };
        var r = d[0];
        var p = (tag(r, 'p') || '').toLowerCase();
        var pct = parseInt(tag(r, 'pct'), 10); if (isNaN(pct)) pct = 100;
        var rua = tag(r, 'rua');
        var hasRua = !!(rua && /mailto:/i.test(rua));
        var res = { key: 'dmarc', name: 'DMARC', max: max, record: r, fixes: [] };
        var base;
        if (p === 'reject') { base = 30; res.detail = 'Política p=reject: los receptores que aplican DMARC pueden rechazar el correo que suplante tu dominio.'; }
        else if (p === 'quarantine') { base = 25; res.detail = 'Política p=quarantine: el correo no autenticado puede ir a spam.'; res.fixes.push('Cuando los informes muestren que todo tu correo legítimo autentica, sube a p=reject.'); }
        else if (p === 'none') { base = 10; res.detail = 'Política p=none: solo monitoreo; no protege contra suplantación.'; res.fixes.push('Usa los informes para identificar remitentes legítimos y avanza a p=quarantine y luego a p=reject.'); }
        else { base = 5; res.detail = 'El registro DMARC no tiene una política p= válida.'; res.fixes.push('Agrega p=none, p=quarantine o p=reject.'); }
        if (pct < 100 && (p === 'reject' || p === 'quarantine')) { base -= 5; res.detail += ' Se aplica solo al ' + pct + '% del correo (pct=' + pct + ').'; res.fixes.push('Sube pct a 100 (o elimínalo) para aplicar la política a todo el correo.'); }
        if (hasRua) { base += 5; res.detail += ' Recibe informes agregados (rua).'; }
        else res.fixes.push('Agrega rua=mailto:... para recibir informes agregados y saber quién envía con tu dominio.');
        res.points = Math.max(0, Math.min(max, base));
        res.status = res.points >= 30 ? 'ok' : 'attention';
        return res;
    }

    function scoreRbl(data, queryOk) {
        var max = WEIGHTS.rbl;
        if (!queryOk || !data) return { key: 'rbl', name: 'Listas negras', max: max, points: null, status: 'unknown', detail: 'No pudimos consultar las listas negras. Esta sección no cuenta en el puntaje.', fixes: [] };
        var all = [], listed = [];
        data.rows.forEach(function (row) { row.results.forEach(function (r, i) { all.push(r); if (r.status === 'listed') listed.push(row.ip + ' en ' + data.lists[i].name); }); });
        if (!data.rows.length) return { key: 'rbl', name: 'Listas negras', max: max, points: null, status: 'unknown', detail: 'No encontramos IPv4 en los MX ni en el registro A, así que no hay IP que revisar. Esta sección no cuenta en el puntaje.', fixes: [] };
        var verified = all.filter(function (r) { return r.status !== 'unknown'; }).length;
        if (!verified) return { key: 'rbl', name: 'Listas negras', max: max, points: null, status: 'unknown', detail: 'Ninguna lista respondió de forma concluyente. Esta sección no cuenta en el puntaje.', fixes: [] };
        var ips = data.rows.map(function (r) { return r.ip; }).join(', ');
        if (!listed.length) return { key: 'rbl', name: 'Listas negras', max: max, points: 20, status: 'ok', record: ips, detail: 'Ninguna de las ' + data.rows.length + ' IP revisadas aparece en las ' + data.lists.length + ' listas (' + verified + ' de ' + all.length + ' consultas concluyentes).', fixes: [] };
        return { key: 'rbl', name: 'Listas negras', max: max, points: Math.max(0, 20 - 10 * listed.length), status: 'attention', record: ips, detail: 'Listados: ' + listed.join('; ') + '. Cada listado resta 10 puntos.', fixes: ['Confirma si la IP es tuya o de tu proveedor; si es compartida, avísale al proveedor.', 'Corrige la causa (cuenta comprometida, formulario abusado, rebotes a remitentes falsos) y pide la remoción en el sitio de cada lista.'] };
    }

    function total(sections) {
        var got = 0, possible = 0;
        sections.forEach(function (s) { if (s.points !== null) { got += s.points; possible += s.max; } });
        if (!possible) return { score: null, possible: 0 };
        return { score: Math.round(100 * got / possible), possible: possible, raw: got };
    }

    function grade(score) {
        if (score === null) return { label: 'Sin datos', tone: 'slate' };
        if (score >= 85) return { label: 'Sólido', tone: 'emerald' };
        if (score >= 60) return { label: 'Mejorable', tone: 'amber' };
        return { label: 'Débil', tone: 'red' };
    }

    function normalizeDomain(v) {
        var d = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^[^@]*@/, '').replace(/[\/?#].*$/, '').replace(/\.$/, '').replace(/^www\./, '');
        return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d) ? d : '';
    }

    return { WEIGHTS: WEIGHTS, scoreSpf: scoreSpf, scoreDkim: scoreDkim, scoreDmarc: scoreDmarc, scoreRbl: scoreRbl, total: total, grade: grade, normalizeDomain: normalizeDomain };
});
