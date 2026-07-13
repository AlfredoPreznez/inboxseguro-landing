// DNS lookup helpers with resolver fallbacks (Google DoH → Cloudflare DoH)
(function () {
    const DNS_RESOLVERS = [
        {
            name: 'Google',
            buildUrl: function (name, type) {
                return 'https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=' + type;
            },
            headers: {}
        },
        {
            name: 'Cloudflare',
            buildUrl: function (name, type) {
                return 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=' + type;
            },
            headers: { Accept: 'application/dns-json' }
        }
    ];

    const DNS_TIMEOUT_MS = 8000;

    async function fetchDNS(name, type) {
        let lastError = null;

        for (let i = 0; i < DNS_RESOLVERS.length; i++) {
            const resolver = DNS_RESOLVERS[i];
            const controller = new AbortController();
            const timeoutId = setTimeout(function () { controller.abort(); }, DNS_TIMEOUT_MS);

            try {
                const res = await fetch(resolver.buildUrl(name, type), {
                    headers: resolver.headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    throw new Error(resolver.name + ' respondió HTTP ' + res.status);
                }

                const data = await res.json();
                if (typeof data.Status !== 'number') {
                    throw new Error(resolver.name + ' devolvió una respuesta inválida');
                }

                return data;
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                console.warn('Resolver DNS falló (' + resolver.name + '):', err);
            }
        }

        throw lastError || new Error('No hay resolvers DNS disponibles');
    }

    function extractTXT(data) {
        if (!data || !data.Answer) return [];
        return data.Answer
            .filter(function (a) { return a.type === 16; })
            .map(function (a) { return a.data.replace(/^"|"$/g, '').replace(/"/g, ''); });
    }

    async function checkDKIM(domain) {
        const selectors = [
            'google', 'default', 'selector1', 'selector2', 'k1', 'k2', 'k3', 'dkim',
            'mail', 'zoho', 's1', 's2', 'pic', 'a', 'b', 'c', 'fm1', 'fm2', 'fm3',
            'titan1', 'titan2', 'key1', 'key2', 'smtp', 'mandrill', 'protonmail', 'protonmail2', 'pm', 'pm2', 'mlk', 'sg', 'sendgrid'
        ];

        for (let i = 0; i < selectors.length; i += 5) {
            const batch = selectors.slice(i, i + 5);
            const promises = batch.map(async function (sel) {
                try {
                    const data = await fetchDNS(sel + '._domainkey.' + domain, 'TXT');
                    const records = extractTXT(data);
                    if (records.some(function (r) { return r.includes('v=DKIM1') || r.includes('k=rsa'); })) {
                        return sel;
                    }
                } catch (e) { /* ignore per-selector failures */ }
                return null;
            });

            const results = await Promise.all(promises);
            const found = results.find(function (sel) { return sel !== null; });
            if (found) {
                return { found: true, selector: found };
            }
        }

        return { found: false, selector: null };
    }

    window.fetchDNS = fetchDNS;
    window.extractTXT = extractTXT;
    window.checkDKIM = checkDKIM;
})();
