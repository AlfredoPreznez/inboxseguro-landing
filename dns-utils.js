// DNS lookup: proxy same-origin (iOS Safari) → DoH público en paralelo
(function () {
    const PROXY_ENDPOINTS = [
        {
            name: 'SameOrigin',
            buildUrl: function (name, type) {
                return '/api/dns?name=' + encodeURIComponent(name) + '&type=' + type;
            },
            headers: {}
        },
        {
            name: 'Panel',
            buildUrl: function (name, type) {
                return 'https://panel.inboxseguro.com/api/public/dns-resolve?name=' +
                    encodeURIComponent(name) + '&type=' + type;
            },
            headers: {}
        }
    ];

    const DOH_RESOLVERS = [
        {
            name: 'Cloudflare',
            buildUrl: function (name, type) {
                return 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=' + type;
            },
            headers: { Accept: 'application/dns-json' }
        },
        {
            name: 'AliDNS',
            buildUrl: function (name, type) {
                return 'https://dns.alidns.com/resolve?name=' + encodeURIComponent(name) + '&type=' + type;
            },
            headers: {}
        },
        {
            name: 'Google',
            buildUrl: function (name, type) {
                return 'https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=' + type;
            },
            headers: {}
        }
    ];

    const DNS_TIMEOUT_MS = 5000;
    let preferredMode = null; // 'proxy' | 'doh'
    let preferredDohIndex = null;

    function queryEndpoint(endpoint, name, type) {
        const controller = new AbortController();
        const timeoutId = setTimeout(function () { controller.abort(); }, DNS_TIMEOUT_MS);

        return fetch(endpoint.buildUrl(name, type), {
            headers: endpoint.headers,
            signal: controller.signal,
            credentials: 'omit'
        }).then(function (res) {
            if (!res.ok) {
                throw new Error(endpoint.name + ' respondió HTTP ' + res.status);
            }
            return res.json();
        }).then(function (data) {
            if (typeof data.Status !== 'number') {
                throw new Error(endpoint.name + ' devolvió una respuesta inválida');
            }
            return data;
        }).finally(function () {
            clearTimeout(timeoutId);
        });
    }

    function firstSuccessful(promises) {
        if (typeof Promise.any === 'function') {
            return Promise.any(promises);
        }

        return new Promise(function (resolve, reject) {
            var rejected = 0;
            var errors = [];

            promises.forEach(function (promise) {
                Promise.resolve(promise).then(resolve).catch(function (err) {
                    errors.push(err);
                    rejected += 1;
                    if (rejected === promises.length) {
                        reject(errors[0] || new Error('No hay resolvers DNS disponibles'));
                    }
                });
            });
        });
    }

    async function fetchViaProxy(name, type) {
        const attempts = PROXY_ENDPOINTS.map(function (endpoint) {
            return queryEndpoint(endpoint, name, type);
        });
        return firstSuccessful(attempts);
    }

    async function fetchViaDoh(name, type) {
        if (preferredDohIndex !== null) {
            try {
                return await queryEndpoint(DOH_RESOLVERS[preferredDohIndex], name, type);
            } catch (err) {
                console.warn('DoH preferido falló:', err);
                preferredDohIndex = null;
            }
        }

        const attempts = DOH_RESOLVERS.map(function (resolver, index) {
            return queryEndpoint(resolver, name, type).then(function (data) {
                preferredDohIndex = index;
                return data;
            });
        });

        return firstSuccessful(attempts);
    }

    async function fetchDNS(name, type) {
        if (preferredMode === 'doh') {
            return fetchViaDoh(name, type);
        }

        if (preferredMode !== 'proxy') {
            try {
                const data = await fetchViaProxy(name, type);
                preferredMode = 'proxy';
                return data;
            } catch (err) {
                console.warn('Proxy DNS no disponible, probando DoH directo:', err);
            }
        } else {
            try {
                return await fetchViaProxy(name, type);
            } catch (err) {
                console.warn('Proxy DNS falló, probando DoH directo:', err);
                preferredMode = null;
            }
        }

        const data = await fetchViaDoh(name, type);
        preferredMode = 'doh';
        return data;
    }

    function extractTXT(data) {
        if (!data || !data.Answer) return [];
        return data.Answer
            .filter(function (a) { return a.type === 16; })
            .map(function (a) { return a.data.replace(/^"|"$/g, '').replace(/"/g, ''); });
    }

    async function checkDKIM(domain) {
        try {
            await fetchDNS('google._domainkey.' + domain, 'TXT');
        } catch (err) {
            throw err;
        }

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
