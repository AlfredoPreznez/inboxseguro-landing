        function decodeDnsString(str) {
            if (!str || typeof str !== 'string') return '';
            return str.replace(/\\(?:(\d{3})|(\\|")|(.))/g, function (match, ddd, escaped, other) {
                if (ddd) {
                    const code = parseInt(ddd, 10);
                    return code >= 0 && code <= 255 ? String.fromCharCode(code) : match;
                }
                if (escaped) {
                    return escaped;
                }
                if (other) {
                    return other;
                }
                return match;
            });
        }

        function extractSpfTxtRecords(dnsData) {
            if (!dnsData || !dnsData.Answer || !Array.isArray(dnsData.Answer)) return [];
            const txtAnswers = dnsData.Answer.filter(function (a) { return a && a.type === 16; });
            const records = [];

            for (let i = 0; i < txtAnswers.length; i++) {
                const raw = txtAnswers[i].data;
                if (typeof raw !== 'string') continue;

                // RFC 7208 §3.3: un solo registro TXT puede estar compuesto por más de una
                // cadena de caracteres. Al evaluarlo, las cadenas se concatenan sin separador.
                const regex = /"((?:[^"\\]|\\.)*)"/g;
                let match;
                const chunks = [];
                while ((match = regex.exec(raw)) !== null) {
                    chunks.push(decodeDnsString(match[1]));
                }

                let concatenated;
                if (chunks.length > 0) {
                    concatenated = chunks.join('');
                } else {
                    concatenated = decodeDnsString(raw.replace(/^["']+|["']+$/g, ''));
                }

                // RFC 7208 §4.5: no hacer .trim() inicial para no aceptar " v=spf1 -all"
                records.push(concatenated);
            }

            return records;
        }

        const DNS_QUERY_TIMEOUT_MS = 5000;
        const PROXY_PARALLEL_DOH_MS = 1500;
        let preferredDnsMode = null; // null | 'proxy' | 'doh'
        let preferredDohResolver = null; // null | 'cloudflare' | 'google' | 'alidns'

        const DNS_TYPE_CODES = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };

        function dnsResponseHasRecords(data, type) {
            if (!data || typeof data.Status !== 'number') return false;
            if (data.Status === 3) return false;
            if (data.Status !== 0) return false;
            if (!data.Answer || !data.Answer.length) return false;
            const typeCode = DNS_TYPE_CODES[(type || 'TXT').toUpperCase()];
            if (!typeCode) return data.Answer.length > 0;
            return data.Answer.some(function (a) { return a.type === typeCode; });
        }

        function noteResolverQuery(resolverName) {
            if (!window.__spfDnsResolverStats) {
                window.__spfDnsResolverStats = { proxy: 0, cloudflare: 0, google: 0, alidns: 0 };
            }
            if (Object.prototype.hasOwnProperty.call(window.__spfDnsResolverStats, resolverName)) {
                window.__spfDnsResolverStats[resolverName]++;
            }
        }

        async function queryDns(name, type, signal) {
            if (signal && signal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            function queryOne(url, headers, resolverName) {
                const controller = new AbortController();
                const timeoutId = setTimeout(function () {
                    controller.abort();
                }, DNS_QUERY_TIMEOUT_MS);

                let onParentAbort = null;
                if (signal) {
                    onParentAbort = function () {
                        controller.abort();
                    };
                    if (signal.aborted) {
                        controller.abort();
                    } else {
                        signal.addEventListener('abort', onParentAbort, { once: true });
                    }
                }

                noteResolverQuery(resolverName);

                return {
                    controller: controller,
                    promise: fetch(url, {
                        headers: headers || {},
                        signal: controller.signal,
                        credentials: 'omit'
                    }).then(function (res) {
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        return res.json();
                    }).then(function (data) {
                        if (!data || typeof data.Status !== 'number') {
                            throw new Error('Respuesta DNS inválida');
                        }
                        if (data.Status === 2) {
                            var servfail = new Error('DNS SERVFAIL');
                            servfail.dnsData = data;
                            throw servfail;
                        }
                        return data;
                    }).finally(function () {
                        clearTimeout(timeoutId);
                        if (signal && onParentAbort) {
                            signal.removeEventListener('abort', onParentAbort);
                        }
                    })
                };
            }

            function attemptWithData(queryObj, idx, controllers, resolverName) {
                return queryObj.promise.then(function (data) {
                    if (dnsResponseHasRecords(data, type)) {
                        controllers.forEach(function (q, i) {
                            if (i !== idx) {
                                try { q.controller.abort(); } catch (_) {}
                            }
                        });
                        if (resolverName === 'proxy') {
                            preferredDnsMode = 'proxy';
                        } else if (resolverName) {
                            preferredDnsMode = 'doh';
                            preferredDohResolver = resolverName;
                        }
                        return data;
                    }
                    var emptyErr = new Error('Respuesta DNS sin registros');
                    emptyErr.emptyDnsData = data;
                    throw emptyErr;
                });
            }

            function pickBestEmptyFromErrors(errs) {
                const list = errs || [];
                for (let i = 0; i < list.length; i++) {
                    const e = list[i];
                    if (e && e.emptyDnsData) return e.emptyDnsData;
                }
                const sf = list.find(function (e) { return e && e.dnsData; });
                if (sf) return sf.dnsData;
                return null;
            }

            function resolverUnavailableError(errs) {
                const err = new Error('No hay resolvers DNS disponibles');
                err.errors = errs || [];
                return err;
            }

            async function raceForDnsData(queriesWithMeta) {
                const controllers = queriesWithMeta.map(function (q) { return q.query; });
                const attempts = queriesWithMeta.map(function (entry, idx) {
                    return attemptWithData(entry.query, idx, controllers, entry.resolver);
                });

                if (typeof Promise.any === 'function') {
                    try {
                        return await Promise.any(attempts);
                    } catch (aggErr) {
                        if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
                        const errs = (aggErr && aggErr.errors) ? aggErr.errors : [aggErr];
                        const empty = pickBestEmptyFromErrors(errs);
                        if (empty) return empty;
                        throw resolverUnavailableError(errs);
                    }
                }

                return new Promise(function (resolve, reject) {
                    let rejected = 0;
                    const errors = [];
                    let settled = false;
                    attempts.forEach(function (p) {
                        Promise.resolve(p).then(function (data) {
                            if (!settled) {
                                settled = true;
                                resolve(data);
                            }
                        }).catch(function (err) {
                            if (signal && signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
                            errors.push(err);
                            rejected++;
                            if (rejected === attempts.length && !settled) {
                                settled = true;
                                const empty = pickBestEmptyFromErrors(errors);
                                if (empty) resolve(empty);
                                else reject(resolverUnavailableError(errors));
                            }
                        });
                    });
                });
            }

            function dohConfig(resolverName) {
                if (resolverName === 'cloudflare') {
                    return {
                        url: 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=' + type,
                        headers: { Accept: 'application/dns-json' },
                        resolver: 'cloudflare'
                    };
                }
                if (resolverName === 'google') {
                    return {
                        url: 'https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=' + type,
                        headers: {},
                        resolver: 'google'
                    };
                }
                return {
                    url: 'https://dns.alidns.com/resolve?name=' + encodeURIComponent(name) + '&type=' + type,
                    headers: {},
                    resolver: 'alidns'
                };
            }

            const proxyUrl = 'https://inboxseguro-dns-proxy.alfredo-9d8.workers.dev/api/dns?name=' + encodeURIComponent(name) + '&type=' + type;
            const primaryDoh = [dohConfig('cloudflare'), dohConfig('google')];
            const alidnsConfig = dohConfig('alidns');

            function querySingle(url, headers, resolverName) {
                return queryOne(url, headers, resolverName).promise;
            }

            async function fetchViaDoh() {
                if (preferredDohResolver) {
                    const preferred = dohConfig(preferredDohResolver);
                    try {
                        return await querySingle(preferred.url, preferred.headers, preferred.resolver);
                    } catch (err) {
                        if (signal && signal.aborted) throw err;
                        preferredDohResolver = null;
                    }
                }

                try {
                    return await raceForDnsData(primaryDoh.map(function (c) {
                        return { query: queryOne(c.url, c.headers, c.resolver), resolver: c.resolver };
                    }));
                } catch (raceErr) {
                    if (signal && signal.aborted) throw raceErr;
                    const raceErrs = (raceErr && raceErr.errors) ? raceErr.errors : [raceErr];
                    const empty = pickBestEmptyFromErrors(raceErrs);
                    if (empty) return empty;
                }

                try {
                    const fallback = await querySingle(alidnsConfig.url, alidnsConfig.headers, alidnsConfig.resolver);
                    preferredDohResolver = 'alidns';
                    return fallback;
                } catch (err) {
                    if (signal && signal.aborted) throw err;
                    throw resolverUnavailableError([err]);
                }
            }

            if (preferredDnsMode === 'doh') {
                return fetchViaDoh();
            }

            if (preferredDnsMode === 'proxy') {
                try {
                    return await querySingle(proxyUrl, {}, 'proxy');
                } catch (err) {
                    if (signal && signal.aborted) throw err;
                    preferredDnsMode = null;
                    const data = await fetchViaDoh();
                    preferredDnsMode = 'doh';
                    return data;
                }
            }

            function acceptProxyDnsResponse(data) {
                if (!data || typeof data.Status !== 'number') return null;
                if (data.Status === 3) {
                    preferredDnsMode = 'proxy';
                    return data;
                }
                if (dnsResponseHasRecords(data, type)) {
                    preferredDnsMode = 'proxy';
                    return data;
                }
                return null;
            }

            async function alidnsAfterPrimaryDohFails(dohErr) {
                if (signal && signal.aborted) throw dohErr;
                try {
                    const fallback = await querySingle(alidnsConfig.url, alidnsConfig.headers, alidnsConfig.resolver);
                    preferredDnsMode = 'doh';
                    preferredDohResolver = 'alidns';
                    return fallback;
                } catch (alidnsErr) {
                    if (signal && signal.aborted) throw alidnsErr;
                    throw alidnsErr;
                }
            }

            async function raceProxyWithParallelDoh(proxyQuery) {
                const dohQueries = primaryDoh.map(function (c) {
                    return { query: queryOne(c.url, c.headers, c.resolver), resolver: c.resolver };
                });
                const dohRace = raceForDnsData(dohQueries);
                const alidnsWhenPrimaryDohFails = dohRace.catch(function (dohErr) {
                    return alidnsAfterPrimaryDohFails(dohErr);
                });

                function proxyAttempt() {
                    return proxyQuery.promise.then(function (data) {
                        const accepted = acceptProxyDnsResponse(data);
                        if (accepted) return accepted;
                        var emptyErr = new Error('Respuesta DNS sin registros');
                        emptyErr.emptyDnsData = data;
                        throw emptyErr;
                    });
                }

                const parallelRacers = [proxyAttempt(), dohRace, alidnsWhenPrimaryDohFails];

                if (typeof Promise.any === 'function') {
                    try {
                        return await Promise.any(parallelRacers);
                    } catch (aggErr) {
                        if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
                        const errs = (aggErr && aggErr.errors) ? aggErr.errors : [aggErr];
                        const empty = pickBestEmptyFromErrors(errs);
                        if (empty) {
                            preferredDnsMode = 'proxy';
                            return empty;
                        }
                        throw resolverUnavailableError(errs);
                    }
                }

                return Promise.race(parallelRacers).catch(function (err) {
                    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
                    throw resolverUnavailableError([err]);
                });
            }

            const proxyQuery = queryOne(proxyUrl, {}, 'proxy');
            const parallelKickoff = new Promise(function (resolve) {
                setTimeout(function () { resolve('kickoff'); }, PROXY_PARALLEL_DOH_MS);
            });

            const firstPhase = await Promise.race([
                proxyQuery.promise.then(function (data) {
                    return { phase: 'proxy', data: data };
                }).catch(function (err) {
                    return { phase: 'proxyErr', err: err };
                }),
                parallelKickoff.then(function () {
                    return { phase: 'kickoff' };
                })
            ]);

            if (firstPhase.phase === 'proxy') {
                const accepted = acceptProxyDnsResponse(firstPhase.data);
                if (accepted) return accepted;
                try {
                    const dohData = await raceForDnsData(primaryDoh.map(function (c) {
                        return { query: queryOne(c.url, c.headers, c.resolver), resolver: c.resolver };
                    }));
                    preferredDnsMode = 'doh';
                    return dohData;
                } catch (dohErr) {
                    if (signal && signal.aborted) throw dohErr;
                    preferredDnsMode = 'proxy';
                    return firstPhase.data;
                }
            }

            if (firstPhase.phase === 'proxyErr') {
                if (signal && signal.aborted) throw firstPhase.err;
                const data = await fetchViaDoh();
                preferredDnsMode = 'doh';
                return data;
            }

            return raceProxyWithParallelDoh(proxyQuery);
        }

        function isValidIp4(val) {
            if (!val || typeof val !== 'string') return false;
            const parts = val.split('/');
            if (parts.length > 2) return false;
            const ip = parts[0];
            const octets = ip.split('.');
            if (octets.length !== 4) return false;
            for (let i = 0; i < 4; i++) {
                const o = octets[i];
                if (!/^(0|[1-9]\d{0,2})$/.test(o)) return false;
                const num = parseInt(o, 10);
                if (num < 0 || num > 255) return false;
            }
            if (parts.length === 2) {
                const cidr = parts[1];
                if (!/^(0|[1-9]\d?)$/.test(cidr)) return false;
                const prefix = parseInt(cidr, 10);
                if (prefix < 0 || prefix > 32) return false;
            }
            return true;
        }

        function isValidIp6(val) {
            if (!val || typeof val !== 'string') return false;
            const parts = val.split('/');
            if (parts.length > 2) return false;
            let ip = parts[0];
            if (!ip) return false;
            if (parts.length === 2) {
                const cidr = parts[1];
                if (!/^(0|[1-9]\d{0,2})$/.test(cidr)) return false;
                const prefix = parseInt(cidr, 10);
                if (prefix < 0 || prefix > 128) return false;
            }

            if (ip.includes(':::')) return false;
            if (ip.startsWith(':') && !ip.startsWith('::')) return false;
            if (ip.endsWith(':') && !ip.endsWith('::')) return false;

            const doubleColons = ip.match(/::/g);
            if (doubleColons && doubleColons.length > 1) return false;
            const hasDoubleColon = !!doubleColons;

            const lastColon = ip.lastIndexOf(':');
            if (lastColon === -1) return false;
            const lastSegment = ip.substring(lastColon + 1);
            if (lastSegment.includes('.')) {
                const octets = lastSegment.split('.');
                if (octets.length !== 4) return false;
                for (let i = 0; i < 4; i++) {
                    const o = octets[i];
                    if (!/^(0|[1-9]\d{0,2})$/.test(o)) return false;
                    const num = parseInt(o, 10);
                    if (num < 0 || num > 255) return false;
                }
                ip = ip.substring(0, lastColon + 1) + '0:0';
            }

            if (ip === '::') return true;

            const pieces = ip.split(':');
            if (hasDoubleColon) {
                const nonEmpty = pieces.filter(function (p) { return p !== ''; });
                if (nonEmpty.length > 7) return false;
                for (let i = 0; i < nonEmpty.length; i++) {
                    if (!/^[0-9a-fA-F]{1,4}$/.test(nonEmpty[i])) return false;
                }
                return true;
            } else {
                if (pieces.length !== 8) return false;
                for (let i = 0; i < pieces.length; i++) {
                    if (!/^[0-9a-fA-F]{1,4}$/.test(pieces[i])) return false;
                }
                return true;
            }
        }

        function parseAndValidateDualCidr(str) {
            if (!str) return { valid: true };
            const m = str.match(/^(\/(0|[1-9]\d*))?(\/\/(0|[1-9]\d*))?$/);
            if (!m || str === '' || (!m[1] && !m[3])) return { valid: false };
            if (m[1]) {
                const ip4 = parseInt(m[2], 10);
                if (ip4 < 0 || ip4 > 32) return { valid: false };
            }
            if (m[3]) {
                const ip6 = parseInt(m[4], 10);
                if (ip6 < 0 || ip6 > 128) return { valid: false };
            }
            return { valid: true };
        }

        function hasInvalidMacro(str, isExp) {
            if (!str || typeof str !== 'string') return false;
            if (!str.includes('%')) return false;
            let i = 0;
            while (i < str.length) {
                if (str[i] === '%') {
                    if (i + 1 >= str.length) return true;
                    const next = str[i + 1];
                    if (next === '%' || next === '_' || next === '-') {
                        i += 2;
                        continue;
                    }
                    if (next === '{') {
                        const closeIdx = str.indexOf('}', i + 2);
                        if (closeIdx === -1) return true;
                        const inner = str.substring(i + 2, closeIdx);
                        if (!inner) return true;
                        const macroLetter = inner[0].toLowerCase();
                        const validLetters = isExp ? 'slodiphcrtv' : 'slodiphv';
                        if (!validLetters.includes(macroLetter)) return true;
                        const rest = inner.substring(1);
                        if (rest) {
                            const match = rest.match(/^(\d*)(r?)([.\-+,\/_=]*)$/i);
                            if (!match) return true;
                            const digits = match[1];
                            if (digits) {
                                const digitVal = parseInt(digits, 10);
                                if (Number.isNaN(digitVal) || digitVal === 0) {
                                    return true;
                                }
                            }
                        }
                        i = closeIdx + 1;
                        continue;
                    }
                    return true;
                }
                i++;
            }
            return false;
        }

        function normalizeDomainInput(raw) {
            if (!raw || typeof raw !== 'string') return '';
            return raw.trim().toLowerCase()
                .replace(/^https?:\/\//, '')
                .replace(/\/.*$/, '')
                .replace(/:\d+$/, '')
                .replace(/^www\./, '')
                .replace(/\.$/, '');
        }

        function validateDomainInput(raw) {
            if (!raw || typeof raw !== 'string') return { valid: false };
            const str = normalizeDomainInput(raw);
            if (!str) return { valid: false };

            // Rechazar espacios internos
            if (/\s/.test(str)) return { valid: false };

            // Rechazar puertos, rutas, esquemas o caracteres prohibidos
            if (str.includes(':') || str.includes('/') || str.includes('?') || str.includes('#') || str.includes('@')) {
                return { valid: false };
            }

            // Quitar punto final opcional de FQDN
            const domain = str.endsWith('.') ? str.slice(0, -1) : str;
            if (domain.length < 1 || domain.length > 253) return { valid: false };

            // Rechazar puntos consecutivos o empezar/terminar en punto
            if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
                return { valid: false };
            }

            const labels = domain.split('.');
            if (labels.length < 2) return { valid: false };

            for (let i = 0; i < labels.length; i++) {
                const label = labels[i];
                if (label.length < 1 || label.length > 63) return { valid: false };
                if (label.startsWith('-') || label.endsWith('-')) return { valid: false };
                if (!/^[a-z0-9-]+$/.test(label)) return { valid: false };
            }

            const tld = labels[labels.length - 1];
            const isPunycodeTld = /^xn--[a-z0-9]+$/.test(tld);
            const isAlphaTld = /^[a-z]{2,}$/.test(tld);
            if (!isPunycodeTld && !isAlphaTld) {
                return { valid: false };
            }

            return { valid: true, domain: domain };
        }

        function showDiagError(message) {
            const error = document.getElementById('diagError');
            if (error) {
                error.textContent = message;
                error.classList.remove('hidden');
            }
            const input = document.getElementById('dominioInput');
            if (input) {
                input.setAttribute('aria-invalid', 'true');
                input.setAttribute('aria-describedby', 'diagError');
            }
            const results = document.getElementById('diagResults');
            if (results) results.classList.add('hidden');
            const loading = document.getElementById('diagLoading');
            if (loading) loading.classList.add('hidden');
        }

        function hideDiagError() {
            const error = document.getElementById('diagError');
            if (error) error.classList.add('hidden');
            const input = document.getElementById('dominioInput');
            if (input) {
                input.removeAttribute('aria-invalid');
                input.removeAttribute('aria-describedby');
            }
        }

        function spfRecordHasPlusAll(record) {
            if (!record || typeof record !== 'string') return false;
            const terms = record.split(/ +/).slice(1);
            for (let ti = 0; ti < terms.length; ti++) {
                const rawTerm = terms[ti];
                if (!rawTerm) continue;
                if (/^[+\-~?][a-zA-Z][a-zA-Z0-9_.-]*=/.test(rawTerm)) continue;
                const cleanTerm = rawTerm.replace(/^[+\-~?]/, '').toLowerCase();
                if (cleanTerm.startsWith('redirect=') || cleanTerm.startsWith('exp=')) continue;
                const allMatch = rawTerm.match(/^([+\-~?])?(all)$/i);
                if (allMatch) {
                    const qual = allMatch[1] || '+';
                    if (qual === '+') return true;
                }
            }
            return false;
        }

        async function handleDiagnostico(event, isAuto) {
            event.preventDefault();
            window.__spfDnsResolverStats = { proxy: 0, cloudflare: 0, google: 0, alidns: 0 };
            const raw = document.getElementById('dominioInput').value;
            const validation = validateDomainInput(raw);
            if (!validation.valid) {
                showDiagError('Escribe un dominio válido, por ejemplo tuempresa.com');
                return;
            }
            hideDiagError();
            const dominio = validation.domain;

            const btn = document.getElementById('diagBtn');
            const resultsDiv = document.getElementById('diagResults');
            const loadingDiv = document.getElementById('diagLoading');

            btn.disabled = true;
            btn.innerText = 'Analizando...';
            resultsDiv.classList.add('hidden');
            loadingDiv.classList.remove('hidden');

            const abortController = new AbortController();
            let isGlobalTimeout = false;
            const globalTimeoutId = setTimeout(function () {
                isGlobalTimeout = true;
                abortController.abort();
            }, 5000);

            try {
                let spfData = null;
                let queryOk = false;
                try {
                    spfData = await queryDns(dominio, 'TXT', abortController.signal);
                    queryOk = !!(spfData && (spfData.Status === 0 || spfData.Status === 3));
                } catch (initialErr) {
                    if (isGlobalTimeout || abortController.signal.aborted) {
                        renderSpfCounter(dominio, {
                            domain: dominio,
                            incomplete: true,
                            lookupCount: null,
                            warnings: ['Se superó el tiempo límite global de 5 segundos para la resolución SPF.'],
                            mechanisms: []
                        });
                        setResult('spf', {
                            status: 'warn',
                            label: 'No pudimos terminar el conteo',
                            text: 'Se superó el tiempo límite global de 5 segundos al consultar el DNS.'
                        });
                        document.getElementById('diagDomain').textContent = dominio;
                        const scoreEl = document.getElementById('diagScore');
                        scoreEl.textContent = 'No pudimos terminar el conteo';
                        scoreEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400';
                        resultsDiv.classList.remove('hidden');
                        if (typeof window.trackCheckerSubmit === 'function') window.trackCheckerSubmit('spf');
                        if (typeof window.trackCheckerOutcome === 'function') window.trackCheckerOutcome('spf', 'error');
                        return;
                    }
                    throw initialErr;
                }

                const spfRecords = extractSpfTxtRecords(spfData);
                const spfOnlyRecords = spfRecords.filter(function (r) {
                    return /^v=spf1(\s|$)/i.test(r);
                });
                const spfRecord = spfOnlyRecords[0];
                let spfResult;

                if (!queryOk) {
                    spfResult = { status: 'unknown', label: 'No verificable', text: 'No pudimos consultar el TXT del dominio, así que no afirmamos si hay SPF.' };
                } else if (spfOnlyRecords.length > 1) {
                    spfResult = { status: 'fail', label: 'Permerror', text: 'El dominio analizado publica múltiples registros SPF (v=spf1), lo que genera permerror según la RFC 7208 §3.2.' };
                } else {
                    spfResult = analyzeSpf(spfRecord);
                }

                setResult('spf', spfResult);
                document.getElementById('diagDomain').textContent = dominio;

                const scoreEl = document.getElementById('diagScore');
                const scoreStyles = {
                    ok: ['Correcto', 'bg-emerald-500/20 text-emerald-400'],
                    warn: ['Requiere atención', 'bg-amber-500/20 text-amber-400'],
                    fail: ['Permerror', 'bg-red-500/20 text-red-400'],
                    error: ['Permerror', 'bg-red-500/20 text-red-400'],
                    none: ['No detectado', 'bg-white/5 border border-white/10 text-slate-300'],
                    unknown: ['No verificable', 'bg-white/5 border border-white/10 text-slate-300']
                };
                const scoreStyle = scoreStyles[spfResult.status] || ['No detectado', 'bg-white/5 border border-white/10 text-slate-300'];
                scoreEl.textContent = scoreStyle[0];
                scoreEl.className = 'px-3 py-1 rounded-full text-xs font-bold ' + scoreStyle[1];

                // Contador de consultas DNS (RFC 7208 §4.6.4)
                if (queryOk) {
                    if (spfOnlyRecords.length > 1) {
                        renderSpfCounter(dominio, {
                            domain: dominio,
                            rootMultipleRecords: true,
                            lookupCount: null,
                            warnings: ['El dominio analizado publica más de un registro v=spf1 en la misma zona DNS (permerror según RFC 7208 §3.2).'],
                            mechanisms: []
                        });
                    } else if (!spfRecord) {
                        renderSpfCounter(dominio, {
                            domain: dominio,
                            noSpf: true,
                            lookupCount: 0,
                            warnings: [],
                            mechanisms: []
                        });
                    } else {
                        const counterResult = await countSpfLookups(dominio, spfData, abortController.signal);
                        const isPermerror = counterResult.hasLoop ||
                                            counterResult.hasIncludeNoSpf ||
                                            counterResult.hasMxOverflow ||
                                            counterResult.hasUnknownMechanism ||
                                            counterResult.hasIncludedMultipleRecords ||
                                            (counterResult.lookupCount > 10);

                        if (isPermerror) {
                            spfResult = {
                                status: 'fail',
                                label: 'Permerror',
                                text: (counterResult.warnings && counterResult.warnings.length > 0)
                                    ? counterResult.warnings[0]
                                    : 'La evaluación SPF devuelve permerror según la RFC 7208.'
                            };
                            setResult('spf', spfResult);
                            scoreEl.textContent = 'Permerror';
                            scoreEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400';
                        } else if (counterResult.incomplete) {
                            spfResult = {
                                status: 'warn',
                                label: 'No pudimos terminar el conteo',
                                text: (counterResult.warnings && counterResult.warnings.length > 0)
                                    ? counterResult.warnings[0]
                                    : 'No pudimos terminar el conteo de consultas DNS debido a un error o límite de tiempo.'
                            };
                            setResult('spf', spfResult);
                            scoreEl.textContent = 'No pudimos terminar el conteo';
                            scoreEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400';
                        } else if (counterResult.hasUnevaluableMacro) {
                            spfResult = {
                                status: 'warn',
                                label: 'Requiere atención',
                                text: 'El registro SPF contiene mecanismos con macros que no se pueden evaluar estáticamente.'
                            };
                            setResult('spf', spfResult);
                            scoreEl.textContent = 'Requiere atención';
                            scoreEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400';
                        } else if (counterResult.hasPlusAll) {
                            spfResult = {
                                status: 'warn',
                                label: 'Requiere atención',
                                text: 'La política +all (o all sin calificador) autoriza cualquier origen en SPF. Revisa todos tus remitentes antes de aplicar una política restrictiva.'
                            };
                            setResult('spf', spfResult);
                            scoreEl.textContent = 'Requiere atención';
                            scoreEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400';
                        } else if (counterResult.voidLookups > 2) {
                            spfResult = {
                                status: 'warn',
                                label: 'Requiere atención',
                                text: 'Hay más de 2 consultas DNS sin resultado (void lookups). Algunos receptores devuelven permerror al superarlo (RFC 7208 §4.6.4).'
                            };
                            setResult('spf', spfResult);
                            scoreEl.textContent = 'Requiere atención';
                            scoreEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400';
                        }
                        renderSpfCounter(dominio, counterResult);
                    }
                } else {
                    spfResult = {
                        status: 'warn',
                        label: 'No pudimos terminar el conteo',
                        text: 'No pudimos consultar los registros DNS del dominio.'
                    };
                    setResult('spf', spfResult);
                    scoreEl.textContent = 'No pudimos terminar el conteo';
                    scoreEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400';
                    renderSpfCounter(dominio, {
                        domain: dominio,
                        incomplete: true,
                        lookupCount: null,
                        warnings: ['No pudimos consultar los registros DNS del dominio.'],
                        mechanisms: []
                    });
                }

                var notifyResults = { spf: spfResult.text };
                if (!isAuto && window.InboxSeguroNotify) window.InboxSeguroNotify.notifyToolUse({
                    tool: 'SPF Checker',
                    domain: dominio,
                    score: 'SPF: ' + spfResult.label,
                    results: notifyResults
                });

                resultsDiv.classList.remove('hidden');
                if (window.InboxSeguroToolLead) window.InboxSeguroToolLead.mount(resultsDiv, {
                    tool: 'SPF Checker',
                    idPrefix: 'spfLead',
                    leadSource: 'spfLead',
                    getDomain: function () { return dominio; },
                    getScore: function () { return scoreEl.textContent; },
                    getResults: function () { return notifyResults; }
                });
                if (typeof window.trackCheckerSubmit === 'function') window.trackCheckerSubmit('spf');
                if (typeof window.trackCheckerOutcome === 'function') window.trackCheckerOutcome('spf', 'success');
            } catch (err) {
                console.error(err);
                if (typeof window.trackCheckerOutcome === 'function') window.trackCheckerOutcome('spf', 'error');
                alert('No pudimos consultar los registros DNS. Verifica tu conexión e inténtalo de nuevo.');
            } finally {
                clearTimeout(globalTimeoutId);
                btn.disabled = false;
                btn.innerText = 'Analizar SPF';
                loadingDiv.classList.add('hidden');
            }
        }

        async function countSpfLookups(domain, initialData, abortSignal) {
            const maxQueries = 30;
            const TIMEOUT_MS = 5000;
            const startTime = Date.now();
            let queryCount = initialData ? 1 : 0;
            let lookupCount = 0;
            let voidLookups = 0;
            const warnings = [];
            let incomplete = false;
            let hasLoop = false;
            let hasIncludeNoSpf = false;
            let hasMxOverflow = false;
            let hasUnknownMechanism = false;
            let hasIncludedMultipleRecords = false;
            let includedMultipleRecordsDomain = null;
            let hasUnevaluableMacro = false;
            let hasPlusAll = false;
            let rootSpfRecord = null;

            function checkTimeout() {
                if ((abortSignal && abortSignal.aborted) || Date.now() - startTime >= TIMEOUT_MS) {
                    incomplete = true;
                    if (!warnings.some(function (w) { return w.includes('5 segundos'); })) {
                        warnings.push('Se superó el tiempo límite global de 5 segundos para la resolución SPF.');
                    }
                    return true;
                }
                return false;
            }

            async function fetchWithDeadline(name, type) {
                if (checkTimeout()) throw new Error('Timeout global de 5 segundos excedido');
                return queryDns(name, type, abortSignal);
            }

            function addLookup(mech) {
                lookupCount++;
                mech.lookups = 1;
                mech.lookupOrder = lookupCount;
                if (lookupCount === 11) {
                    mech.permerrorCutoff = true;
                }
            }

            async function evaluateDomain(targetDomain, visitedChain, presetData) {
                if (queryCount >= maxQueries || checkTimeout()) {
                    incomplete = true;
                    return null;
                }

                const norm = targetDomain.toLowerCase();
                if (visitedChain.indexOf(norm) !== -1) {
                    hasLoop = true;
                    warnings.push('Hay un lazo de include: ' + targetDomain + ' (permerror según RFC 7208).');
                    return {
                        domain: targetDomain,
                        loop: true,
                        mechanisms: []
                    };
                }

                let data = presetData;
                if (!data) {
                    queryCount++;
                    try {
                        data = await fetchWithDeadline(targetDomain, 'TXT');
                    } catch (err) {
                        incomplete = true;
                        if ((abortSignal && abortSignal.aborted) || checkTimeout() || err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
                            if (!warnings.some(function (w) { return w.includes('5 segundos'); })) {
                                warnings.push('Se superó el tiempo límite global de 5 segundos para la resolución SPF.');
                            }
                            return null;
                        }
                        if (!warnings.some(function (w) { return w.includes(targetDomain) || w.includes('5 segundos'); })) {
                            warnings.push('Error al consultar TXT de ' + targetDomain + ' (' + (err.message || 'error') + ').');
                        }
                        return null;
                    }
                }

                if (data && data.Status === 2) {
                    incomplete = true;
                    warnings.push('El servidor DNS devolvió SERVFAIL al consultar ' + targetDomain + '.');
                    return {
                        domain: targetDomain,
                        servfail: true,
                        mechanisms: []
                    };
                }

                if (data && data.Status !== 0 && data.Status !== 3) {
                    incomplete = true;
                    warnings.push('El servidor DNS devolvió error (RCODE ' + data.Status + ') al consultar ' + targetDomain + '.');
                    return {
                        domain: targetDomain,
                        dnsError: true,
                        mechanisms: []
                    };
                }

                const records = extractSpfTxtRecords(data).filter(function (r) {
                    return /^v=spf1(\s|$)/i.test(r);
                });
                if (records.length === 0) {
                    hasIncludeNoSpf = true;
                    warnings.push('El dominio ' + targetDomain + ' no tiene un registro SPF válido (permerror según RFC 7208 §5.2).');
                    return {
                        domain: targetDomain,
                        noSpfPermerror: true,
                        mechanisms: []
                    };
                }

                if (records.length > 1) {
                    hasIncludedMultipleRecords = true;
                    includedMultipleRecordsDomain = targetDomain;
                    warnings.push('El dominio incluido ' + targetDomain + ' publica múltiples registros SPF (v=spf1), lo que genera permerror según RFC 7208 §3.2.');
                    return {
                        domain: targetDomain,
                        multipleRecords: true,
                        mechanisms: []
                    };
                }

                const record = records[0];
                if (visitedChain.length === 0) {
                    rootSpfRecord = record;
                }
                if (spfRecordHasPlusAll(record)) {
                    hasPlusAll = true;
                }
                if (/\t/.test(record)) {
                    hasUnknownMechanism = true;
                    warnings.push('El registro SPF contiene caracteres tabulador; la RFC 7208 §3.1 exige espacios SP (permerror).');
                }
                const terms = record.split(/ +/).slice(1);
                const mechanisms = [];

                const hasAll = terms.some(function (t) {
                    return /^[+\-~?]?all$/i.test(t);
                });

                // Separar términos en mecanismos, redirect y exp (RFC 7208 §6.1, §6.2)
                const nonRedirectTerms = [];
                const redirectTerms = [];
                const expTerms = [];

                for (let i = 0; i < terms.length; i++) {
                    const rawTerm = terms[i];
                    if (!rawTerm) continue;
                    if (/^[+\-~?][a-zA-Z][a-zA-Z0-9_.-]*=/.test(rawTerm)) {
                        hasUnknownMechanism = true;
                        warnings.push('Modificador con calificador "' + rawTerm + '" (permerror según RFC 7208 §4.6.1).');
                        nonRedirectTerms.push({
                            rawTerm: rawTerm,
                            cleanTerm: rawTerm,
                            lower: rawTerm.toLowerCase(),
                            isInvalidModifier: true
                        });
                        continue;
                    }
                    const cleanTerm = rawTerm.replace(/^[+\-~?]/, '');
                    const lower = cleanTerm.toLowerCase();
                    if (lower.startsWith('redirect=')) {
                        redirectTerms.push({ rawTerm: rawTerm, cleanTerm: cleanTerm, lower: lower });
                    } else if (lower.startsWith('exp=')) {
                        expTerms.push({ rawTerm: rawTerm, cleanTerm: cleanTerm, lower: lower });
                        nonRedirectTerms.push({ rawTerm: rawTerm, cleanTerm: cleanTerm, lower: lower, isExp: true });
                    } else {
                        nonRedirectTerms.push({ rawTerm: rawTerm, cleanTerm: cleanTerm, lower: lower });
                    }
                }

                if (redirectTerms.length > 1) {
                    hasUnknownMechanism = true;
                    warnings.push('Se especificó más de un modificador redirect (permerror según RFC 7208 §6).');
                }
                if (expTerms.length > 1) {
                    hasUnknownMechanism = true;
                    warnings.push('Se especificó más de un modificador exp en el mismo registro (permerror según RFC 7208 §6.2).');
                }

                // 1. Evaluar mecanismos no-redirect en orden
                for (let i = 0; i < nonRedirectTerms.length; i++) {
                    const item = nonRedirectTerms[i];
                    const rawTerm = item.rawTerm;
                    const cleanTerm = item.cleanTerm;
                    const lower = item.lower;

                    if (item.isInvalidModifier) {
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'unknown',
                            lookups: 0,
                            permerror: true,
                            note: 'modificador con calificador no permitido (permerror según RFC 7208 §4.6.1)'
                        });
                        continue;
                    }

                    if (hasInvalidMacro(cleanTerm, item.isExp)) {
                        hasUnknownMechanism = true;
                        warnings.push('Macro no válida en "' + rawTerm + '" (permerror según RFC 7208 §7).');
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'unknown',
                            lookups: 0,
                            permerror: true,
                            note: 'macro no válida (permerror según RFC 7208 §7)'
                        });
                        continue;
                    }

                    if (item.isExp) {
                        const isDup = expTerms.length > 1;
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'exp',
                            lookups: 0,
                            permerror: isDup,
                            note: isDup ? 'múltiples modificadores exp en el mismo registro (permerror según RFC 7208 §6.2)' : undefined
                        });
                        continue;
                    }

                    if (lower === 'include:' || (lower.startsWith('include:') && cleanTerm.substring(8).trim() === '')) {
                        hasUnknownMechanism = true;
                        warnings.push('Sintaxis inválida en include "' + rawTerm + '" (permerror según RFC 7208 §5.2).');
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'unknown',
                            lookups: 0,
                            permerror: true,
                            note: 'sintaxis inválida en include (permerror)'
                        });
                    } else if (lower.startsWith('include:')) {
                        const incTarget = cleanTerm.substring(8).trim();
                        const hasMacro = /%\{/.test(cleanTerm);
                        const mech = {
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'include',
                            target: incTarget,
                            macro: hasMacro
                        };
                        addLookup(mech);
                        if (hasMacro) {
                            hasUnevaluableMacro = true;
                            mech.note = 'no evaluable: usa macros';
                        } else if (!checkTimeout() && queryCount < maxQueries) {
                            mech.child = await evaluateDomain(incTarget, visitedChain.concat([norm]));
                            if (mech.child && mech.child.record && spfRecordHasPlusAll(mech.child.record)) {
                                hasPlusAll = true;
                            }
                        } else {
                            incomplete = true;
                        }
                        mechanisms.push(mech);
                    } else if (lower.startsWith('include') && !lower.startsWith('include:')) {
                        hasUnknownMechanism = true;
                        warnings.push('Sintaxis inválida en include "' + rawTerm + '" (permerror según RFC 7208 §4.6.1).');
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'unknown',
                            lookups: 0,
                            permerror: true,
                            note: 'sintaxis inválida en include (permerror)'
                        });
                    } else if (lower === 'a' || lower.startsWith('a:') || lower.startsWith('a/')) {
                        let aTarget = targetDomain;
                        let aCidr = '';
                        let aSyntaxError = false;

                        if (lower === 'a') {
                            aTarget = targetDomain;
                        } else if (lower === 'a:' || (lower.startsWith('a:') && cleanTerm.substring(2).trim() === '') || lower.startsWith('a:/')) {
                            aSyntaxError = true;
                        } else if (lower.startsWith('a:')) {
                            const rest = cleanTerm.substring(2);
                            const slashIdx = rest.indexOf('/');
                            if (slashIdx !== -1) {
                                aTarget = rest.substring(0, slashIdx);
                                aCidr = rest.substring(slashIdx);
                            } else {
                                aTarget = rest;
                            }
                            if (!aTarget) aSyntaxError = true;
                        } else if (lower.startsWith('a/')) {
                            aTarget = targetDomain;
                            aCidr = cleanTerm.substring(1);
                        }

                        if (!aSyntaxError && aCidr) {
                            const cidrCheck = parseAndValidateDualCidr(aCidr);
                            if (!cidrCheck.valid) aSyntaxError = true;
                        }

                        if (aSyntaxError) {
                            hasUnknownMechanism = true;
                            warnings.push('Sintaxis inválida en mecanismo a "' + rawTerm + '" (permerror según RFC 7208 §5.3).');
                            mechanisms.push({
                                raw: rawTerm,
                                clean: cleanTerm,
                                type: 'unknown',
                                lookups: 0,
                                permerror: true,
                                note: 'sintaxis inválida en mecanismo a (permerror)'
                            });
                            continue;
                        }

                        const hasMacro = /%\{/.test(cleanTerm);
                        const mech = {
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'a',
                            macro: hasMacro
                        };
                        addLookup(mech);
                        if (hasMacro) {
                            mech.note = 'no evaluable: usa macros';
                        } else if (queryCount < maxQueries && !checkTimeout()) {
                            queryCount++;
                            try {
                                const aData = await fetchWithDeadline(aTarget, 'A');
                                let aVoid = false;
                                let aIncomplete = false;
                                if (aData && aData.Status === 2) {
                                    incomplete = true;
                                    aIncomplete = true;
                                    warnings.push('El servidor DNS devolvió SERVFAIL al consultar A de ' + aTarget + '.');
                                    mech.note = 'consulta A incompleta (SERVFAIL)';
                                } else if (aData && aData.Status !== 0 && aData.Status !== 3) {
                                    incomplete = true;
                                    aIncomplete = true;
                                    warnings.push('El servidor DNS devolvió error (RCODE ' + aData.Status + ') al consultar A de ' + aTarget + '.');
                                    mech.note = 'consulta A incompleta (error DNS)';
                                } else if (!aData || aData.Status === 3 || (aData.Status === 0 && (!aData.Answer || aData.Answer.filter(function (a) { return a.type === 1; }).length === 0))) {
                                    aVoid = true;
                                }

                                if (aVoid && !aIncomplete && !checkTimeout() && queryCount < maxQueries) {
                                    queryCount++;
                                    try {
                                        const aaaaData = await fetchWithDeadline(aTarget, 'AAAA');
                                        if (aaaaData && aaaaData.Status === 2) {
                                            incomplete = true;
                                            warnings.push('El servidor DNS devolvió SERVFAIL al consultar AAAA de ' + aTarget + '.');
                                            mech.note = 'consulta AAAA incompleta (SERVFAIL)';
                                        } else if (aaaaData && aaaaData.Status !== 0 && aaaaData.Status !== 3) {
                                            incomplete = true;
                                            warnings.push('El servidor DNS devolvió error (RCODE ' + aaaaData.Status + ') al consultar AAAA de ' + aTarget + '.');
                                            mech.note = 'consulta AAAA incompleta (error DNS)';
                                        } else if (aaaaData && aaaaData.Status === 0 && aaaaData.Answer && aaaaData.Answer.filter(function (a) { return a.type === 28; }).length > 0) {
                                            aVoid = false;
                                            mech.note = 'solo IPv6 (AAAA presente)';
                                        }
                                    } catch (err) {
                                        incomplete = true;
                                        if ((abortSignal && abortSignal.aborted) || checkTimeout() || err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
                                            if (!warnings.some(function (w) { return w.includes('5 segundos'); })) {
                                                warnings.push('Se superó el tiempo límite global de 5 segundos para la resolución SPF.');
                                            }
                                        } else {
                                            warnings.push('No se pudo consultar el registro AAAA de ' + aTarget + ' (' + (err.message || 'error') + ').');
                                            mech.note = 'consulta AAAA incompleta (error DNS)';
                                        }
                                    }
                                }

                                if (aVoid && !aIncomplete) {
                                    voidLookups++;
                                    mech.voidLookup = true;
                                    mech.note = 'sin dirección IP (void lookup)';
                                }
                            } catch (err) {
                                incomplete = true;
                                if ((abortSignal && abortSignal.aborted) || checkTimeout() || err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
                                    if (!warnings.some(function (w) { return w.includes('5 segundos'); })) {
                                        warnings.push('Se superó el tiempo límite global de 5 segundos para la resolución SPF.');
                                    }
                                } else {
                                    warnings.push('No se pudo consultar el registro A de ' + aTarget + ' (' + (err.message || 'error') + ').');
                                    mech.note = 'consulta A incompleta (error DNS)';
                                }
                            }
                        }
                        mechanisms.push(mech);
                    } else if (lower === 'mx' || lower.startsWith('mx:') || lower.startsWith('mx/')) {
                        let mxTarget = targetDomain;
                        let mxCidr = '';
                        let mxSyntaxError = false;

                        if (lower === 'mx') {
                            mxTarget = targetDomain;
                        } else if (lower === 'mx:' || (lower.startsWith('mx:') && cleanTerm.substring(3).trim() === '') || lower.startsWith('mx:/')) {
                            mxSyntaxError = true;
                        } else if (lower.startsWith('mx:')) {
                            const rest = cleanTerm.substring(3);
                            const slashIdx = rest.indexOf('/');
                            if (slashIdx !== -1) {
                                mxTarget = rest.substring(0, slashIdx);
                                mxCidr = rest.substring(slashIdx);
                            } else {
                                mxTarget = rest;
                            }
                            if (!mxTarget) mxSyntaxError = true;
                        } else if (lower.startsWith('mx/')) {
                            mxTarget = targetDomain;
                            mxCidr = cleanTerm.substring(2);
                        }

                        if (!mxSyntaxError && mxCidr) {
                            const cidrCheck = parseAndValidateDualCidr(mxCidr);
                            if (!cidrCheck.valid) mxSyntaxError = true;
                        }

                        if (mxSyntaxError) {
                            hasUnknownMechanism = true;
                            warnings.push('Sintaxis inválida en mecanismo mx "' + rawTerm + '" (permerror según RFC 7208 §5.4).');
                            mechanisms.push({
                                raw: rawTerm,
                                clean: cleanTerm,
                                type: 'unknown',
                                lookups: 0,
                                permerror: true,
                                note: 'sintaxis inválida en mecanismo mx (permerror)'
                            });
                            continue;
                        }

                        const hasMacro = /%\{/.test(cleanTerm);
                        const mech = {
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'mx',
                            macro: hasMacro
                        };
                        addLookup(mech);
                        if (hasMacro) {
                            mech.note = 'no evaluable: usa macros';
                        } else if (queryCount < maxQueries && !checkTimeout()) {
                            queryCount++;
                            try {
                                const mxData = await fetchWithDeadline(mxTarget, 'MX');
                                if (mxData && mxData.Status === 2) {
                                    incomplete = true;
                                    warnings.push('El servidor DNS devolvió SERVFAIL al consultar MX de ' + mxTarget + '.');
                                    mech.note = 'consulta MX incompleta (SERVFAIL)';
                                } else if (mxData && mxData.Status !== 0 && mxData.Status !== 3) {
                                    incomplete = true;
                                    warnings.push('El servidor DNS devolvió error (RCODE ' + mxData.Status + ') al consultar MX de ' + mxTarget + '.');
                                    mech.note = 'consulta MX incompleta (error DNS)';
                                } else if (mxData && (mxData.Status === 3 || (mxData.Status === 0 && (!mxData.Answer || mxData.Answer.filter(function (a) { return a.type === 15; }).length === 0)))) {
                                    voidLookups++;
                                    mech.voidLookup = true;
                                    mech.note = 'sin registro MX (void lookup)';
                                } else if (mxData && mxData.Answer) {
                                    const mxAnswers = mxData.Answer.filter(function (a) { return a.type === 15; });
                                    const mxCount = mxAnswers.length;
                                    mech.mxCount = mxCount;
                                    if (mxCount > 10) {
                                        hasMxOverflow = true;
                                        warnings.push('El mecanismo mx devolvió más de 10 nombres (' + mxCount + '), causa de permerror según RFC 7208.');
                                        mech.note = 'más de 10 nombres (permerror)';
                                    }
                                }
                            } catch (err) {
                                incomplete = true;
                                if ((abortSignal && abortSignal.aborted) || checkTimeout() || err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
                                    if (!warnings.some(function (w) { return w.includes('5 segundos'); })) {
                                        warnings.push('Se superó el tiempo límite global de 5 segundos para la resolución SPF.');
                                    }
                                } else {
                                    warnings.push('No se pudo consultar el registro MX de ' + mxTarget + ' (' + (err.message || 'error') + ').');
                                    mech.note = 'consulta MX incompleta (error DNS)';
                                }
                            }
                        }
                        mechanisms.push(mech);
                    } else if (lower.startsWith('exists:')) {
                        const existsTarget = cleanTerm.substring(7).trim();
                        if (!existsTarget) {
                            hasUnknownMechanism = true;
                            warnings.push('Sintaxis inválida en mecanismo exists "' + rawTerm + '" (permerror según RFC 7208 §5.7).');
                            mechanisms.push({
                                raw: rawTerm,
                                clean: cleanTerm,
                                type: 'unknown',
                                lookups: 0,
                                permerror: true,
                                note: 'sintaxis inválida en mecanismo exists (permerror)'
                            });
                            continue;
                        }
                        const hasMacro = /%\{/.test(cleanTerm);
                        const mech = {
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'exists',
                            macro: hasMacro
                        };
                        addLookup(mech);
                        if (hasMacro) {
                            mech.note = 'no evaluable: usa macros';
                        } else if (queryCount < maxQueries && !checkTimeout()) {
                            queryCount++;
                            const existsTarget = cleanTerm.substring(7);
                            try {
                                const exData = await fetchWithDeadline(existsTarget, 'A');
                                if (exData && exData.Status === 2) {
                                    incomplete = true;
                                    warnings.push('El servidor DNS devolvió SERVFAIL al consultar exists de ' + existsTarget + '.');
                                    mech.note = 'consulta exists incompleta (SERVFAIL)';
                                } else if (exData && exData.Status !== 0 && exData.Status !== 3) {
                                    incomplete = true;
                                    warnings.push('El servidor DNS devolvió error (RCODE ' + exData.Status + ') al consultar exists de ' + existsTarget + '.');
                                    mech.note = 'consulta exists incompleta (error DNS)';
                                } else if (exData && (exData.Status === 3 || (exData.Status === 0 && (!exData.Answer || exData.Answer.filter(function (a) { return a.type === 1; }).length === 0)))) {
                                    voidLookups++;
                                    mech.voidLookup = true;
                                    mech.note = 'nombre no existe (void lookup)';
                                }
                            } catch (err) {
                                incomplete = true;
                                if ((abortSignal && abortSignal.aborted) || checkTimeout() || err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
                                    if (!warnings.some(function (w) { return w.includes('5 segundos'); })) {
                                        warnings.push('Se superó el tiempo límite global de 5 segundos para la resolución SPF.');
                                    }
                                } else {
                                    warnings.push('No se pudo consultar exists de ' + existsTarget + ' (' + (err.message || 'error') + ').');
                                    mech.note = 'consulta exists incompleta (error DNS)';
                                }
                            }
                        }
                        mechanisms.push(mech);
                    } else if (lower === 'ptr' || lower.startsWith('ptr:')) {
                        const mech = {
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'ptr',
                            note: 'desaconsejado por RFC 7208 §5.5'
                        };
                        addLookup(mech);
                        mechanisms.push(mech);
                    } else if (lower.startsWith('ip4:')) {
                        const ipTarget = cleanTerm.substring(4).trim();
                        if (!ipTarget || !isValidIp4(ipTarget)) {
                            hasUnknownMechanism = true;
                            warnings.push('Sintaxis inválida en ip4 "' + rawTerm + '" (permerror según RFC 7208 §5.6).');
                            mechanisms.push({
                                raw: rawTerm,
                                clean: cleanTerm,
                                type: 'unknown',
                                lookups: 0,
                                permerror: true,
                                note: 'sintaxis inválida en ip4 (permerror)'
                            });
                        } else {
                            mechanisms.push({
                                raw: rawTerm,
                                clean: cleanTerm,
                                type: 'ip4',
                                lookups: 0
                            });
                        }
                    } else if (lower.startsWith('ip6:')) {
                        const ipTarget = cleanTerm.substring(4).trim();
                        if (!ipTarget || !isValidIp6(ipTarget)) {
                            hasUnknownMechanism = true;
                            warnings.push('Sintaxis inválida en ip6 "' + rawTerm + '" (permerror según RFC 7208 §5.6).');
                            mechanisms.push({
                                raw: rawTerm,
                                clean: cleanTerm,
                                type: 'unknown',
                                lookups: 0,
                                permerror: true,
                                note: 'sintaxis inválida en ip6 (permerror)'
                            });
                        } else {
                            mechanisms.push({
                                raw: rawTerm,
                                clean: cleanTerm,
                                type: 'ip6',
                                lookups: 0
                            });
                        }
                    } else if (lower === 'all') {
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'all',
                            lookups: 0
                        });
                    } else if (lower.startsWith('exp=')) {
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'exp',
                            lookups: 0
                        });
                    } else if (/^[a-zA-Z][a-zA-Z0-9_.-]*=/.test(cleanTerm)) {
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'modifier',
                            lookups: 0,
                            note: 'modificador no reconocido (ignorado según RFC 7208 §6.2)'
                        });
                    } else {
                        hasUnknownMechanism = true;
                        warnings.push('Mecanismo desconocido o sintaxis inválida "' + rawTerm + '" (permerror según RFC 7208 §4.6.1).');
                        mechanisms.push({
                            raw: rawTerm,
                            clean: cleanTerm,
                            type: 'unknown',
                            lookups: 0,
                            permerror: true,
                            note: 'mecanismo desconocido o sintaxis inválida (permerror)'
                        });
                    }
                }

                // 2. Evaluar redirect al final (RFC 7208 §6.1)
                for (let i = 0; i < redirectTerms.length; i++) {
                    const item = redirectTerms[i];
                    const rawTerm = item.rawTerm;
                    const cleanTerm = item.cleanTerm;
                    const redTarget = cleanTerm.substring(9).trim();
                    const hasMacro = /%\{/.test(cleanTerm);
                    const invalidMacro = hasInvalidMacro(cleanTerm);
                    const mech = {
                        raw: rawTerm,
                        clean: cleanTerm,
                        type: 'redirect',
                        target: redTarget,
                        macro: hasMacro
                    };
                    if (invalidMacro) {
                        hasUnknownMechanism = true;
                        mech.lookups = 0;
                        mech.permerror = true;
                        mech.note = 'macro no válida (permerror según RFC 7208 §7)';
                        warnings.push('Macro no válida en "' + rawTerm + '" (permerror según RFC 7208 §7).');
                    } else if (redirectTerms.length > 1) {
                        mech.lookups = 0;
                        mech.permerror = true;
                        mech.note = 'múltiples modificadores redirect en el mismo registro (permerror según RFC 7208 §6)';
                    } else if (!redTarget) {
                        hasUnknownMechanism = true;
                        mech.lookups = 0;
                        mech.permerror = true;
                        mech.note = 'modificador redirect sin dominio (permerror según RFC 7208 §6.1)';
                        warnings.push('Modificador redirect sin dominio en "' + rawTerm + '" (permerror según RFC 7208 §6.1).');
                    } else if (hasAll) {
                        mech.lookups = 0;
                        mech.note = 'ignorado por presencia de mecanismo all en el mismo registro (RFC 7208 §6.1)';
                    } else {
                        addLookup(mech);
                        if (hasMacro) {
                            hasUnevaluableMacro = true;
                            mech.note = 'no evaluable: usa macros';
                        } else if (!checkTimeout() && queryCount < maxQueries) {
                            mech.child = await evaluateDomain(redTarget, visitedChain.concat([norm]));
                            if (mech.child && mech.child.record && spfRecordHasPlusAll(mech.child.record)) {
                                hasPlusAll = true;
                            }
                        } else {
                            incomplete = true;
                        }
                    }
                    mechanisms.push(mech);
                }

                return {
                    domain: targetDomain,
                    record: record,
                    mechanisms: mechanisms
                };
            }

            const root = await evaluateDomain(domain, [], initialData);

            if (voidLookups > 2) {
                warnings.push('Hay más de 2 consultas sin resultado (' + voidLookups + ' void lookups). La RFC recomienda limitar las consultas sin resultado a 2; algunos receptores devuelven permerror al superarlo (RFC 7208 §4.6.4).');
            }

            return {
                domain: domain,
                lookupCount: lookupCount,
                queryCount: queryCount,
                voidLookups: voidLookups,
                hasLoop: hasLoop,
                hasIncludeNoSpf: hasIncludeNoSpf,
                hasMxOverflow: hasMxOverflow,
                hasUnknownMechanism: hasUnknownMechanism,
                hasIncludedMultipleRecords: hasIncludedMultipleRecords,
                includedMultipleRecordsDomain: includedMultipleRecordsDomain,
                hasPlusAll: hasPlusAll,
                hasUnevaluableMacro: hasUnevaluableMacro,
                warnings: warnings,
                incomplete: incomplete,
                root: root
            };
        }

        function renderSpfCounter(domain, res) {
            const box = document.getElementById('spfCounterBox');
            const summary = document.getElementById('spfCounterSummary');
            const badge = document.getElementById('spfCounterBadge');
            const warningEl = document.getElementById('spfCounterWarning');
            const listEl = document.getElementById('spfMechanismsList');
            const countEl = document.getElementById('spfMechanismsCount');

            box.classList.remove('hidden');
            listEl.innerHTML = '';

            if (res.noSpf) {
                summary.textContent = 'El dominio no publica un registro SPF.';
                badge.textContent = 'Sin registro';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-white/5 border border-white/10 text-slate-300';
                warningEl.classList.add('hidden');
                countEl.textContent = '0 consultas DNS';
                return;
            }

            if (res.rootMultipleRecords) {
                summary.textContent = 'El dominio analizado publica más de un registro v=spf1 en DNS. SPF devuelve permerror y no es posible calcular un número válido.';
                badge.textContent = 'Múltiples registros (permerror)';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-red-500/20 text-red-400';
                warningEl.textContent = 'Si el dominio analizado publica más de un registro v=spf1 en el mismo dominio, la RFC 7208 establece que la evaluación falla con permerror.';
                warningEl.classList.remove('hidden');
                countEl.textContent = 'Inválido';
                return;
            }

            const total = (typeof res.lookupCount === 'number') ? res.lookupCount : 0;
            countEl.textContent = (res.incomplete || res.hasUnevaluableMacro ? 'Al menos ' : '') + total + ' de 10 consultas DNS';

            if (res.hasLoop) {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS, pero contiene un lazo de include (permerror según RFC 7208).';
                badge.textContent = 'Lazo de include (permerror)';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-red-500/20 text-red-400';
            } else if (res.hasIncludeNoSpf) {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS, pero incluye un dominio sin registro SPF (permerror según RFC 7208 §5.2).';
                badge.textContent = 'Include sin SPF (permerror)';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-red-500/20 text-red-400';
            } else if (res.hasMxOverflow) {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS, pero un mecanismo MX devolvió más de 10 nombres (permerror según RFC 7208 §4.6.4).';
                badge.textContent = 'Más de 10 nombres MX (permerror)';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-red-500/20 text-red-400';
            } else if (res.hasUnknownMechanism) {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS, pero contiene un mecanismo desconocido o sintaxis inválida (permerror según RFC 7208 §4.6.1).';
                badge.textContent = 'Sintaxis inválida (permerror)';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-red-500/20 text-red-400';
            } else if (res.hasIncludedMultipleRecords) {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS, pero el dominio incluido ' + (res.includedMultipleRecordsDomain || '') + ' publica múltiples registros SPF (permerror según RFC 7208 §3.2).';
                badge.textContent = 'Múltiples registros en include (permerror)';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-red-500/20 text-red-400';
            } else if (total > 10) {
                summary.textContent = res.incomplete
                    ? 'Tu SPF usa al menos ' + total + ' de 10 consultas DNS (supera el límite; SPF devuelve permerror). Conteo parcial interrumpido.'
                    : 'Tu SPF usa ' + total + ' de 10 consultas DNS (supera el límite; SPF devuelve permerror).';
                badge.textContent = 'Supera el límite; SPF devuelve permerror';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-red-500/20 text-red-400';
            } else if (res.incomplete) {
                summary.textContent = 'Tu SPF usa al menos ' + total + ' de 10 consultas DNS. Conteo parcial interrumpido.';
                badge.textContent = 'No pudimos terminar el conteo';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-amber-500/20 text-amber-400';
                warningEl.textContent = (res.warnings && res.warnings.length)
                    ? res.warnings.join(' · ')
                    : 'Se alcanzó el límite de seguridad de consultas en el navegador o un servidor DNS no respondió a tiempo.';
                warningEl.classList.remove('hidden');
                if (res.root && res.root.mechanisms) {
                    renderMechanismsTree(res.root.mechanisms, listEl);
                }
                return;
            } else if (res.hasUnevaluableMacro) {
                summary.textContent = 'Tu SPF usa al menos ' + total + ' de 10 consultas DNS. Contiene include o redirect con macros que impiden una evaluación estática completa.';
                badge.textContent = 'No evaluable';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-amber-500/20 text-amber-400';
            } else if (res.hasPlusAll) {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS. La política +all autoriza cualquier origen en SPF y requiere atención.';
                badge.textContent = 'Requiere atención';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-amber-500/20 text-amber-400';
            } else if (res.voidLookups > 2) {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS. La RFC recomienda limitar las consultas sin resultado a 2; algunos receptores devuelven permerror al superarlo.';
                badge.textContent = 'Requiere atención';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-amber-500/20 text-amber-400';
            } else if (total <= 7) {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS.';
                badge.textContent = 'Dentro del límite';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-emerald-500/20 text-emerald-400';
            } else {
                summary.textContent = 'Tu SPF usa ' + total + ' de 10 consultas DNS.';
                badge.textContent = 'Cerca del límite';
                badge.className = 'px-3 py-1 rounded-full text-xs font-bold self-start bg-amber-500/20 text-amber-400';
            }

            if (res.warnings && res.warnings.length > 0) {
                warningEl.textContent = res.warnings.join(' · ');
                warningEl.classList.remove('hidden');
            } else {
                warningEl.classList.add('hidden');
            }

            if (res.root && res.root.mechanisms) {
                renderMechanismsTree(res.root.mechanisms, listEl);
            }
        }

        function renderMechanismsTree(mechanisms, container) {
            for (let i = 0; i < mechanisms.length; i++) {
                const m = mechanisms[i];
                const card = document.createElement('div');
                card.className = 'p-3 rounded-lg bg-white/5 border border-white/5 flex flex-col gap-2 text-xs';

                const header = document.createElement('div');
                header.className = 'flex items-center justify-between gap-2';

                const termCode = document.createElement('code');
                termCode.className = 'font-mono text-white text-xs break-all';
                termCode.textContent = m.raw;

                const costBadge = document.createElement('span');
                if (m.lookups > 0) {
                    costBadge.className = 'text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-slate-800 text-slate-300';
                    costBadge.textContent = '+1 consulta';
                } else {
                    costBadge.className = 'text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-slate-800 text-slate-400';
                    costBadge.textContent = '0 consultas';
                }

                header.appendChild(termCode);
                header.appendChild(costBadge);
                card.appendChild(header);

                if (m.note) {
                    const noteDiv = document.createElement('div');
                    noteDiv.className = 'text-slate-400 text-xs';
                    noteDiv.textContent = m.note;
                    card.appendChild(noteDiv);
                }

                if (m.permerrorCutoff) {
                    const cutoffDiv = document.createElement('div');
                    cutoffDiv.className = 'text-red-400 text-xs font-semibold';
                    cutoffDiv.textContent = 'Punto de corte: la evaluación real se habría detenido aquí con permerror al superar las 10 consultas.';
                    card.appendChild(cutoffDiv);
                }

                if (m.child) {
                    if (m.child.noSpfPermerror) {
                        const noSpfDiv = document.createElement('div');
                        noSpfDiv.className = 'text-red-400 text-xs';
                        noSpfDiv.textContent = m.type === 'redirect'
                            ? 'El destino no publica registro SPF (permerror según RFC 7208 §6.1)'
                            : 'El destino no publica registro SPF (permerror según RFC 7208 §5.2)';
                        card.appendChild(noSpfDiv);
                    } else if (m.child.servfail) {
                        const sfDiv = document.createElement('div');
                        sfDiv.className = 'text-slate-400 text-xs';
                        sfDiv.textContent = 'El servidor DNS devolvió SERVFAIL';
                        card.appendChild(sfDiv);
                    } else if (m.child.dnsError) {
                        const errDiv = document.createElement('div');
                        errDiv.className = 'text-slate-400 text-xs';
                        errDiv.textContent = 'El servidor DNS devolvió un error de consulta';
                        card.appendChild(errDiv);
                    } else if (m.child.loop) {
                        const loopDiv = document.createElement('div');
                        loopDiv.className = 'text-red-400 text-xs';
                        loopDiv.textContent = 'Hay un lazo de include (permerror según RFC 7208)';
                        card.appendChild(loopDiv);
                    } else if (m.child.multipleRecords) {
                        const multDiv = document.createElement('div');
                        multDiv.className = 'text-red-400 text-xs';
                        multDiv.textContent = 'El dominio incluido ' + (m.child.domain || '') + ' tiene múltiples registros v=spf1 (permerror)';
                        card.appendChild(multDiv);
                    } else if (m.child.mechanisms && m.child.mechanisms.length > 0) {
                        const subContainer = document.createElement('div');
                        subContainer.className = 'ml-2 pl-2 border-l-2 border-white/10 space-y-2 mt-2';
                        renderMechanismsTree(m.child.mechanisms, subContainer);
                        card.appendChild(subContainer);
                    }
                }

                container.appendChild(card);
            }
        }

        function analyzeSpf(record) {
            if (!record) return { status: 'none', label: 'No detectado', text: 'No encontramos un registro SPF. El dominio no publica qué servidores están autorizados.' };
            if (spfRecordHasPlusAll(record)) {
                return { status: 'warn', label: 'Requiere atención', text: 'La política +all (o all sin calificador) autoriza cualquier origen en SPF. Revisa todos tus remitentes antes de aplicar una política restrictiva.' };
            }
            return { status: 'ok', label: 'Configurado', text: record };
        }

        function setResult(key, result) {
            const icon = document.getElementById('icon-' + key);
            const txt = document.getElementById('txt-' + key);
            const badge = document.getElementById('badge-' + key);
            if (result.status === 'ok') {
                icon.innerHTML = '<i class="fa-solid fa-check text-xs text-emerald-400"></i>';
                icon.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-500/20';
                badge.textContent = result.label;
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-emerald-500/20 text-emerald-400';
            } else if (result.status === 'warn') {
                icon.innerHTML = '<i class="fa-solid fa-exclamation text-xs text-amber-400"></i>';
                icon.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-500/20';
                badge.textContent = result.label;
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-amber-500/20 text-amber-400';
            } else if (result.status === 'fail' || result.status === 'error') {
                icon.innerHTML = '<i class="fa-solid text-xs text-red-400 ' + 'fa-xmark"></i>';
                icon.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-red-500/20';
                badge.textContent = result.label;
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-red-500/20 text-red-400';
            } else if (result.status === 'unknown') {
                icon.innerHTML = '<i class="fa-solid fa-question text-xs text-slate-300"></i>';
                icon.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-white/5 border border-white/10';
                badge.textContent = result.label;
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-white/5 border border-white/10 text-slate-300';
            } else {
                icon.innerHTML = '<i class="fa-solid fa-minus text-xs text-slate-300"></i>';
                icon.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-white/5 border border-white/10';
                badge.textContent = result.label;
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-white/5 border border-white/10 text-slate-300';
            }
            txt.textContent = result.text;
        }

        // MOBILE MENU
        function toggleMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const iconOpen = document.getElementById('menuIconOpen');
            const iconClose = document.getElementById('menuIconClose');
            menu.classList.toggle('hidden');
            iconOpen.classList.toggle('hidden');
            iconClose.classList.toggle('hidden');
        }
        function closeMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const iconOpen = document.getElementById('menuIconOpen');
            const iconClose = document.getElementById('menuIconClose');
            menu.classList.add('hidden');
            iconOpen.classList.remove('hidden');
            iconClose.classList.add('hidden');
        }
        (function () {
            var params = new URLSearchParams(window.location.search);
            var hasD = params.has('d');
            var hasDomain = params.has('domain');
            if (!hasD && !hasDomain) return;
            var raw = hasD ? params.get('d') : params.get('domain');
            var validation = validateDomainInput(raw);
            if (validation.valid) {
                var input = document.getElementById('dominioInput');
                if (input) {
                    input.value = validation.domain;
                    handleDiagnostico({ preventDefault: function () {} }, true);
                }
            } else {
                showDiagError('Escribe un dominio válido, por ejemplo tuempresa.com');
            }
        })();
