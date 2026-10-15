// Verificador de listas negras (DNSBL) vía DNS-over-HTTPS desde el navegador.
(function () {
    var LISTS = [
        { id: 'spamcop', name: 'Spamcop', zone: 'bl.spamcop.net', info: 'https://www.spamcop.net/bl.shtml' },
        { id: 'barracuda', name: 'Barracuda', zone: 'b.barracudacentral.org', info: 'https://www.barracudacentral.org/lookups' },
        { id: 'psbl', name: 'PSBL', zone: 'psbl.surriel.com', info: 'https://psbl.org/' },
        { id: 'mailspike', name: 'Mailspike', zone: 'bl.mailspike.net', info: 'https://mailspike.org/' },
        { id: 'dronebl', name: 'DroneBL', zone: 'dnsbl.dronebl.org', info: 'https://dronebl.org/lookup' },
        { id: 'backscatterer', name: 'Backscatterer', zone: 'ips.backscatterer.org', info: 'https://www.backscatterer.org/?target=test' }
    ];
    var RESOLVERS = [
        function (n, t) { return { url: 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(n) + '&type=' + t, headers: { Accept: 'application/dns-json' } }; },
        function (n, t) { return { url: 'https://dns.google/resolve?name=' + encodeURIComponent(n) + '&type=' + t, headers: {} }; }
    ];
    var TIMEOUT_MS = 6000;
    var MAX_IPS = 6;

    function query(resolverIndex, name, type) {
        var r = RESOLVERS[resolverIndex](name, type);
        var ctrl = new AbortController();
        var tid = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
        return fetch(r.url, { headers: r.headers, signal: ctrl.signal, credentials: 'omit' })
            .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
            .then(function (d) { if (typeof d.Status !== 'number') throw new Error('Respuesta inválida'); return d; })
            .finally(function () { clearTimeout(tid); });
    }

    // Prueba resolvers en orden; acepta solo NOERROR (0) o NXDOMAIN (3) como respuesta concluyente.
    async function resolve(name, type) {
        var last = null;
        for (var i = 0; i < RESOLVERS.length; i++) {
            try {
                var d = await query(i, name, type);
                if (d.Status === 0 || d.Status === 3) return d;
                last = d;
            } catch (e) { last = null; }
        }
        if (last) return last;
        throw new Error('Sin respuesta DNS');
    }

    function answers(d, typeNum) {
        return (d && d.Answer ? d.Answer : []).filter(function (a) { return a.type === typeNum; }).map(function (a) { return a.data; });
    }

    function isIPv4(v) {
        var p = String(v).split('.');
        return p.length === 4 && p.every(function (x) { return /^\d{1,3}$/.test(x) && +x <= 255; });
    }

    function reverse(ip) { return ip.split('.').reverse().join('.'); }

    // Respuestas que indican consulta rechazada (resolver público bloqueado o cuota), no listado real.
    function isRefusalCode(code) {
        return /^127\.255\.255\.\d+$/.test(code) || code === '127.0.0.255';
    }

    async function checkIpInList(ip, list) {
        try {
            var d = await resolve(reverse(ip) + '.' + list.zone, 'A');
            if (d.Status === 3) return { status: 'clean' };
            if (d.Status !== 0) return { status: 'unknown' };
            var codes = answers(d, 1).filter(function (c) { return /^127\./.test(c); });
            if (!codes.length) return { status: 'clean' };
            if (codes.every(isRefusalCode)) return { status: 'unknown', codes: codes };
            return { status: 'listed', codes: codes };
        } catch (e) {
            return { status: 'unknown' };
        }
    }

    async function ipsForDomain(domain) {
        var targets = [];
        function add(ip, source) {
            if (!targets.some(function (t) { return t.ip === ip; }) && targets.length < MAX_IPS) targets.push({ ip: ip, source: source });
        }
        var mx = await resolve(domain, 'MX');
        var hosts = answers(mx, 15).map(function (v) {
            var parts = String(v).trim().split(/\s+/);
            return { pref: +parts[0], host: (parts[1] || '').replace(/\.$/, '') };
        }).filter(function (h) { return h.host; }).sort(function (a, b) { return a.pref - b.pref; }).slice(0, 3);
        var mxResults = await Promise.all(hosts.map(function (h) {
            return resolve(h.host, 'A').then(function (d) { return { host: h.host, ips: answers(d, 1) }; }).catch(function () { return { host: h.host, ips: [] }; });
        }));
        mxResults.forEach(function (r) { r.ips.slice(0, 2).forEach(function (ip) { add(ip, 'MX ' + r.host); }); });
        try {
            var a = await resolve(domain, 'A');
            answers(a, 1).slice(0, 2).forEach(function (ip) { add(ip, 'A ' + domain); });
        } catch (e) { /* sin A */ }
        return targets;
    }

    async function check(input) {
        var value = String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
        var targets;
        if (isIPv4(value)) {
            targets = [{ ip: value, source: 'IP ingresada' }];
        } else if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value)) {
            targets = await ipsForDomain(value);
        } else {
            var err = new Error('invalid'); err.code = 'invalid'; throw err;
        }
        var rows = await Promise.all(targets.map(async function (t) {
            var res = await Promise.all(LISTS.map(function (l) { return checkIpInList(t.ip, l); }));
            return { ip: t.ip, source: t.source, results: res };
        }));
        return { input: value, lists: LISTS, rows: rows };
    }

    window.InboxSeguroRBL = { LISTS: LISTS, check: check, reverse: reverse, isIPv4: isIPv4, isRefusalCode: isRefusalCode };
})();
