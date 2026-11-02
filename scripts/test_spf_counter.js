#!/usr/bin/env node
/**
 * Test suite reproducible para el contador de consultas DNS de spf-checker.html según RFC 7208.
 *
 * Utiliza:
 * 1. Casos con DNS simulado (registros falsos) para validar de forma determinista:
 *    - include anidados
 *    - lazos de include
 *    - mx con más de 10 nombres
 *    - redirect con all (§6.1)
 *    - void lookups (§4.6.4 vs §5.2)
 *    - macros
 *    - timeouts (5s) y estado incompleto
 *    - SERVFAIL (no void, marca incompleto)
 *    - corte en la 11ª consulta (punto de corte de permerror)
 *    - conteo > 10 visible aun con timeout/incompleto
 * 2. Prueba de humo con dominios reales (sin conteo exacto fijo) para verificar
 *    conectividad y renderizado sin errores de consola.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try {
    const pw = require('playwright');
    chromium = pw.chromium;
} catch (e1) {
    if (process.env.NODE_PATH) {
        try {
            const pw = require(path.join(process.env.NODE_PATH, 'playwright'));
            chromium = pw.chromium;
        } catch (e2) {}
    }
}
if (!chromium) {
    console.error('ERROR: No se encontró Playwright en el entorno. Asegúrate de tener Playwright disponible o define NODE_PATH.');
    process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || null;

function getMime(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.json': 'application/json; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8'
    };
    return map[ext] || 'application/octet-stream';
}

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, 'http://127.0.0.1');
            let pathname = decodeURIComponent(parsedUrl.pathname);
            if (pathname === '/api/public/diagnosis-notify') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{"ok":true}');
                });
                return;
            }
            if (pathname === '/') pathname = '/spf-checker.html';
            let filePath = path.join(ROOT, pathname);

            if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
                filePath += '.html';
            }

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                res.writeHead(200, {
                    'Content-Type': getMime(filePath),
                    'Access-Control-Allow-Origin': '*'
                });
                fs.createReadStream(filePath).pipe(res);
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found: ' + pathname);
            }
        });

        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            resolve({ server, port });
        });
        server.on('error', reject);
    });
}

function txtAnswer(name, txt) {
    return {
        Status: 0,
        Answer: [
            {
                name: name.endsWith('.') ? name : name + '.',
                type: 16,
                data: `"${txt}"`
            }
        ]
    };
}

function aAnswer(name, ip) {
    return {
        Status: 0,
        Answer: [
            {
                name: name.endsWith('.') ? name : name + '.',
                type: 1,
                data: ip || '192.0.2.1'
            }
        ]
    };
}

// Catálogo de respuestas DNS simuladas para pruebas deterministas
const MOCK_DNS = {
    // 1. Include anidados (2 consultas)
    'test-nested.fake': {
        TXT: { response: txtAnswer('test-nested.fake', 'v=spf1 include:sub1.test-nested.fake -all') }
    },
    'sub1.test-nested.fake': {
        TXT: { response: txtAnswer('sub1.test-nested.fake', 'v=spf1 include:sub2.test-nested.fake -all') }
    },
    'sub2.test-nested.fake': {
        TXT: { response: txtAnswer('sub2.test-nested.fake', 'v=spf1 ip4:192.0.2.1 -all') }
    },

    // 2. Lazos de include
    'test-loop.fake': {
        TXT: { response: txtAnswer('test-loop.fake', 'v=spf1 include:loop-b.test-loop.fake -all') }
    },
    'loop-b.test-loop.fake': {
        TXT: { response: txtAnswer('loop-b.test-loop.fake', 'v=spf1 include:test-loop.fake -all') }
    },

    // 3. MX con más de 10 nombres
    'test-mx-overflow.fake': {
        TXT: { response: txtAnswer('test-mx-overflow.fake', 'v=spf1 mx -all') },
        MX: {
            response: {
                Status: 0,
                Answer: [
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx1.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx2.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx3.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx4.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx5.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx6.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx7.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx8.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx9.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx10.fake.' },
                    { name: 'test-mx-overflow.fake.', type: 15, data: '10 mx11.fake.' }
                ]
            }
        }
    },

    // 4. Redirect junto a all (RFC 7208 §6.1: redirect se ignora)
    'test-redirect-all.fake': {
        TXT: { response: txtAnswer('test-redirect-all.fake', 'v=spf1 include:sub1.test-nested.fake redirect=sub2.test-nested.fake -all') }
    },

    // 5. Void lookups (a, mx, exists con NXDOMAIN o vacío -> 3 void lookups, supera el límite de 2)
    'test-void-lookups.fake': {
        TXT: { response: txtAnswer('test-void-lookups.fake', 'v=spf1 a:nxdomain-a.fake mx:empty-mx.fake exists:nxdomain-exists.fake ~all') }
    },
    'nxdomain-a.fake': {
        A: { response: { Status: 3 } }, // NXDOMAIN
        AAAA: { response: { Status: 3 } }
    },
    'empty-mx.fake': {
        MX: { response: { Status: 0, Answer: [] } } // NOERROR, 0 records
    },
    'nxdomain-exists.fake': {
        A: { response: { Status: 3 } }, // NXDOMAIN
        AAAA: { response: { Status: 3 } }
    },

    // 5b. Host con solo AAAA (no debe contarse como void lookup)
    'test-a-aaaa-only.fake': {
        TXT: { response: txtAnswer('test-a-aaaa-only.fake', 'v=spf1 a:ipv6-only.fake ~all') }
    },
    'ipv6-only.fake': {
        A: { response: { Status: 0, Answer: [] } },
        AAAA: { response: { Status: 0, Answer: [{ name: 'ipv6-only.fake.', type: 28, data: '2001:db8::1' }] } }
    },

    // 6. Include a dominio sin SPF (RFC 7208 §5.2: permerror directo, no es void lookup)
    'test-include-no-spf.fake': {
        TXT: { response: txtAnswer('test-include-no-spf.fake', 'v=spf1 include:no-spf-target.fake -all') }
    },
    'no-spf-target.fake': {
        TXT: { response: { Status: 0, Answer: [] } } // Sin SPF
    },

    // 7. Macros en exists / a
    'test-macros.fake': {
        TXT: { response: txtAnswer('test-macros.fake', 'v=spf1 exists:%{i}._spf.test-macros.fake a:%{d}._spf.test-macros.fake ~all') }
    },

    // 7b. Macros en include y redirect (no deben consultarse literalmente ni dar falso permerror)
    'test-macros-include.fake': {
        TXT: { response: txtAnswer('test-macros-include.fake', 'v=spf1 include:%{d}._spf.test-macros.fake redirect=%{d}._spf.test-macros.fake') }
    },

    // 8. SERVFAIL (no es void, marca conteo incompleto)
    'test-servfail.fake': {
        TXT: { response: txtAnswer('test-servfail.fake', 'v=spf1 include:broken-servfail.fake -all') }
    },
    'broken-servfail.fake': {
        TXT: { response: { Status: 2 } } // SERVFAIL
    },

    // 8b. REFUSED (RCODE 5 != 0/2/3, marca conteo incompleto, no "sin SPF")
    'test-refused.fake': {
        TXT: { response: txtAnswer('test-refused.fake', 'v=spf1 include:broken-refused.fake -all') }
    },
    'broken-refused.fake': {
        TXT: { response: { Status: 5 } } // REFUSED
    },

    // 9. Timeout global de 5s
    'test-timeout.fake': {
        TXT: { response: txtAnswer('test-timeout.fake', 'v=spf1 include:slow-delay.fake -all') }
    },
    'slow-delay.fake': {
        TXT: {
            delay: 5500,
            response: txtAnswer('slow-delay.fake', 'v=spf1 ip4:192.0.2.1 -all')
        }
    },

    // 10. Conteo que supera 10 consultas (12 mecanismos A) y marca el corte en el 11º
    'test-exceed-10.fake': {
        TXT: {
            response: txtAnswer(
                'test-exceed-10.fake',
                'v=spf1 a:h1.fake a:h2.fake a:h3.fake a:h4.fake a:h5.fake a:h6.fake a:h7.fake a:h8.fake a:h9.fake a:h10.fake a:h11.fake a:h12.fake -all'
            )
        }
    },

    // 11. Conteo que ya supera 10 consultas (11 mecanismos A) y luego tiene timeout/incompleto:
    // debe mostrar que se superó aunque el resto sea incompleto
    'test-exceed-timeout.fake': {
        TXT: {
            response: txtAnswer(
                'test-exceed-timeout.fake',
                'v=spf1 a:h1.fake a:h2.fake a:h3.fake a:h4.fake a:h5.fake a:h6.fake a:h7.fake a:h8.fake a:h9.fake a:h10.fake a:h11.fake include:slow-delay.fake -all'
            )
        }
    },

    // 12. Posición de redirect: al inicio se evalúa después de todos los mecanismos (§6.1, consulta 11 corte)
    'test-redirect-position.fake': {
        TXT: {
            response: txtAnswer(
                'test-redirect-position.fake',
                'v=spf1 redirect=sub2.test-nested.fake a:h1.fake a:h2.fake a:h3.fake a:h4.fake a:h5.fake a:h6.fake a:h7.fake a:h8.fake a:h9.fake a:h10.fake'
            )
        }
    },

    // 13. Sintaxis inválida en include (sin dos puntos) o mecanismo desconocido (§4.6.1 permerror)
    'test-unknown-mech.fake': {
        TXT: { response: txtAnswer('test-unknown-mech.fake', 'v=spf1 include broken.fake -all') }
    },

    // 14. Dominio incluido con múltiples registros v=spf1 (§3.2 permerror, no oculta conteo)
    'test-included-duplicate.fake': {
        TXT: { response: txtAnswer('test-included-duplicate.fake', 'v=spf1 include:sub-dup.fake ~all') }
    },
    'sub-dup.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    { name: 'sub-dup.fake.', type: 16, data: '"v=spf1 ip4:192.0.2.1 -all"' },
                    { name: 'sub-dup.fake.', type: 16, data: '"v=spf1 ip4:192.0.2.2 -all"' }
                ]
            }
        }
    },

    // 15. Fragmentos TXT RFC 7208 §3.3: corte en IP, dominio y espacio
    'test-chunked-ip.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    { name: 'test-chunked-ip.fake.', type: 16, data: '"v=spf1 ip4:192.0." "2.1 -all"' }
                ]
            }
        }
    },
    'test-chunked-domain.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    { name: 'test-chunked-domain.fake.', type: 16, data: '"v=spf1 include:sub" "1.test-nested.fake -all"' }
                ]
            }
        }
    },
    'test-chunked-space.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    { name: 'test-chunked-space.fake.', type: 16, data: '"v=spf1 ip4:192.0.2.1 " "-all"' }
                ]
            }
        }
    },

    // 16. Falsos verdes prevenidos
    // a) v=spf10 no es SPF (RFC 7208 exige v=spf1)
    'test-spf10.fake': {
        TXT: { response: txtAnswer('test-spf10.fake', 'v=spf10 ip4:192.0.2.1 -all') }
    },
    // b) ip4 e ip6 inválidos o vacíos
    'test-invalid-ip4.fake': {
        TXT: { response: txtAnswer('test-invalid-ip4.fake', 'v=spf1 ip4:999.999.999.999 -all') }
    },
    'test-invalid-ip6.fake': {
        TXT: { response: txtAnswer('test-invalid-ip6.fake', 'v=spf1 ip6:2001:db8:::1 -all') }
    },
    // c) Dos redirect= en un registro (RFC 7208 §6 permerror)
    'test-multiple-redirect.fake': {
        TXT: { response: txtAnswer('test-multiple-redirect.fake', 'v=spf1 redirect=sub1.test-nested.fake redirect=sub2.test-nested.fake') }
    },
    // d) Modificador con calificador es sintaxis inválida (§4.6.1)
    'test-qualified-modifier.fake': {
        TXT: { response: txtAnswer('test-qualified-modifier.fake', 'v=spf1 -redirect=sub1.test-nested.fake -all') }
    },
    // e) include: vacío es sintaxis inválida permerror (§5.2)
    'test-empty-include.fake': {
        TXT: { response: txtAnswer('test-empty-include.fake', 'v=spf1 include: -all') }
    },

    // 17. Fragmentación real de proveedores (conteo exacto con dominios .fake)
    'test-real-chunked-microsoft.fake': {
        TXT: {
            response: txtAnswer(
                'test-real-chunked-microsoft.fake',
                'v=spf1 include:_spf-a.microsoft.fake include:_spf-b.microsoft.fake include:_spf-ssg-a.msft.fake include:_spf1-meo.microsoft.fake -all'
            )
        }
    },
    '_spf-a.microsoft.fake': {
        TXT: { response: txtAnswer('_spf-a.microsoft.fake', 'v=spf1 ip4:216.99.5.67 ip4:216.99.5.68 include:spf.protection.outlook.fake ~all') }
    },
    'spf.protection.outlook.fake': {
        TXT: { response: txtAnswer('spf.protection.outlook.fake', 'v=spf1 ip4:40.92.0.0/15 ~all') }
    },
    '_spf-b.microsoft.fake': {
        TXT: { response: txtAnswer('_spf-b.microsoft.fake', 'v=spf1 ip4:207.46.22.35 ~all') }
    },
    '_spf-ssg-a.msft.fake': {
        TXT: { response: txtAnswer('_spf-ssg-a.msft.fake', 'v=spf1 ip4:104.44.112.128/25 ~all') }
    },
    '_spf1-meo.microsoft.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: '_spf1-meo.microsoft.fake.',
                        type: 16,
                        data: '"v=spf1 ip4:52.235.253.128 ip4:20." "69.8.108/30 ~all"'
                    }
                ]
            }
        }
    },

    'test-real-chunked-amazon.fake': {
        TXT: {
            response: txtAnswer(
                'test-real-chunked-amazon.fake',
                'v=spf1 include:spf1.amazon.fake include:spf2.amazon.fake include:amazonses.fake -all'
            )
        }
    },
    'spf1.amazon.fake': {
        TXT: { response: txtAnswer('spf1.amazon.fake', 'v=spf1 ip4:207.171.160.0/19 -all') }
    },
    'spf2.amazon.fake': {
        TXT: { response: txtAnswer('spf2.amazon.fake', 'v=spf1 ip4:176.32.105.0/24 include:spf3.amazon.fake -all') }
    },
    'spf3.amazon.fake': {
        TXT: { response: txtAnswer('spf3.amazon.fake', 'v=spf1 ip4:52.95.48.152/29 -all') }
    },
    'amazonses.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'amazonses.fake.',
                        type: 16,
                        data: '"v=spf1 ip4:199.255.192.0/22 ip4:24.110.64.0/18 " "ip4:98.77.0.0/16 -all"'
                    }
                ]
            }
        }
    },

    'test-real-chunked-hubspot.fake': {
        TXT: { response: txtAnswer('test-real-chunked-hubspot.fake', 'v=spf1 redirect=_hspf.hubspot.fake') }
    },
    '_hspf.hubspot.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: '_hspf.hubspot.fake.',
                        type: 16,
                        data: '"v=spf1 include:_hspf1.hubspot.fake ip4:54.174.53.128/30 ip4" ":185.250.236.0/22 -all"'
                    }
                ]
            }
        }
    },
    '_hspf1.hubspot.fake': {
        TXT: { response: txtAnswer('_hspf1.hubspot.fake', 'v=spf1 ip4:192.254.112.0/20 -all') }
    },

    'test-real-chunked-zoho.fake': {
        TXT: { response: txtAnswer('test-real-chunked-zoho.fake', 'v=spf1 include:spf.zoho.fake include:zcsend.fake -all') }
    },
    'spf.zoho.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'spf.zoho.fake.',
                        type: 16,
                        data: '"v=spf1 ip4:136.143.188.0/24 ip4:169.148.12" "9.0/24 ip4:" "199.67.90.0/24 -all"'
                    }
                ]
            }
        }
    },
    'zcsend.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'zcsend.fake.',
                        type: 16,
                        data: '"v=spf1 ip4:135.84.81.0/24 ip6:2607:13" "c0:0004::/116 ~all"'
                    }
                ]
            }
        }
    },

    'test-chunked-literal-google.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'test-chunked-literal-google.fake.',
                        type: 16,
                        data: '"v=spf1 include:_spf.goo" "gle.fake -all"'
                    }
                ]
            }
        }
    },
    '_spf.google.fake': {
        TXT: { response: txtAnswer('_spf.google.fake', 'v=spf1 ip4:35.190.247.0/24 -all') }
    },

    // 17b. Casos de timeout y macros extendidos
    'test-timeout-permerror.fake': {
        TXT: { response: txtAnswer('test-timeout-permerror.fake', 'v=spf1 ip4:999.999.999.999 include:slow-delay.fake -all') }
    },
    'test-macro-unclosed.fake': {
        TXT: { response: txtAnswer('test-macro-unclosed.fake', 'v=spf1 include:%{d.fake -all') }
    },
    'test-macro-stray-percent.fake': {
        TXT: { response: txtAnswer('test-macro-stray-percent.fake', 'v=spf1 include:sub1.test-nested.fake%x -all') }
    },
    'test-macro-crt-directive.fake': {
        TXT: { response: txtAnswer('test-macro-crt-directive.fake', 'v=spf1 include:%{c}.fake -all') }
    },
    'test-macro-crt-exp.fake': {
        TXT: { response: txtAnswer('test-macro-crt-exp.fake', 'v=spf1 include:sub1.test-nested.fake exp=exp.%{c}.fake -all') }
    },

    // 18. Casos menores Sección B
    'test-ip4-leading-zero.fake': {
        TXT: { response: txtAnswer('test-ip4-leading-zero.fake', 'v=spf1 ip4:192.168.001.1 -all') }
    },
    'test-ip4-cidr-leading-zero.fake': {
        TXT: { response: txtAnswer('test-ip4-cidr-leading-zero.fake', 'v=spf1 ip4:192.168.1.1/08 -all') }
    },
    'test-a-cidr-invalid.fake': {
        TXT: { response: txtAnswer('test-a-cidr-invalid.fake', 'v=spf1 a:h1.fake/33 -all') }
    },
    'test-mx-cidr-invalid.fake': {
        TXT: { response: txtAnswer('test-mx-cidr-invalid.fake', 'v=spf1 mx/99 -all') }
    },
    'test-empty-a.fake': {
        TXT: { response: txtAnswer('test-empty-a.fake', 'v=spf1 a: -all') }
    },
    'test-empty-mx.fake': {
        TXT: { response: txtAnswer('test-empty-mx.fake', 'v=spf1 mx: -all') }
    },
    'test-empty-exists.fake': {
        TXT: { response: txtAnswer('test-empty-exists.fake', 'v=spf1 exists: -all') }
    },
    'test-duplicate-exp.fake': {
        TXT: { response: txtAnswer('test-duplicate-exp.fake', 'v=spf1 exp=sub1.test-nested.fake exp=sub2.test-nested.fake -all') }
    },
    'test-invalid-macro.fake': {
        TXT: { response: txtAnswer('test-invalid-macro.fake', 'v=spf1 a:%{z}._spf.test-macros.fake -all') }
    },
    'test-tab-separator.fake': {
        TXT: { response: txtAnswer('test-tab-separator.fake', 'v=spf1\tinclude:sub1.test-nested.fake\t-all') }
    },
    'test-ddd-decode.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'test-ddd-decode.fake.',
                        type: 16,
                        data: '"v=spf1\\032ip4:192.0.2.1\\032-all"'
                    }
                ]
            }
        }
    },
    'test-space-initial.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'test-space-initial.fake.',
                        type: 16,
                        data: '" v=spf1 -all"'
                    }
                ]
            }
        }
    },
    'test-chunked-no-space.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'test-chunked-no-space.fake.',
                        type: 16,
                        data: '"v=spf1 include:sub2.test-" "nested.fake -all"'
                    }
                ]
            }
        }
    },
    'test-plus-all.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'test-plus-all.fake.',
                        type: 16,
                        data: '"v=spf1 +all"'
                    }
                ]
            }
        }
    },
    'test-include-macro.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'test-include-macro.fake.',
                        type: 16,
                        data: '"v=spf1 include:%{d}._spf.fake -all"'
                    }
                ]
            }
        }
    },
    'test-redirect-macro.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'test-redirect-macro.fake.',
                        type: 16,
                        data: '"v=spf1 redirect=%{d}._spf.fake"'
                    }
                ]
            }
        }
    },
    'test-macro-d0.fake': {
        TXT: {
            response: {
                Status: 0,
                Answer: [
                    {
                        name: 'test-macro-d0.fake.',
                        type: 16,
                        data: '"v=spf1 include:%{d0}._spf.fake -all"'
                    }
                ]
            }
        }
    },
    'test-nxdomain-race.fake': {
        TXT: {
            byResolver: {
                cloudflare: { response: { Status: 3 } },
                google: {
                    response: txtAnswer('test-nxdomain-race.fake', 'v=spf1 ip4:192.0.2.1 -all'),
                    delay: 400
                },
                proxy: { response: { Status: 3 } },
                alidns: { response: { Status: 3 } }
            }
        }
    },
    'test-proxy-slow-doh-wins.fake': {
        TXT: {
            byResolver: {
                proxy: {
                    response: txtAnswer('test-proxy-slow-doh-wins.fake', 'v=spf1 ip4:192.0.2.99 -all'),
                    delay: 4000
                },
                cloudflare: { response: txtAnswer('test-proxy-slow-doh-wins.fake', 'v=spf1 ip4:192.0.2.1 -all') },
                google: { response: txtAnswer('test-proxy-slow-doh-wins.fake', 'v=spf1 ip4:192.0.2.1 -all') },
                alidns: { response: txtAnswer('test-proxy-slow-doh-wins.fake', 'v=spf1 ip4:192.0.2.1 -all') }
            }
        }
    },
    'test-nested-slow-proxy.fake': {
        TXT: {
            byResolver: {
                proxy: {
                    response: txtAnswer('test-nested-slow-proxy.fake', 'v=spf1 include:sub1.test-nested-slow-proxy.fake -all'),
                    delay: 4000
                },
                cloudflare: { response: txtAnswer('test-nested-slow-proxy.fake', 'v=spf1 include:sub1.test-nested-slow-proxy.fake -all') },
                google: { response: txtAnswer('test-nested-slow-proxy.fake', 'v=spf1 include:sub1.test-nested-slow-proxy.fake -all') }
            }
        }
    },
    'sub1.test-nested-slow-proxy.fake': {
        TXT: {
            byResolver: {
                proxy: {
                    response: txtAnswer('sub1.test-nested-slow-proxy.fake', 'v=spf1 include:sub2.test-nested-slow-proxy.fake -all'),
                    delay: 4000
                },
                cloudflare: { response: txtAnswer('sub1.test-nested-slow-proxy.fake', 'v=spf1 include:sub2.test-nested-slow-proxy.fake -all') },
                google: { response: txtAnswer('sub1.test-nested-slow-proxy.fake', 'v=spf1 include:sub2.test-nested-slow-proxy.fake -all') }
            }
        }
    },
    'sub2.test-nested-slow-proxy.fake': {
        TXT: {
            byResolver: {
                proxy: {
                    response: txtAnswer('sub2.test-nested-slow-proxy.fake', 'v=spf1 ip4:192.0.2.1 -all'),
                    delay: 4000
                },
                cloudflare: { response: txtAnswer('sub2.test-nested-slow-proxy.fake', 'v=spf1 ip4:192.0.2.1 -all') },
                google: { response: txtAnswer('sub2.test-nested-slow-proxy.fake', 'v=spf1 ip4:192.0.2.1 -all') }
            }
        }
    },
    'test-all-resolvers-down.fake': {
        TXT: {
            byResolver: {
                proxy: { abort: true },
                cloudflare: { abort: true },
                google: { abort: true },
                alidns: { abort: true }
            }
        }
    },
    'test-alidns-only.fake': {
        TXT: {
            byResolver: {
                proxy: { abort: true },
                cloudflare: { abort: true },
                google: { abort: true },
                alidns: { response: txtAnswer('test-alidns-only.fake', 'v=spf1 ip4:192.0.2.1 -all') }
            }
        }
    },
    'test-proxy-hung-alidns-wins.fake': {
        TXT: {
            byResolver: {
                proxy: { hang: true },
                cloudflare: { abort: true },
                google: { abort: true },
                alidns: { response: txtAnswer('test-proxy-hung-alidns-wins.fake', 'v=spf1 ip4:192.0.2.1 -all') }
            }
        }
    },
    'test-bare-all.fake': {
        TXT: { response: txtAnswer('test-bare-all.fake', 'v=spf1 ip4:192.0.2.1 all') }
    },
    'test-include-plus-all.fake': {
        TXT: { response: txtAnswer('test-include-plus-all.fake', 'v=spf1 include:plus-all-target.fake -all') }
    },
    'plus-all-target.fake': {
        TXT: { response: txtAnswer('plus-all-target.fake', 'v=spf1 +all') }
    },
    'test-redirect-plus-all.fake': {
        TXT: { response: txtAnswer('test-redirect-plus-all.fake', 'v=spf1 redirect=plus-all-target.fake') }
    }
};

function resolveMockDnsEntry(reqUrl, name, type) {
    if (!MOCK_DNS[name] || MOCK_DNS[name][type] === undefined) return null;
    const entry = MOCK_DNS[name][type];
    if (entry && entry.byResolver) {
        let key = 'default';
        if (reqUrl.includes('cloudflare-dns.com')) key = 'cloudflare';
        else if (reqUrl.includes('dns.google')) key = 'google';
        else if (reqUrl.includes('dns.alidns.com')) key = 'alidns';
        else if (reqUrl.includes('inboxseguro-dns-proxy')) key = 'proxy';
        return entry.byResolver[key] || entry.byResolver.default || null;
    }
    return entry;
}

// Generar entradas A válidas para h1.fake .. h12.fake
for (let i = 1; i <= 12; i++) {
    MOCK_DNS[`h${i}.fake`] = {
        A: { response: aAnswer(`h${i}.fake`, `192.0.2.${i}`) }
    };
}

async function runSuite() {
    console.log('--- INICIANDO SUITE DE PRUEBAS DEL CONTADOR SPF (RFC 7208) ---');
    const onlyDomainsRaw = process.env.SPF_COUNTER_ONLY;
    const onlyDomains = onlyDomainsRaw
        ? new Set(onlyDomainsRaw.split(',').map(s => s.trim()).filter(Boolean))
        : null;
    const runAllSections = !onlyDomains;
    const { server, port } = await startServer();
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Servidor local listo en ${baseUrl}`);

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--host-resolver-rules=MAP panel.inboxseguro.com ~NOTFOUND, MAP www.inboxseguro.com ~NOTFOUND, MAP inboxseguro-dns-proxy.alfredo-9d8.workers.dev ~NOTFOUND, MAP www.googletagmanager.com ~NOTFOUND, MAP www.google-analytics.com ~NOTFOUND, MAP www.clarity.ms ~NOTFOUND'
        ]
    });

    // 1. Casos deterministas con DNS simulado
    const deterministicCases = [
        {
            domain: 'test-nested.fake',
            category: 'Include anidados (2 consultas)',
            expectedLookups: 2,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-loop.fake',
            category: 'Lazo de include (bucle causa permerror)',
            expectedLookups: 2,
            expectedBadge: 'Lazo de include (permerror)',
            expectedWarningText: 'lazo de include'
        },
        {
            domain: 'test-mx-overflow.fake',
            category: 'MX con más de 10 nombres (RFC 7208 permerror)',
            expectedLookups: 1,
            expectedBadge: 'Más de 10 nombres MX (permerror)',
            expectedWarningText: 'más de 10 nombres'
        },
        {
            domain: 'test-redirect-all.fake',
            category: 'Redirect junto a all (§6.1: redirect se ignora)',
            expectedLookups: 2, // sub1 -> sub2 = 2 lookups; redirect=sub2 ignorado (0)
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-void-lookups.fake',
            category: 'Void lookups (§4.6.4: 3 void lookups supera recomendación de 2)',
            expectedLookups: 3,
            expectedBadge: 'Requiere atención',
            expectedWarningText: 'recomienda limitar las consultas sin resultado a 2'
        },
        {
            domain: 'test-a-aaaa-only.fake',
            category: 'Mecanismo a sin IPv4 pero con AAAA (no debe ser void lookup)',
            expectedLookups: 1,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-include-no-spf.fake',
            category: 'Include a dominio sin SPF (§5.2: permerror directo, no es void)',
            expectedLookups: 1,
            expectedBadge: 'Include sin SPF (permerror)',
            expectedWarningText: 'permerror según RFC 7208 §5.2'
        },
        {
            domain: 'test-macros.fake',
            category: 'Mecanismos con macro (no evaluables aquí, suman 1 c/u)',
            expectedLookups: 2,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-macros-include.fake',
            category: 'Include y redirect con macros (no evaluables, al menos N en ámbar)',
            expectedLookups: 2,
            expectedBadge: 'No evaluable',
            expectedSummaryText: 'al menos 2 de 10'
        },
        {
            domain: 'test-servfail.fake',
            category: 'SERVFAIL (no es void, marca incompleto)',
            expectedLookups: null,
            expectedBadge: 'No pudimos terminar el conteo',
            expectedWarningText: 'SERVFAIL',
            expectedSummaryText: 'Tu SPF usa al menos'
        },
        {
            domain: 'test-refused.fake',
            category: 'REFUSED RCODE 5 (no es sin SPF, marca incompleto)',
            expectedLookups: null,
            expectedBadge: 'No pudimos terminar el conteo',
            expectedWarningText: 'RCODE 5',
            expectedSummaryText: 'Tu SPF usa al menos'
        },
        {
            domain: 'test-timeout.fake',
            category: 'Timeout global de 5s (marca incompleto)',
            expectedLookups: null,
            expectedBadge: 'No pudimos terminar el conteo',
            expectedWarningText: '5 segundos',
            expectedSummaryText: 'Tu SPF usa al menos'
        },
        {
            domain: 'test-exceed-10.fake',
            category: 'Supera 10 consultas (12 mecanismos A, corte en el 11º)',
            expectedLookups: 12,
            expectedBadge: 'Supera el límite; SPF devuelve permerror',
            checkCutoff: true
        },
        {
            domain: 'test-exceed-timeout.fake',
            category: 'Supera 10 consultas con timeout posterior: muestra >10 aun incompleto',
            expectedLookups: null, // conteo parcial interrumpido
            expectedBadge: 'Supera el límite; SPF devuelve permerror',
            expectedSummaryText: 'Tu SPF usa al menos'
        },
        {
            domain: 'test-redirect-position.fake',
            category: 'Redirect al inicio (§6.1: se evalúa al final como consulta 11)',
            expectedLookups: 11,
            expectedBadge: 'Supera el límite; SPF devuelve permerror',
            checkCutoff: true
        },
        {
            domain: 'test-unknown-mech.fake',
            category: 'Include sin : o mecanismo desconocido (§4.6.1 permerror)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'permerror según RFC 7208 §4.6.1'
        },
        {
            domain: 'test-included-duplicate.fake',
            category: 'Dominio incluido con múltiples registros v=spf1 (§3.2 permerror sin ocultar conteo)',
            expectedLookups: 1,
            expectedBadge: 'Múltiples registros en include (permerror)',
            expectedSummaryText: 'sub-dup.fake'
        },

        // Fragmentos TXT RFC 7208 §3.3
        {
            domain: 'test-chunked-ip.fake',
            category: 'Fragmentos TXT RFC 7208 §3.3 (corte dentro de IP)',
            expectedLookups: 0,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-chunked-domain.fake',
            category: 'Fragmentos TXT RFC 7208 §3.3 (corte dentro de nombre de dominio)',
            expectedLookups: 2,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-chunked-space.fake',
            category: 'Fragmentos TXT RFC 7208 §3.3 (corte en un espacio)',
            expectedLookups: 0,
            expectedBadge: 'Dentro del límite'
        },

        // Prevención de falsos verdes
        {
            domain: 'test-spf10.fake',
            category: 'v=spf10 no es SPF (RFC 7208 exige v=spf1 seguido de espacio/fin)',
            expectedLookups: 0,
            expectedBadge: 'Sin registro'
        },
        {
            domain: 'test-invalid-ip4.fake',
            category: 'ip4 con formato/CIDR inválido causa permerror (§5.6)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en ip4'
        },
        {
            domain: 'test-invalid-ip6.fake',
            category: 'ip6 con formato/CIDR inválido causa permerror (§5.6)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en ip6'
        },
        {
            domain: 'test-multiple-redirect.fake',
            category: 'Múltiples modificadores redirect causan permerror (RFC 7208 §6)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'más de un modificador redirect'
        },
        {
            domain: 'test-qualified-modifier.fake',
            category: 'Modificador con calificador es sintaxis inválida (§4.6.1)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Modificador con calificador'
        },
        {
            domain: 'test-empty-include.fake',
            category: 'include: vacío es sintaxis inválida permerror (§5.2)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en include'
        },

        // Fragmentación real de proveedores con conteo exacto
        {
            domain: 'test-real-chunked-microsoft.fake',
            category: 'Fragmentación real Microsoft (_spf1-meo corte en IP)',
            expectedLookups: 5,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-real-chunked-amazon.fake',
            category: 'Fragmentación real Amazon (amazonses corte en espacio)',
            expectedLookups: 4,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-real-chunked-hubspot.fake',
            category: 'Fragmentación real HubSpot (_hspf corte en mecanismo ip4)',
            expectedLookups: 2,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-real-chunked-zoho.fake',
            category: 'Fragmentación real Zoho (spf.zoho y zcsend corte en IP/IPv6)',
            expectedLookups: 2,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-chunked-literal-google.fake',
            category: 'Mock literal include:_spf.goo + gle.com',
            expectedLookups: 1,
            expectedBadge: 'Dentro del límite'
        },

        // Casos menores Sección B
        {
            domain: 'test-ip4-leading-zero.fake',
            category: 'ip4 con ceros a la izquierda (192.168.001.1)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en ip4'
        },
        {
            domain: 'test-ip4-cidr-leading-zero.fake',
            category: 'ip4 CIDR con cero a la izquierda (/08)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en ip4'
        },
        {
            domain: 'test-a-cidr-invalid.fake',
            category: 'CIDR inválido en a (a:h1.fake/33)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en mecanismo a'
        },
        {
            domain: 'test-mx-cidr-invalid.fake',
            category: 'CIDR inválido en mx (mx/99)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en mecanismo mx'
        },
        {
            domain: 'test-empty-a.fake',
            category: 'Mecanismo a: vacío como permerror',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en mecanismo a'
        },
        {
            domain: 'test-empty-mx.fake',
            category: 'Mecanismo mx: vacío como permerror',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en mecanismo mx'
        },
        {
            domain: 'test-empty-exists.fake',
            category: 'Mecanismo exists: vacío como permerror',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Sintaxis inválida en mecanismo exists'
        },
        {
            domain: 'test-duplicate-exp.fake',
            category: 'Modificador exp= duplicado como permerror',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'más de un modificador exp'
        },
        {
            domain: 'test-invalid-macro.fake',
            category: 'Macro no válida (%{z}) como permerror',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Macro no válida'
        },
        {
            domain: 'test-tab-separator.fake',
            category: 'Rechazo de tabuladores como separador (RFC 7208 exige espacios)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'tabulador'
        },
        {
            domain: 'test-ddd-decode.fake',
            category: 'Decodificación de \\DDD en extractSpfTxtRecords',
            expectedLookups: 0,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-timeout-permerror.fake',
            category: 'Conteo incompleto con permerror previo (sintaxis inválida + timeout)',
            expectedLookups: 1,
            expectedBadge: 'Sintaxis inválida (permerror)'
        },
        {
            domain: 'test-macro-unclosed.fake',
            category: 'Macro no cerrada (%{d)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)'
        },
        {
            domain: 'test-macro-stray-percent.fake',
            category: 'Carácter % suelto (%x)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)'
        },
        {
            domain: 'test-macro-crt-directive.fake',
            category: 'Macro c/r/t en directiva include (inválido según RFC 7208 §7.3)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)'
        },
        {
            domain: 'test-macro-crt-exp.fake',
            category: 'Macro c/r/t en modificador exp (válido según RFC 7208 §7.3)',
            expectedLookups: 2,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-space-initial.fake',
            category: 'SPF con espacio inicial no es SPF (RFC 7208 §4.5)',
            expectedLookups: 0,
            expectedBadge: 'Sin registro'
        },
        {
            domain: 'test-chunked-no-space.fake',
            category: 'Unión de fragmentos TXT sin espacio (RFC 7208 §3.3)',
            expectedLookups: 1,
            expectedBadge: 'Dentro del límite'
        },
        {
            domain: 'test-plus-all.fake',
            category: 'Política +all no debe mostrarse como verde Dentro del límite',
            expectedLookups: 0,
            expectedBadge: 'Requiere atención'
        },
        {
            domain: 'test-include-macro.fake',
            category: 'include con macros no evaluable (ámbar, al menos N)',
            expectedLookups: 1,
            expectedBadge: 'No evaluable',
            expectedSummaryText: 'al menos 1 de 10'
        },
        {
            domain: 'test-redirect-macro.fake',
            category: 'redirect con macros no evaluable (ámbar, al menos N)',
            expectedLookups: 1,
            expectedBadge: 'No evaluable',
            expectedSummaryText: 'al menos 1 de 10'
        },
        {
            domain: 'test-macro-d0.fake',
            category: 'Macro con dígito 0 (%{d0}) es permerror (RFC 7208 §7.3)',
            expectedLookups: 0,
            expectedBadge: 'Sintaxis inválida (permerror)',
            expectedWarningText: 'Macro no válida'
        },
        {
            domain: 'test-nxdomain-race.fake',
            category: 'NXDOMAIN del proxy se acepta sin consultar DoH (privacidad)',
            expectedLookups: 0,
            expectedBadge: 'Sin registro',
            assertZeroDohForDomain: true
        },
        {
            domain: 'test-proxy-slow-doh-wins.fake',
            category: 'Proxy lento (4s): DoH paralelo debe ganar antes del timeout global',
            expectedLookups: 0,
            expectedBadge: 'Dentro del límite',
            expectedTopScore: 'Correcto'
        },
        {
            domain: 'test-nested-slow-proxy.fake',
            category: 'Includes anidados con proxy lento (4s): DoH paralelo completa el conteo',
            expectedLookups: 2,
            expectedBadge: 'Dentro del límite',
            expectedTopScore: 'Correcto'
        },
        {
            domain: 'test-all-resolvers-down.fake',
            category: 'Todos los resolvers caídos (error DNS, no falso sin SPF)',
            expectDnsErrorAlert: true
        },
        {
            domain: 'test-alidns-only.fake',
            category: 'Solo AliDNS responde con SPF (respaldo DoH)',
            expectedLookups: 0,
            expectedBadge: 'Dentro del límite',
            expectedTopScore: 'Correcto'
        },
        {
            domain: 'test-proxy-hung-alidns-wins.fake',
            category: 'Proxy colgado + CF/Google caídos: AliDNS completa el conteo',
            expectedLookups: 0,
            expectedBadge: 'Dentro del límite',
            expectedTopScore: 'Correcto'
        },
        {
            domain: 'test-bare-all.fake',
            category: 'Mecanismo all sin calificador equivale a +all',
            expectedLookups: 0,
            expectedBadge: 'Requiere atención'
        },
        {
            domain: 'test-include-plus-all.fake',
            category: 'include de dominio con +all debe requerir atención',
            expectedLookups: 1,
            expectedBadge: 'Requiere atención'
        },
        {
            domain: 'test-redirect-plus-all.fake',
            category: 'redirect a dominio con +all debe requerir atención',
            expectedLookups: 1,
            expectedBadge: 'Requiere atención'
        }
    ];

    // 2. Pruebas de humo con dominios reales (sin conteo exacto fijo pero exigiendo resultados concretos)
    const smokeCases = [
        { domain: 'microsoft.com', category: 'Humo real: Microsoft 365', requireConcrete: true, expectedLookups: 6, allowedBadges: ['Dentro del límite', 'Cerca del límite'] },
        { domain: 'amazon.com', category: 'Humo real: Amazon', requireConcrete: true, expectedLookups: 4, allowedBadges: ['Dentro del límite'] },
        { domain: 'hubspot.com', category: 'Humo real: HubSpot', requireConcrete: true, expectedLookups: 4, allowedBadges: ['Dentro del límite'] },
        { domain: 'zoho.com', category: 'Humo real: Zoho', requireConcrete: true, expectedLookups: 4, allowedBadges: ['Dentro del límite'] },
        { domain: 'google.com', category: 'Humo real: Google Workspace', requireConcrete: true, expectedLookups: 1, allowedBadges: ['Dentro del límite'] },
        { domain: 'shopify.com', category: 'Humo real: Shopify', requireConcrete: true, expectedLookups: 4, allowedBadges: ['Dentro del límite'] },
        { domain: 'mailchimp.com', category: 'Humo real: Mailchimp', requireConcrete: true, expectedLookups: 7, allowedBadges: ['Dentro del límite'] },
        { domain: 'github.com', category: 'Humo real: GitHub', requireConcrete: true, expectedLookups: 10, allowedBadges: ['Cerca del límite'] },
        { domain: 'salesforce.com', category: 'Humo real: Salesforce', requireConcrete: true, expectedLookups: 4, allowedBadges: ['Dentro del límite'] },
        { domain: 'paypal.com', category: 'Humo real: PayPal', requireConcrete: true, expectedLookups: 9, allowedBadges: ['Cerca del límite'] },
        { domain: 'outlook.com', category: 'Humo real: Outlook.com', requireConcrete: true, expectedLookups: 1, allowedBadges: ['Dentro del límite'] },
        { domain: 'yahoo.com', category: 'Humo real: Yahoo', requireConcrete: true, expectedLookups: 3, allowedBadges: ['Dentro del límite'] },
        { domain: 'sendgrid.net', category: 'Humo real: SendGrid', requireConcrete: true, expectedLookups: 1, allowedBadges: ['Dentro del límite'] },
        { domain: 'zendesk.com', category: 'Humo real: Zendesk', requireConcrete: true, expectedLookups: 6, allowedBadges: ['Dentro del límite'] },
        { domain: 'atlassian.com', category: 'Humo real: Atlassian', requireConcrete: true, expectedLookups: 6, allowedBadges: ['Dentro del límite'] },
        { domain: 'stripe.com', category: 'Humo real: Stripe', requireConcrete: true, expectedLookups: 7, allowedBadges: ['Dentro del límite'] },
        { domain: 'slack.com', category: 'Humo real: Slack', requireConcrete: true, expectedLookups: 3, allowedBadges: ['Dentro del límite'] },
        { domain: 'intercom.com', category: 'Humo real: Intercom', requireConcrete: true, expectedLookups: 5, allowedBadges: ['Dentro del límite'] },
        { domain: 'test.com', category: 'Humo real: Dominio sin SPF', expectedBadge: 'Sin registro', expectedLookups: 0 },
        { domain: 'badsecurityinc.be', category: 'Humo real: Política +all', requireConcrete: true, allowedBadges: ['Requiere atención'] },
        { domain: 'nxdomain-inboxseguro-test-1234567.com', category: 'Humo real: NXDOMAIN', expectedBadge: 'Sin registro' },
        { domain: 'dominio invalido!!!', category: 'Humo real: Entrada sintácticamente inválida', isInvalidInput: true }
    ];

    const deterministicCasesFiltered = onlyDomains
        ? deterministicCases.filter(tc => onlyDomains.has(tc.domain))
        : deterministicCases;
    const smokeCasesFiltered = onlyDomains
        ? smokeCases.filter(tc => onlyDomains.has(tc.domain))
        : smokeCases;

    const results = [];
    const consoleErrors = [];
    const realDnsSummary = [];

    function isDnsWorkerUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return url.includes('inboxseguro-dns-proxy.alfredo-9d8.workers.dev');
    }

    function isMockDnsUrl(reqUrl) {
        try {
            const parsed = new URL(reqUrl);
            const host = parsed.hostname.toLowerCase();
            if (host === 'inboxseguro-dns-proxy.alfredo-9d8.workers.dev' &&
                parsed.pathname.toLowerCase().includes('/api/dns')) {
                return true;
            }
        } catch (e) {}
        return reqUrl.includes('cloudflare-dns.com/dns-query') ||
            reqUrl.includes('dns.google/resolve') ||
            reqUrl.includes('dns.alidns.com/resolve');
    }

    function mockDnsEntryForRequest(reqUrl) {
        try {
            const parsed = new URL(reqUrl);
            const name = (parsed.searchParams.get('name') || '').toLowerCase().replace(/\.$/, '');
            const type = (parsed.searchParams.get('type') || '').toUpperCase();
            if (MOCK_DNS[name] && MOCK_DNS[name][type] !== undefined) {
                return resolveMockDnsEntry(reqUrl, name, type) || MOCK_DNS[name][type];
            }
        } catch (e) {}
        return null;
    }

    function mockDnsNameFromRequestUrl(reqUrl) {
        try {
            const parsed = new URL(reqUrl);
            return (parsed.searchParams.get('name') || '').toLowerCase().replace(/\.$/, '');
        } catch (e) {
            return '';
        }
    }

    function mockDnsHostKeyFromRequestUrl(reqUrl) {
        if (reqUrl.includes('cloudflare-dns.com')) return 'cloudflare';
        if (reqUrl.includes('dns.google')) return 'google';
        if (reqUrl.includes('dns.alidns.com')) return 'alidns';
        if (reqUrl.includes('inboxseguro-dns-proxy')) return 'proxy';
        return null;
    }

    function createMockDnsRequestCounter(domain) {
        const target = (domain || '').toLowerCase();
        const counts = { cloudflare: 0, google: 0, alidns: 0, proxy: 0 };
        return {
            counts,
            onRequest(reqUrl) {
                if (!isMockDnsUrl(reqUrl)) return;
                if (mockDnsNameFromRequestUrl(reqUrl) !== target) return;
                const key = mockDnsHostKeyFromRequestUrl(reqUrl);
                if (key) counts[key]++;
            }
        };
    }

    function isForbiddenUrl(url) {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            const u = url.toLowerCase();
            return u.includes('panel.inboxseguro.com') ||
                   u.includes('www.inboxseguro.com/api/') ||
                   u.includes('googletagmanager.com') ||
                   u.includes('google-analytics.com') ||
                   u.includes('clarity.ms') ||
                   u.includes('clarity.microsoft.com') ||
                   u.includes('diagnosis-notify') ||
                   u.includes('diagnosis-ticket') ||
                   u.includes('session-status') ||
                   u.includes('/api/notify') ||
                   u.includes('/api/ticket');
        }
        const host = parsed.hostname.toLowerCase();
        const pathname = parsed.pathname.toLowerCase();

        if (host === 'www.inboxseguro.com' && pathname.startsWith('/api/')) {
            return true;
        }

        // 1. Bloqueo estricto por host
        if (host === 'panel.inboxseguro.com' || host.endsWith('.panel.inboxseguro.com') ||
            host.includes('google-analytics.com') ||
            host.includes('googletagmanager.com') ||
            host.includes('clarity.ms') ||
            host.includes('clarity.microsoft.com')) {
            return true;
        }

        // 2. Bloqueo estricto por ruta (en www.inboxseguro.com o cualquier host)
        const forbiddenPaths = [
            'diagnosis-ticket',
            'diagnosis-notify',
            'session-status',
            '/api/notify',
            '/api/ticket'
        ];
        for (const p of forbiddenPaths) {
            if (pathname.includes(p)) return true;
        }

        return false;
    }

    function shouldTrackForbiddenRequest(reqUrl, getMocksEnabled) {
        if (getMocksEnabled && getMocksEnabled() && isMockDnsUrl(reqUrl) && mockDnsEntryForRequest(reqUrl)) {
            return false;
        }
        return isForbiddenUrl(reqUrl) || isDnsWorkerUrl(reqUrl);
    }

    class SecurityRequestTracker {
        constructor(context, { allowPassThrough = false, getMocksEnabled = null } = {}) {
            this.context = context;
            this.allowPassThrough = allowPassThrough;
            this.getMocksEnabled = getMocksEnabled;
            this.forbiddenRequests = new Map();
            this.blockedCount = 0;

            context.on('request', req => {
                const u = req.url();
                if (shouldTrackForbiddenRequest(u, this.getMocksEnabled)) {
                    this.forbiddenRequests.set(req, { url: u, failed: false, errorText: '', finished: false });
                }
            });

            context.on('requestfailed', req => {
                const entry = this.forbiddenRequests.get(req);
                if (entry) {
                    entry.failed = true;
                    entry.errorText = req.failure() ? req.failure().errorText : '';
                    if (entry.errorText.includes('ERR_BLOCKED_BY_CLIENT')) {
                        this.blockedCount++;
                    }
                }
            });

            context.on('requestfinished', req => {
                const entry = this.forbiddenRequests.get(req);
                if (entry) {
                    entry.finished = true;
                }
            });
        }

        async setupRoute(getMocksEnabled) {
            await this.context.route('**', async (route) => {
                const req = route.request();
                const reqUrl = req.url();

                if (isForbiddenUrl(reqUrl)) {
                    if (!this.allowPassThrough) {
                        return route.abort('blockedbyclient');
                    }
                    return route.continue();
                }

                if (getMocksEnabled && getMocksEnabled() && isMockDnsUrl(reqUrl)) {
                    const entry = mockDnsEntryForRequest(reqUrl);
                    if (entry) {
                        if (entry.delay) {
                            await new Promise(r => setTimeout(r, entry.delay));
                        }
                        if (entry.hang) {
                            return;
                        }
                        if (entry.abort) {
                            return route.abort();
                        }
                        const payload = entry.response !== undefined ? entry.response : entry;
                        return route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify(payload)
                        });
                    }
                }

                if (isDnsWorkerUrl(reqUrl)) {
                    if (!this.allowPassThrough) {
                        return route.abort('blockedbyclient');
                    }
                    return route.continue();
                }

                return route.continue();
            });
        }

        pruneDetachedPending() {
            for (const [req, info] of this.forbiddenRequests.entries()) {
                if (info.failed || info.finished) continue;
                try {
                    const p = req.frame().page();
                    if (p.isClosed()) {
                        this.forbiddenRequests.delete(req);
                    }
                } catch (e) {
                    this.forbiddenRequests.delete(req);
                }
            }
        }

        assertAllBlocked(options = {}) {
            this.pruneDetachedPending();
            const minExpected = options.minExpected || 0;
            const badRequests = [];
            let total = 0;
            for (const [req, info] of this.forbiddenRequests.entries()) {
                total++;
                if (info.finished) {
                    badRequests.push(`Petición prohibida terminó en la red con éxito (leaked): ${info.url}`);
                } else if (!info.failed) {
                    badRequests.push(`Petición prohibida quedó pendiente sin abortar: ${info.url}`);
                } else if (!info.errorText || !info.errorText.includes('ERR_BLOCKED_BY_CLIENT')) {
                    badRequests.push(`Petición prohibida no fue abortada con ERR_BLOCKED_BY_CLIENT (${info.errorText || 'sin errorText'}): ${info.url}`);
                }
            }

            if (minExpected > 0 && total === 0) {
                throw new Error('FALLO DE SEGURIDAD: Se esperaban peticiones prohibidas registradas (>0) pero no se interceptó ninguna.');
            }

            if (badRequests.length > 0) {
                throw new Error('FALLO DE SEGURIDAD: Peticiones no bloqueadas adecuadamente por el cliente:\n  ' + badRequests.join('\n  '));
            }

            if (total > 0 && this.blockedCount !== total) {
                throw new Error(`FALLO DE SEGURIDAD: blockedCount (${this.blockedCount}) no coincide con peticiones prohibidas registradas (${total}).`);
            }

            return { totalForbidden: total, totalBlocked: this.blockedCount };
        }

        async awaitForbiddenSettled(timeoutMs = 8000) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                let pending = false;
                for (const [, info] of this.forbiddenRequests.entries()) {
                    if (!info.finished && !info.failed) {
                        pending = true;
                        break;
                    }
                }
                if (!pending) return;
                await new Promise(r => setTimeout(r, 25));
            }
        }

        async awaitPageForbiddenBlocked(page, timeoutMs = 25000) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                let pendingOnPage = false;
                for (const [req, info] of this.forbiddenRequests.entries()) {
                    if (info.finished || info.failed) continue;
                    try {
                        if (req.frame().page() === page) pendingOnPage = true;
                    } catch (e) {
                        /* frame/page ya destruido */
                    }
                }
                if (!pendingOnPage) return;
                await new Promise(r => setTimeout(r, 50));
            }
        }
    }

    const mainContext = await browser.newContext();

    let currentEnableMocks = true;
    const tracker = new SecurityRequestTracker(mainContext, {
        allowPassThrough: false,
        getMocksEnabled: () => currentEnableMocks
    });
    await tracker.setupRoute(() => currentEnableMocks);

    async function closeTrackedPage(page) {
        try {
            await page.waitForLoadState('load', { timeout: 8000 });
        } catch (e) {}
        try {
            await page.waitForRequest(
                (req) => req.url().includes('panel.inboxseguro.com/api/public/session-status'),
                { timeout: 8000 }
            );
        } catch (e) {}
        try {
            await page.waitForLoadState('networkidle', { timeout: 6000 });
        } catch (e) {}
        await tracker.awaitPageForbiddenBlocked(page, 25000);
        await tracker.awaitForbiddenSettled(5000);
        await page.close();
        tracker.pruneDetachedPending();
        await tracker.awaitForbiddenSettled(3000);
    }

    const DNS_ERROR_ALERT = 'No pudimos consultar los registros DNS. Verifica tu conexión e inténtalo de nuevo.';

    async function createCleanPage(options = { useMocks: true }) {
        currentEnableMocks = !!(options && options.useMocks);
        const suppressResolverUnavailableConsole = !!(options && options.suppressResolverUnavailableConsole);
        const page = await mainContext.newPage();

        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (suppressResolverUnavailableConsole && text.includes('No hay resolvers DNS disponibles')) {
                    return;
                }
                if (text.includes('inboxseguro-dns-proxy') ||
                    text.includes('panel.inboxseguro.com') ||
                    text.includes('ERR_FAILED') ||
                    text.includes('ERR_BLOCKED_BY_CLIENT') ||
                    text.includes('CORS') ||
                    text.includes('status of 404') ||
                    text.includes('status of 401') ||
                    text.includes('status of 400') ||
                    text.includes('Failed to load resource') ||
                    text.includes('favicon')) {
                    return;
                }
                consoleErrors.push(`[Console Error] ${text}`);
            }
        });
        page.on('pageerror', err => {
            consoleErrors.push(`[Page Uncaught Error] ${err.message}`);
        });
        return page;
    }

    // Autorun con ?d=google.com y ?domain=google.com (sin notificaciones)
    if (runAllSections) {
    console.log('\nVerificando autorun con ?d=google.com y ?domain=google.com (no deben disparar notificaciones ni tickets)...');
    for (const q of ['?d=google.com', '?domain=google.com']) {
        const page = await createCleanPage({ useMocks: false });
        let notified = false;
        page.on('request', req => {
            const url = req.url();
            if (url.includes('/api/notify') || url.includes('diagnosis-notify') || url.includes('diagnosis-ticket')) {
                notified = true;
            }
        });

        await page.goto(`${baseUrl}/spf-checker.html${q}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#diagResults:not(.hidden)', { timeout: 15000 });
        const summaryText = await page.$eval('#spfCounterSummary', el => el.textContent.trim());
        const badgeText = await page.$eval('#spfCounterBadge', el => el.textContent.trim());

        if (notified) {
            console.error(`FALLO: El autorun con ${q} disparó una notificación al panel.`);
            results.push({
                domain: q,
                expected: 'Sin notify',
                actual: 'Notificación disparada',
                diff: 'N/A',
                status: 'FALLO'
            });
        } else {
            console.log(`OK: Autorun ${q} completado sin notificaciones. Resultado: "${summaryText}" [${badgeText}]`);
            results.push({
                domain: q,
                expected: 'Sin notify',
                actual: `${badgeText}`,
                diff: 0,
                status: 'OK'
            });
        }
        await closeTrackedPage(page);
    }

    // Pruebas unitarias de isValidIp6 e isValidIp4
    console.log('\n--- PRUEBAS UNITARIAS: isValidIp6 e isValidIp4 (RFC 7208 / IPv6 / IPv4) ---');
    {
        const page = await createCleanPage();
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });

        const ip6Positive = [
            '::ffff:192.0.2.1',
            '64:ff9b::192.0.2.33/128',
            '1:2:3:4:5:6:7::',
            '::2:3:4:5:6:7:8',
            '::',
            '::1',
            '2001:db8::1',
            '2001:db8:85a3:0:0:8a2e:370:7334',
            '2001:db8:85a3::8a2e:370:7334/64',
            '::ffff:0.0.0.0'
        ];
        const ip6Negative = [
            ':::',
            ':1::2',
            '1::2:',
            '::1::2',
            '1:2:3:4:5:6:7:8:9',
            '1:2:3:4:5:6:7:8::',
            '12345::1',
            '2001:db8::1/129',
            '2001:db8::1/08',
            '2001:db8::1/-1',
            '::ffff:192.168.001.1',
            '::ffff:192.168.1.256',
            '64:ff9b::192.0.2.33/0128'
        ];

        let ipErrors = 0;
        for (const ip of ip6Positive) {
            const valid = await page.evaluate(val => isValidIp6(val), ip);
            if (!valid) {
                ipErrors++;
                console.error(`FALLO: IPv6 positivo esperado válido: ${ip}`);
                results.push({ domain: `ip6-valid:${ip}`, expected: 'true', actual: 'false', diff: 1, status: 'FALLO' });
            }
        }
        for (const ip of ip6Negative) {
            const valid = await page.evaluate(val => isValidIp6(val), ip);
            if (valid) {
                ipErrors++;
                console.error(`FALLO: IPv6 negativo esperado inválido: ${ip}`);
                results.push({ domain: `ip6-invalid:${ip}`, expected: 'false', actual: 'true', diff: 1, status: 'FALLO' });
            }
        }

        const ip4Positive = ['192.168.1.1', '192.168.1.1/32', '0.0.0.0', '255.255.255.255/0'];
        const ip4Negative = ['192.168.001.1', '192.168.1.1/08', '192.168.1.1/33', '192.168.1.256', '192.168.1'];
        for (const ip of ip4Positive) {
            const valid = await page.evaluate(val => isValidIp4(val), ip);
            if (!valid) {
                ipErrors++;
                console.error(`FALLO: IPv4 positivo esperado válido: ${ip}`);
                results.push({ domain: `ip4-valid:${ip}`, expected: 'true', actual: 'false', diff: 1, status: 'FALLO' });
            }
        }
        for (const ip of ip4Negative) {
            const valid = await page.evaluate(val => isValidIp4(val), ip);
            if (valid) {
                ipErrors++;
                console.error(`FALLO: IPv4 negativo esperado inválido: ${ip}`);
                results.push({ domain: `ip4-invalid:${ip}`, expected: 'false', actual: 'true', diff: 1, status: 'FALLO' });
            }
        }
        await closeTrackedPage(page);
        if (ipErrors === 0) {
            console.log('OK: Validaciones unitarias de IPv6 e IPv4 (positivas y negativas) coinciden al 100%.');
            results.push({ domain: 'unit:isValidIp6-and-isValidIp4', expected: 'OK', actual: 'OK', diff: 0, status: 'OK' });
        }
    }

    // Pruebas unitarias y de interfaz: validateDomainInput (RFC 1035 / RFC 1123 / IDN)
    console.log('\n--- PRUEBAS UNITARIAS: validateDomainInput ---');
    {
        const page = await createCleanPage({ useMocks: false });
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });

        const domainNegative = [
            'a..b.com',
            'a.-b.com',
            '-a.com',
            'a-.com',
            'ejemplo com',
            'ejemplo .com',
            'a'.repeat(64) + '.com',
            'a.' + 'b'.repeat(250) + '.com',
            '.com',
            'com',
            'ejemplo.',
            'ejemplo.c'
        ];
        const domainPositive = [
            'google.com',
            'sub.ejemplo.com',
            'a.b.c.ejemplo.com',
            'mi-empresa.com',
            'sub-dominio.mi-empresa.co',
            'sitio.photography',
            'ejemplo.technology',
            'ejemplo.xn--p1ai',
            'https://www.ejemplo.com/',
            'http://ejemplo.com/path'
        ];

        let domainErrors = 0;
        for (const d of domainNegative) {
            const res = await page.evaluate(val => validateDomainInput(val), d);
            if (res && res.valid) {
                domainErrors++;
                console.error(`FALLO: validateDomainInput debió rechazar: "${d}"`);
                results.push({ domain: `domain-neg:${d}`, expected: 'false', actual: 'true', diff: 1, status: 'FALLO' });
            }
        }
        for (const d of domainPositive) {
            const res = await page.evaluate(val => validateDomainInput(val), d);
            if (!res || !res.valid) {
                domainErrors++;
                console.error(`FALLO: validateDomainInput debió aceptar: "${d}"`);
                results.push({ domain: `domain-pos:${d}`, expected: 'true', actual: 'false', diff: 1, status: 'FALLO' });
            }
        }
        if (domainErrors === 0) {
            console.log('OK: validateDomainInput rechaza y acepta todos los casos según RFC 1035/1123/IDN.');
            results.push({ domain: 'unit:validateDomainInput', expected: 'OK', actual: 'OK', diff: 0, status: 'OK' });
        }
        await closeTrackedPage(page);
    }

    console.log('\n--- PRUEBAS DE INTERFAZ: Validación de dominio (formulario manual y autorun) ---');
    {
        const page = await createCleanPage({ useMocks: false });
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });

        // Prueba manual con dominio inválido (mensaje claro en español, sin loading ni DNS)
        const badDomains = ['a..b.com', '-a.com', 'a-.com', 'a.-b.com', 'ejemplo com'];
        let uiDomainErrors = 0;
        for (const badDomain of badDomains) {
            await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
            await page.fill('#dominioInput', badDomain);
            await page.click('#diagBtn');
            await page.waitForTimeout(100);

            const errVisible = await page.$eval('#diagError', el => !el.classList.contains('hidden'));
            const errText = await page.$eval('#diagError', el => el.textContent.trim());
            const loadingHidden = await page.$eval('#diagLoading', el => el.classList.contains('hidden'));
            const resultsHidden = await page.$eval('#diagResults', el => el.classList.contains('hidden'));

            if (!errVisible || !errText.includes('Escribe un dominio válido, por ejemplo tuempresa.com') || !loadingHidden || !resultsHidden) {
                uiDomainErrors++;
                console.error(`FALLO: UI no mostró mensaje de error correcto para entrada manual "${badDomain}".`);
                results.push({ domain: `ui-invalid:${badDomain}`, expected: 'Error visible sin loading', actual: errText, diff: 1, status: 'FALLO' });
            }
        }

        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
        await page.fill('#dominioInput', '');
        await page.click('#diagBtn');
        await page.waitForTimeout(100);
        {
            const errVisible = await page.$eval('#diagError', el => !el.classList.contains('hidden'));
            const errText = await page.$eval('#diagError', el => el.textContent.trim());
            const loadingHidden = await page.$eval('#diagLoading', el => el.classList.contains('hidden'));
            if (!errVisible || !errText.includes('Escribe un dominio válido, por ejemplo tuempresa.com') || !loadingHidden) {
                uiDomainErrors++;
                console.error('FALLO: Campo vacío no mostró mensaje de error visible.');
                results.push({ domain: 'ui-invalid:empty', expected: 'Error visible sin loading', actual: errText, diff: 1, status: 'FALLO' });
            }
        }

        // Prueba autorun con dominio inválido (no debe ejecutar ni mostrar loading; mensaje visible)
        for (const q of ['?d=a..b.com', '?domain=ejemplo com', '?d=']) {
            await page.goto(`${baseUrl}/spf-checker.html${q}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(300);

            const loadingHidden = await page.$eval('#diagLoading', el => el.classList.contains('hidden'));
            const resultsHidden = await page.$eval('#diagResults', el => el.classList.contains('hidden'));
            const errVisible = await page.$eval('#diagError', el => !el.classList.contains('hidden'));
            const errText = await page.$eval('#diagError', el => el.textContent.trim());

            if (!loadingHidden || !resultsHidden || !errVisible || !errText.includes('Escribe un dominio válido, por ejemplo tuempresa.com')) {
                uiDomainErrors++;
                console.error(`FALLO: Autorun con dominio inválido "${q}" no mostró error visible o inició análisis.`);
                results.push({ domain: `autorun-invalid:${q}`, expected: 'Error visible sin loading', actual: errText, diff: 1, status: 'FALLO' });
            }
        }

        if (uiDomainErrors === 0) {
            console.log('OK: Validación de interfaz manual y autorun rechaza entradas inválidas mostrando mensaje de error sin loading ni consultas.');
            results.push({ domain: 'ui:domain-validation', expected: 'OK', actual: 'OK', diff: 0, status: 'OK' });
        }
        await closeTrackedPage(page);
    }

    // Pruebas unitarias de decodeDnsString y hasInvalidMacro
    console.log('\n--- PRUEBAS UNITARIAS: decodeDnsString y hasInvalidMacro (RFC 1035 / RFC 7208 §7) ---');
    {
        const page = await createCleanPage({ useMocks: false });
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });

        // decodeDnsString: decodificación exhaustiva según RFC 1035 §5.1 (20 casos)
        const decodeCases = [
            { input: '\\032', expected: ' ', desc: 'octeto decimal 032 decodificado como espacio' },
            { input: '\\\\032', expected: '\\032', desc: 'doble barra antes de 032' },
            { input: '\\"', expected: '"', desc: 'comilla escapada' },
            { input: '\\\\', expected: '\\', desc: 'barra invertida escapada' },
            { input: '\\\\\\"', expected: '\\"', desc: 'barra y comilla escapadas' },
            { input: '\\\\\\\\032', expected: '\\\\032', desc: 'cuatro barras antes de 032' },
            { input: '\\256', expected: '\\256', desc: 'octeto decimal 256 fuera de rango byte (preservado)' },
            { input: '\\999', expected: '\\999', desc: 'octeto decimal 999 fuera de rango byte (preservado)' },
            { input: 'abc\\', expected: 'abc\\', desc: 'secuencia incompleta barra al final' },
            { input: '\\', expected: '\\', desc: 'secuencia incompleta barra solitaria' },
            { input: '\\064', expected: '@', desc: 'octeto decimal 064 decodificado como @' },
            { input: '\\065', expected: 'A', desc: 'octeto decimal 065 decodificado como A' },
            { input: '\\097', expected: 'a', desc: 'octeto decimal 097 decodificado como a' },
            { input: '\\000', expected: '\x00', desc: 'octeto decimal 000 decodificado como byte nulo' },
            { input: '\\255', expected: '\xff', desc: 'octeto decimal 255 decodificado como byte 255' },
            { input: '\\12a', expected: '12a', desc: 'secuencia incompleta de 2 dígitos seguida de letra' },
            { input: '\\1', expected: '1', desc: 'secuencia incompleta de 1 dígito' },
            { input: '\\:', expected: ':', desc: 'dos puntos escapados' },
            { input: '\\ ', expected: ' ', desc: 'espacio escapado' },
            { input: 'simple text', expected: 'simple text', desc: 'texto simple sin escapes' }
        ];
        let decodeErrors = 0;
        for (const dc of decodeCases) {
            const actual = await page.evaluate(val => decodeDnsString(val), dc.input);
            if (actual !== dc.expected) {
                decodeErrors++;
                console.error(`FALLO: decodeDnsString("${dc.input}") => "${actual}" !== "${dc.expected}" (${dc.desc})`);
            }
        }
        if (decodeErrors === 0) {
            console.log('OK: decodeDnsString valida 20 casos exhaustivos (\\032, \\\\032, \\", \\\\, \\\\\\", \\\\\\\\032, \\256, secuencias incompletas).');
        }
        results.push({
            domain: 'unit:decodeDnsString',
            expected: 'OK',
            actual: decodeErrors === 0 ? 'OK' : 'FALLO',
            diff: decodeErrors,
            status: decodeErrors === 0 ? 'OK' : 'FALLO'
        });

        // hasInvalidMacro: validación exhaustiva según RFC 7208 §7.3
        const macroCases = [
            // Escapes válidos
            { str: '%%', isExp: false, expectedInvalid: false, desc: 'escape %%' },
            { str: '%_', isExp: false, expectedInvalid: false, desc: 'escape %_' },
            { str: '%-', isExp: false, expectedInvalid: false, desc: 'escape %-' },
            { str: 'include:sub%%.fake', isExp: false, expectedInvalid: false, desc: '%% en directiva' },
            { str: 'include:sub%_.fake', isExp: false, expectedInvalid: false, desc: '%_ en directiva' },
            { str: 'include:sub%-.fake', isExp: false, expectedInvalid: false, desc: '%- en directiva' },

            // Letras válidas en directivas normales (isExp = false)
            { str: 'include:%{s}.fake', isExp: false, expectedInvalid: false, desc: 'macro s en directiva' },
            { str: 'include:%{l}.fake', isExp: false, expectedInvalid: false, desc: 'macro l en directiva' },
            { str: 'include:%{o}.fake', isExp: false, expectedInvalid: false, desc: 'macro o en directiva' },
            { str: 'include:%{d}.fake', isExp: false, expectedInvalid: false, desc: 'macro d en directiva' },
            { str: 'include:%{i}.fake', isExp: false, expectedInvalid: false, desc: 'macro i en directiva' },
            { str: 'include:%{p}.fake', isExp: false, expectedInvalid: false, desc: 'macro p en directiva' },
            { str: 'include:%{h}.fake', isExp: false, expectedInvalid: false, desc: 'macro h en directiva' },
            { str: 'include:%{v}.fake', isExp: false, expectedInvalid: false, desc: 'macro v en directiva' },

            // Transformadores y delimitadores válidos
            { str: '%{d}', isExp: false, expectedInvalid: false, desc: 'macro %{d}' },
            { str: '%{d2}', isExp: false, expectedInvalid: false, desc: 'macro %{d2}' },
            { str: '%{d2r}', isExp: false, expectedInvalid: false, desc: 'macro %{d2r}' },
            { str: '%{l-}', isExp: false, expectedInvalid: false, desc: 'macro %{l-}' },
            { str: '%{ir}.%{v}._spf.%{d2}', isExp: false, expectedInvalid: false, desc: 'macro compleja %{ir}.%{v}._spf.%{d2}' },
            { str: '%{D}', isExp: false, expectedInvalid: false, desc: 'macro mayúscula %{D}' },
            { str: '%{d1r}', isExp: false, expectedInvalid: false, desc: 'macro %{d1r}' },
            { str: '%{d99}', isExp: false, expectedInvalid: false, desc: 'macro %{d99}' },
            { str: '%{s+.-}', isExp: false, expectedInvalid: false, desc: 'delimitadores múltiples %{s+.-}' },
            { str: '%{o1r}', isExp: false, expectedInvalid: false, desc: 'macro %{o1r}' },
            { str: '%{i//}', isExp: false, expectedInvalid: false, desc: 'delimitador barra %{i//}' },
            { str: 'prefix_%{d}_suffix', isExp: false, expectedInvalid: false, desc: 'macro embebida' },

            // c, r, t válidas en exp (isExp = true)
            { str: 'exp=%{c}.fake', isExp: true, expectedInvalid: false, desc: 'macro c en exp' },
            { str: 'exp=%{r}.fake', isExp: true, expectedInvalid: false, desc: 'macro r en exp' },
            { str: 'exp=%{t}.fake', isExp: true, expectedInvalid: false, desc: 'macro t en exp' },
            { str: '%{c}', isExp: true, expectedInvalid: false, desc: '%{c} en exp' },
            { str: '%{r}', isExp: true, expectedInvalid: false, desc: '%{r} en exp' },
            { str: '%{t}', isExp: true, expectedInvalid: false, desc: '%{t} en exp' },

            // Casos inválidos: c, r, t fuera de exp
            { str: 'include:%{c}.fake', isExp: false, expectedInvalid: true, desc: 'macro c fuera de exp' },
            { str: 'include:%{r}.fake', isExp: false, expectedInvalid: true, desc: 'macro r fuera de exp' },
            { str: 'include:%{t}.fake', isExp: false, expectedInvalid: true, desc: 'macro t fuera de exp' },
            { str: '%{c}', isExp: false, expectedInvalid: true, desc: '%{c} fuera de exp' },
            { str: '%{r}', isExp: false, expectedInvalid: true, desc: '%{r} fuera de exp' },
            { str: '%{t}', isExp: false, expectedInvalid: true, desc: '%{t} fuera de exp' },

            // Llaves sin abrir o cerrar
            { str: '%{d', isExp: false, expectedInvalid: true, desc: 'llave sin cerrar %{d' },
            { str: 'include:%{d.fake', isExp: false, expectedInvalid: true, desc: '%{d sin cerrar en directiva' },
            { str: '%d}', isExp: false, expectedInvalid: true, desc: 'llave sin abrir %d}' },
            { str: 'include:sub%}.fake', isExp: false, expectedInvalid: true, desc: 'llave de cierre huérfana %}' },

            // Caracteres % inválidos o sueltos
            { str: '%x', isExp: false, expectedInvalid: true, desc: '%x suelto' },
            { str: '%a', isExp: false, expectedInvalid: true, desc: '%a desconocido' },
            { str: '%', isExp: false, expectedInvalid: true, desc: '% solitario' },
            { str: 'include:sub.fake%', isExp: false, expectedInvalid: true, desc: '% al final' },
            { str: 'include:sub.fake%x', isExp: false, expectedInvalid: true, desc: '%x en include' },

            // Macros vacías o letras desconocidas
            { str: '%{}', isExp: false, expectedInvalid: true, desc: '%{} vacío' },
            { str: 'include:%{}.fake', isExp: false, expectedInvalid: true, desc: '%{} en directiva' },
            { str: '%{z}', isExp: false, expectedInvalid: true, desc: 'letra desconocida %{z}' },
            { str: '%{w}', isExp: false, expectedInvalid: true, desc: 'letra desconocida %{w}' },

            // Dígito 0 en transformador (RFC 7208 §7.3)
            { str: '%{d0}', isExp: false, expectedInvalid: true, desc: 'dígito de transformación 0 %{d0}' },
            { str: '%{d0r}', isExp: false, expectedInvalid: true, desc: 'dígito 0 con r %{d0r}' },
            { str: '%{d00}', isExp: false, expectedInvalid: true, desc: 'dígito de transformación 00 %{d00}' },
            { str: '%{d01}', isExp: false, expectedInvalid: false, desc: 'dígito válido %{d01} (valor 1)' },
            { str: 'include:%{s0}.fake', isExp: false, expectedInvalid: true, desc: 'macro s con dígito 0' },

            // Transformadores y delimitadores con sintaxis inválida
            { str: '%{d 2}', isExp: false, expectedInvalid: true, desc: 'espacio en transformador %{d 2}' },
            { str: '%{d?}', isExp: false, expectedInvalid: true, desc: 'delimitador no permitido ?' },
            { str: '%{d2rr}', isExp: false, expectedInvalid: true, desc: 'doble r en transformador' },
            { str: '%1', isExp: false, expectedInvalid: true, desc: '% seguido de dígito sin llaves' }
        ];

        let macroErrors = 0;
        for (const mc of macroCases) {
            const actualInvalid = await page.evaluate(({ s, exp }) => hasInvalidMacro(s, exp), { s: mc.str, exp: mc.isExp });
            if (actualInvalid !== mc.expectedInvalid) {
                macroErrors++;
                console.error(`FALLO: hasInvalidMacro("${mc.str}", ${mc.isExp}) [${mc.desc}] => ${actualInvalid} !== ${mc.expectedInvalid}`);
            }
        }
        if (macroErrors === 0) {
            console.log(`OK: hasInvalidMacro valida ${macroCases.length} casos exhaustivos (%%, %_, %-, %{d}, %{d2}, %{d2r}, %{l-}, %{ir}.%{v}._spf.%{d2}, %{D}, %{d0}, %{d01}, etc.).`);
        }
        results.push({
            domain: 'unit:hasInvalidMacro',
            expected: 'OK',
            actual: macroErrors === 0 ? 'OK' : 'FALLO',
            diff: macroErrors,
            status: macroErrors === 0 ? 'OK' : 'FALLO'
        });

        await closeTrackedPage(page);
    }

    // Test negativo real: en un contexto aparte, desactiva de verdad el abort, dispara una petición prohibida y comprueba que el monitor la detecta y la suite falla
    console.log('\n--- TEST NEGATIVO REAL DE SEGURIDAD (desactivando abort para probar detección) ---');
    {
        const negContext = await browser.newContext();
        const negTracker = new SecurityRequestTracker(negContext, { allowPassThrough: true });
        await negTracker.setupRoute(() => false);
        const negPage = await negContext.newPage();

        try {
            await negPage.evaluate((notifyUrl) => {
                return fetch(notifyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ probe: 'security_negative_test' })
                }).catch(() => {});
            }, `${baseUrl}/api/public/diagnosis-notify`);
        } catch (e) {}

        await negPage.waitForTimeout(150);

        let negSuiteFailed = false;
        let negErrorMsg = '';
        try {
            negTracker.assertAllBlocked({ minExpected: 1 });
        } catch (err) {
            negSuiteFailed = true;
            negErrorMsg = err.message;
        }

        await negContext.close();

        if (!negSuiteFailed) {
            console.error('FALLO: El monitor de seguridad NO detectó la petición no abortada en el test negativo.');
            results.push({ domain: 'security:real-negative-test', expected: 'Suite Falla', actual: 'Suite Pasó', diff: 1, status: 'FALLO' });
        } else {
            console.log(`OK: Test negativo real superado: cuando se desactiva el abort, el monitor detecta la petición no bloqueada por el cliente y falla la suite ("${negErrorMsg.split('\n')[0]}").`);
            results.push({ domain: 'security:real-negative-test', expected: 'Suite Falla', actual: 'Suite Falla', diff: 0, status: 'OK' });
        }
    }
    }

    // Ejecución de casos deterministas con DNS simulado
    console.log('\n--- PRUEBAS DETERMINISTAS CON DNS SIMULADO ---');
    for (const tc of deterministicCasesFiltered) {
        console.log(`\nProbando [Mock]: ${tc.domain} (${tc.category})...`);
        const pageOptions = { useMocks: true };
        if (tc.expectDnsErrorAlert) {
            pageOptions.suppressResolverUnavailableConsole = true;
        }
        const page = await createCleanPage(pageOptions);
        let dnsErrorAlertText = null;
        const mockDnsCounter = tc.assertZeroDohForDomain ? createMockDnsRequestCounter(tc.domain) : null;
        page.on('request', req => {
            if (mockDnsCounter) mockDnsCounter.onRequest(req.url());
        });
        page.on('dialog', dialog => {
            dnsErrorAlertText = dialog.message();
            dialog.accept();
        });
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
        await page.fill('#dominioInput', tc.domain);
        await page.click('#diagBtn');

        if (tc.expectDnsErrorAlert) {
            await page.waitForTimeout(800);
            const resultsHidden = await page.$eval('#diagResults', el => el.classList.contains('hidden'));
            const loadingHidden = await page.$eval('#diagLoading', el => el.classList.contains('hidden'));
            const alertOk = dnsErrorAlertText === DNS_ERROR_ALERT;
            const failed = !(resultsHidden && loadingHidden) || !alertOk;
            results.push({
                domain: tc.domain,
                expected: `Alerta DNS: ${DNS_ERROR_ALERT}`,
                actual: failed
                    ? (alertOk ? 'Resultados visibles tras fallo DNS' : `Alerta "${dnsErrorAlertText || '(ninguna)'}"`)
                    : 'Alerta DNS, sin resultados',
                diff: failed ? (alertOk ? 'Mostró diagResults en lugar de error' : 'Texto de alerta incorrecto') : 0,
                status: failed ? 'FALLO' : 'OK'
            });
            if (failed) {
                console.error(`  -> FALLO: ${tc.domain} debería mostrar error DNS, no resultados.`);
            } else {
                console.log(`  -> OK: ${tc.domain} muestra error DNS sin falso "Sin registro".`);
            }
            await closeTrackedPage(page);
            continue;
        }

        try {
            await page.waitForFunction(() => {
                const resultsEl = document.getElementById('diagResults');
                const loadingEl = document.getElementById('diagLoading');
                return resultsEl && !resultsEl.classList.contains('hidden') && loadingEl && loadingEl.classList.contains('hidden');
            }, { timeout: 15000 });

            const badgeText = await page.$eval('#spfCounterBadge', el => el.textContent.trim());
            const summaryText = await page.$eval('#spfCounterSummary', el => el.textContent.trim());
            const countText = await page.$eval('#spfMechanismsCount', el => el.textContent.trim());
            const warningEl = await page.$('#spfCounterWarning');
            const warningText = warningEl ? await warningEl.textContent() : '';

            let actualLookups = null;
            const match = summaryText.match(/(\d+)\s+de\s+10/);
            if (match) {
                actualLookups = parseInt(match[1], 10);
            } else if (countText.includes('0 consultas DNS')) {
                actualLookups = 0;
            }

            let failed = false;
            let failureReason = '';

            if (tc.expectedBadge && badgeText !== tc.expectedBadge) {
                failed = true;
                failureReason += `Badge esperado "${tc.expectedBadge}" != "${badgeText}". `;
            }

            if (tc.expectedTopScore) {
                const topScore = await page.$eval('#diagScore', el => el.textContent.trim());
                if (topScore !== tc.expectedTopScore) {
                    failed = true;
                    failureReason += `diagScore esperado "${tc.expectedTopScore}" != "${topScore}". `;
                }
            }

            if (tc.expectedLookups !== undefined && tc.expectedLookups !== null) {
                if (actualLookups !== tc.expectedLookups) {
                    failed = true;
                    failureReason += `Lookups esperados ${tc.expectedLookups} != ${actualLookups}. `;
                }
            }

            if (tc.expectedWarningText && !warningText.includes(tc.expectedWarningText)) {
                failed = true;
                failureReason += `Advertencia no contiene "${tc.expectedWarningText}". `;
            }

            if (tc.expectedSummaryText && !summaryText.includes(tc.expectedSummaryText)) {
                failed = true;
                failureReason += `Resumen no contiene "${tc.expectedSummaryText}". `;
            }

            if (tc.assertZeroDohForDomain && mockDnsCounter) {
                const c = mockDnsCounter.counts;
                if (c.cloudflare !== 0 || c.google !== 0 || c.alidns !== 0) {
                    failed = true;
                    failureReason += `DoH consultado con NXDOMAIN rápido del proxy (cloudflare=${c.cloudflare}, google=${c.google}, alidns=${c.alidns}). `;
                }
                if (c.proxy < 1) {
                    failed = true;
                    failureReason += `Se esperaba al menos 1 consulta al proxy, obtuvo ${c.proxy}. `;
                }
            }

            if (summaryText.includes('Tu SPF usa al menos') && !countText.includes('Al menos')) {
                failed = true;
                failureReason += `Contador ("${countText}") no coincide con redacción de resumen ("${summaryText}"). `;
            }

            if (tc.checkCutoff) {
                const cutoffPresent = await page.evaluate(() => {
                    const el = document.querySelector('#spfMechanismsList');
                    return el && el.textContent.includes('Punto de corte: la evaluación real se habría detenido aquí con permerror');
                });
                if (!cutoffPresent) {
                    failed = true;
                    failureReason += 'No se encontró el indicador del punto de corte de permerror. ';
                }
            }

            // Comprobación de coherencia entre los 3 elementos (badge superior diagScore, fila badge-spf, contador spfCounterBadge)
            const diagScore = await page.$eval('#diagScore', el => ({ text: el.textContent.trim(), class: el.className }));
            const badgeSpf = await page.$eval('#badge-spf', el => ({ text: el.textContent.trim(), class: el.className }));
            const counterBadge = await page.$eval('#spfCounterBadge', el => ({ text: el.textContent.trim(), class: el.className }));

            if (badgeText.includes('permerror') || badgeText.includes('Supera el límite')) {
                if (diagScore.text !== 'Permerror' || !diagScore.class.includes('text-red-400')) {
                    failed = true;
                    failureReason += `diagScore incoherente: esperaba Permerror rojo, obtuvo "${diagScore.text}" (${diagScore.class}). `;
                }
                if (badgeSpf.text !== 'Permerror' || !badgeSpf.class.includes('text-red-400')) {
                    failed = true;
                    failureReason += `badge-spf incoherente: esperaba Permerror rojo, obtuvo "${badgeSpf.text}" (${badgeSpf.class}). `;
                }
                if (!counterBadge.class.includes('text-red-400')) {
                    failed = true;
                    failureReason += `spfCounterBadge incoherente: esperaba rojo (${counterBadge.class}). `;
                }
            } else if (badgeText === 'Sin registro') {
                if (diagScore.text !== 'No detectado' || !diagScore.class.includes('text-slate-300')) {
                    failed = true;
                    failureReason += `diagScore incoherente: esperaba No detectado gris, obtuvo "${diagScore.text}" (${diagScore.class}). `;
                }
                if (badgeSpf.text !== 'No detectado' || !badgeSpf.class.includes('text-slate-300')) {
                    failed = true;
                    failureReason += `badge-spf incoherente: esperaba No detectado gris, obtuvo "${badgeSpf.text}" (${badgeSpf.class}). `;
                }
                if (counterBadge.text !== 'Sin registro' || !counterBadge.class.includes('text-slate-300')) {
                    failed = true;
                    failureReason += `spfCounterBadge incoherente: esperaba Sin registro gris, obtuvo "${counterBadge.text}". `;
                }
            } else if (badgeText === 'No pudimos terminar el conteo') {
                if (diagScore.text !== 'No pudimos terminar el conteo' || !diagScore.class.includes('text-amber-400')) {
                    failed = true;
                    failureReason += `diagScore incoherente en incompleto: esperaba "No pudimos terminar el conteo" ámbar, obtuvo "${diagScore.text}" (${diagScore.class}). `;
                }
                if (badgeSpf.text !== 'No pudimos terminar el conteo' || !badgeSpf.class.includes('text-amber-400')) {
                    failed = true;
                    failureReason += `badge-spf incoherente en incompleto: esperaba "No pudimos terminar el conteo" ámbar, obtuvo "${badgeSpf.text}" (${badgeSpf.class}). `;
                }
                if (!counterBadge.class.includes('text-amber-400')) {
                    failed = true;
                    failureReason += `spfCounterBadge incoherente en incompleto: esperaba ámbar (${counterBadge.class}). `;
                }
            } else if (badgeText === 'Requiere atención') {
                if (diagScore.text !== 'Requiere atención' || !diagScore.class.includes('text-amber-400')) {
                    failed = true;
                    failureReason += `diagScore incoherente: esperaba Requiere atención ámbar, obtuvo "${diagScore.text}" (${diagScore.class}). `;
                }
                if (badgeSpf.text !== 'Requiere atención' || !badgeSpf.class.includes('text-amber-400')) {
                    failed = true;
                    failureReason += `badge-spf incoherente: esperaba Requiere atención ámbar, obtuvo "${badgeSpf.text}" (${badgeSpf.class}). `;
                }
                if (counterBadge.text !== 'Requiere atención' || !counterBadge.class.includes('text-amber-400')) {
                    failed = true;
                    failureReason += `spfCounterBadge incoherente: esperaba Requiere atención ámbar, obtuvo "${counterBadge.text}". `;
                }
            }

            results.push({
                domain: tc.domain,
                expected: tc.expectedLookups !== null ? `${tc.expectedLookups} [${tc.expectedBadge}]` : `[${tc.expectedBadge}]`,
                actual: actualLookups !== null ? `${actualLookups} [${badgeText}]` : `[${badgeText}]`,
                diff: failed ? failureReason : 0,
                status: failed ? 'FALLO' : 'OK'
            });

            console.log(`  -> Conteo: ${actualLookups !== null ? actualLookups : 'N/A'} | Badge: "${badgeText}" | Estado: ${failed ? 'FALLO' : 'OK'}`);
            if (failed) console.error(`     Motivo: ${failureReason}`);

        } catch (err) {
            console.error(`  -> Error en ${tc.domain}:`, err.message);
            results.push({
                domain: tc.domain,
                expected: `${tc.expectedBadge}`,
                actual: 'Error / Timeout',
                diff: err.message,
                status: 'FALLO'
            });
        }

        await closeTrackedPage(page);
    }

    if (runAllSections) {
    console.log('\n--- PRIVACIDAD: CONSULTAS POR RESOLVER (DNS simulado) ---');
    {
        const page = await createCleanPage({ useMocks: true });
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
        await page.fill('#dominioInput', 'test-nested.fake');
        await page.click('#diagBtn');
        await page.waitForFunction(() => {
            const resultsEl = document.getElementById('diagResults');
            const loadingEl = document.getElementById('diagLoading');
            return resultsEl && !resultsEl.classList.contains('hidden') && loadingEl && loadingEl.classList.contains('hidden');
        }, { timeout: 15000 });
        const resolverStats = await page.evaluate(() => window.__spfDnsResolverStats || {});
        console.log(`Consultas por resolver tras test-nested.fake: proxy=${resolverStats.proxy || 0}, cloudflare=${resolverStats.cloudflare || 0}, google=${resolverStats.google || 0}, alidns=${resolverStats.alidns || 0}`);
        const privacyOk = (resolverStats.alidns || 0) === 0 &&
            (resolverStats.cloudflare || 0) === 0 &&
            (resolverStats.google || 0) === 0 &&
            (resolverStats.proxy || 0) >= 1;
        results.push({
            domain: 'privacy:resolver-stats',
            expected: 'Proxy-only (AliDNS/CF/Google=0) en búsqueda anidada rápida',
            actual: JSON.stringify(resolverStats),
            diff: privacyOk ? 0 : 'Se consultó DoH cuando el proxy respondió a tiempo',
            status: privacyOk ? 'OK' : 'FALLO'
        });
        if (!privacyOk) {
            console.error('FALLO: AliDNS recibió consultas en una búsqueda donde Cloudflare/Google deberían bastar.');
        }
        await closeTrackedPage(page);
    }
    }

    // Ejecución de pruebas de humo reales (con DNS real sin mocks)
    console.log('\n--- PRUEBAS DE HUMO CON DOMINIOS REALES (SIN CONTEO EXACTO) ---');
    for (const tc of smokeCasesFiltered) {
        console.log(`\nProbando [Humo]: ${tc.domain} (${tc.category})...`);
        const page = await createCleanPage({ useMocks: false });
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
        await page.fill('#dominioInput', tc.domain);
        await page.click('#diagBtn');

        if (tc.isInvalidInput) {
            await page.waitForTimeout(600);
            const resultsHidden = await page.$eval('#diagResults', el => el.classList.contains('hidden'));
            const loadingHidden = await page.$eval('#diagLoading', el => el.classList.contains('hidden'));
            const errVisible = await page.$eval('#diagError', el => !el.classList.contains('hidden'));
            const errText = await page.$eval('#diagError', el => el.textContent.trim());
            const ok = resultsHidden === true && loadingHidden === true && errVisible && errText.includes('Escribe un dominio válido, por ejemplo tuempresa.com');
            results.push({
                domain: tc.domain,
                expected: 'Detenido por validación (mensaje visible)',
                actual: ok ? 'Detenido por validación (mensaje visible)' : `errVisible=${errVisible} loadingHidden=${loadingHidden}`,
                diff: ok ? 0 : 'diagResults/loading/error incoherente tras entrada inválida',
                status: ok ? 'OK' : 'FALLO'
            });
            if (!ok) {
                console.error('  -> FALLO: Se mostraron resultados o se ejecutó envío con entrada sintácticamente inválida.');
            } else {
                console.log('  -> Validación nativa correcta: no se ejecutó envío ni análisis.');
            }
            await closeTrackedPage(page);
            continue;
        }

        try {
            await page.waitForFunction(() => {
                const resultsEl = document.getElementById('diagResults');
                const loadingEl = document.getElementById('diagLoading');
                return resultsEl && !resultsEl.classList.contains('hidden') && loadingEl && loadingEl.classList.contains('hidden');
            }, { timeout: 25000 });

            const badgeText = await page.$eval('#spfCounterBadge', el => el.textContent.trim());
            const summaryText = await page.$eval('#spfCounterSummary', el => el.textContent.trim());
            const countText = await page.$eval('#spfMechanismsCount', el => el.textContent.trim());
            const diagScore = await page.$eval('#diagScore', el => ({ text: el.textContent.trim(), class: el.className }));
            const badgeSpf = await page.$eval('#badge-spf', el => ({ text: el.textContent.trim(), class: el.className }));

            let actualLookups = null;
            const matchLookups = summaryText.match(/(\d+)\s+de\s+10/);
            if (matchLookups) {
                actualLookups = parseInt(matchLookups[1], 10);
            } else if (countText.includes('0 consultas DNS')) {
                actualLookups = 0;
            }

            let failed = false;
            let failureReason = '';
            if (tc.expectedBadge && badgeText !== tc.expectedBadge) {
                failed = true;
                failureReason += `Badge esperado "${tc.expectedBadge}" != "${badgeText}". `;
            }

            if (tc.allowedBadges && !tc.allowedBadges.includes(badgeText)) {
                failed = true;
                failureReason += `Badge "${badgeText}" no está en permitidos [${tc.allowedBadges.join(', ')}]. `;
            }

            if (tc.expectedLookups !== undefined && tc.expectedLookups !== null) {
                if (actualLookups !== tc.expectedLookups) {
                    failed = true;
                    failureReason += `Lookups esperados ${tc.expectedLookups} != ${actualLookups}. `;
                }
            }

            if (tc.domain === 'test.com') {
                if (diagScore.text !== 'No detectado' || !diagScore.class.includes('text-slate-300')) {
                    failed = true;
                    failureReason += `test.com diagScore incoherente: esperaba No detectado gris, obtuvo "${diagScore.text}" (${diagScore.class}). `;
                }
                if (badgeSpf.text !== 'No detectado' || !badgeSpf.class.includes('text-slate-300')) {
                    failed = true;
                    failureReason += `test.com badge-spf incoherente: esperaba No detectado gris, obtuvo "${badgeSpf.text}" (${badgeSpf.class}). `;
                }
                if (badgeText !== 'Sin registro') {
                    failed = true;
                    failureReason += `test.com spfCounterBadge incoherente: esperaba Sin registro gris, obtuvo "${badgeText}". `;
                }
            }

            if (tc.requireConcrete) {
                if (badgeText === 'Sin registro') {
                    failed = true;
                    failureReason += 'No debe dar «Sin registro» para un dominio real configurado. ';
                }
                if (badgeText.toLowerCase().includes('permerror') || badgeText.toLowerCase().includes('sintaxis')) {
                    failed = true;
                    failureReason += `Falso permerror detectado en dominio real: "${badgeText}". `;
                }
                if (badgeText === 'No pudimos terminar el conteo') {
                    failed = true;
                    failureReason += 'Fallo de red o timeout al consultar el resolver DoH en el entorno. ';
                }
            }

            if (!summaryText || summaryText.length === 0) {
                failed = true;
                failureReason += 'Resumen vacío. ';
            }

            results.push({
                domain: tc.domain,
                expected: tc.expectedBadge || (tc.allowedBadges ? tc.allowedBadges.join(' / ') : 'Resultado DoH concreto'),
                actual: `${badgeText}: "${summaryText.substring(0, 45)}..." (${countText})`,
                diff: failed ? failureReason : 0,
                status: failed ? 'FALLO' : 'OK'
            });

            console.log(`  -> Smoke OK: Badge="${badgeText}" | Lookups=${actualLookups !== null ? actualLookups : 'N/A'} | Resumen="${summaryText}" | Conteo="${countText}"`);

            const resolverStats = await page.evaluate(() => window.__spfDnsResolverStats || {});
            if (tc.requireConcrete) {
                console.log(`     Resolvers: proxy=${resolverStats.proxy || 0}, cf=${resolverStats.cloudflare || 0}, google=${resolverStats.google || 0}, alidns=${resolverStats.alidns || 0}`);
            }

            const target19 = [
                'microsoft.com', 'amazon.com', 'hubspot.com', 'zoho.com', 'google.com',
                'shopify.com', 'mailchimp.com', 'github.com', 'salesforce.com', 'paypal.com',
                'outlook.com', 'yahoo.com', 'sendgrid.net', 'zendesk.com', 'atlassian.com',
                'stripe.com', 'slack.com', 'intercom.com', 'test.com'
            ];
            if (target19.includes(tc.domain)) {
                realDnsSummary.push({
                    domain: tc.domain,
                    topBadge: diagScore.text,
                    rowBadge: badgeSpf.text,
                    counterBadge: `${badgeText} (${countText})`,
                    lookups: actualLookups
                });
            }

            // Capturas de pantalla opcionales solo si ARTIFACT_DIR está configurado y existe
            if (ARTIFACT_DIR && fs.existsSync(ARTIFACT_DIR)) {
                const box = await page.$('#spfCounterBox');
                if (box) {
                    await page.evaluate(() => {
                        const nav = document.querySelector('nav');
                        if (nav) nav.style.display = 'none';
                    });
                    if (tc.domain === 'google.com') {
                        await box.screenshot({ path: path.join(ARTIFACT_DIR, 'counter_verde.png') });
                    }
                }
            }
        } catch (err) {
            console.error(`  -> Error de humo en ${tc.domain}:`, err.message);
            results.push({
                domain: tc.domain,
                expected: tc.expectedBadge || 'Resultado DoH concreto',
                actual: 'Error / Timeout de red',
                diff: `Fallo de red en resolver DoH: ${err.message}`,
                status: 'FALLO'
            });
        }

        await closeTrackedPage(page);
    }

    // Comprobación de seguridad antes de cerrar el navegador (evita peticiones prohibidas colgadas)
    let securityError = null;
    let counts = { totalForbidden: 0, totalBlocked: 0 };
    try {
        await tracker.awaitForbiddenSettled(30000);
        counts = tracker.assertAllBlocked({ minExpected: 1 });
        console.log(`\nOK: Seguridad confirmada. Total de peticiones prohibidas interceptadas: ${counts.totalForbidden}. Total abortadas localmente con ERR_BLOCKED_BY_CLIENT: ${counts.totalBlocked}. Cero peticiones salieron a la red.`);
    } catch (err) {
        securityError = err.message;
        console.error('\n' + err.message);
    }

    await browser.close();
    server.close();

    // Imprimir tabla de resultados
    console.log('\n========================= TABLA DE RESULTADOS =========================');
    console.log('| Dominio | Esperado | Verificador | Diferencia | Estado |');
    console.log('|---|---|---|---|---|');
    for (const r of results) {
        console.log(`| ${r.domain} | ${r.expected} | ${r.actual} | ${r.diff} | ${r.status} |`);
    }

    console.log('\n================ TABLA DE VERIFICACIÓN DNS REAL (19 DOMINIOS) ================');
    console.log('| Dominio | Lookups | Badge Superior (diagScore) | Fila SPF (badge-spf) | Contador (spfCounterBadge) |');
    console.log('|---|---|---|---|---|');
    for (const row of realDnsSummary) {
        console.log(`| ${row.domain} | ${row.lookups !== undefined && row.lookups !== null ? row.lookups : 'N/A'} | ${row.topBadge} | ${row.rowBadge} | ${row.counterBadge} |`);
    }

    if (consoleErrors.length > 0) {
        console.error('\nErrores de consola detectados:', consoleErrors);
    } else {
        console.log('\nOK: Cero errores de consola durante las pruebas.');
    }

    const hasFailures = results.some(r => r.status === 'FALLO') || securityError !== null;
    if (hasFailures) {
        console.error('\nHay pruebas que fallaron.');
        process.exit(1);
    } else {
        console.log('\nTODAS LAS PRUEBAS COINCIDEN CON EL COMPORTAMIENTO ESPERADO (RFC 7208).');
        process.exit(0);
    }
}

runSuite().catch(err => {
    console.error('Error fatal en suite:', err);
    process.exit(1);
});
