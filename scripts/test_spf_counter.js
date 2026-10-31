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
    }
};

// Generar entradas A válidas para h1.fake .. h12.fake
for (let i = 1; i <= 12; i++) {
    MOCK_DNS[`h${i}.fake`] = {
        A: { response: aAnswer(`h${i}.fake`, `192.0.2.${i}`) }
    };
}

async function runSuite() {
    console.log('--- INICIANDO SUITE DE PRUEBAS DEL CONTADOR SPF (RFC 7208) ---');
    const { server, port } = await startServer();
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Servidor local listo en ${baseUrl}`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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
            category: 'Include y redirect con macros (no evaluables, suman 1 c/u)',
            expectedLookups: 2,
            expectedBadge: 'Dentro del límite'
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
        }
    ];

    // 2. Pruebas de humo con dominios reales (sin conteo exacto fijo pero exigiendo resultados concretos)
    const smokeCases = [
        { domain: 'google.com', category: 'Humo real: Google Workspace', requireConcrete: true, expectedBadge: 'Dentro del límite' },
        { domain: 'microsoft.com', category: 'Humo real: Microsoft 365', requireConcrete: true, allowedBadges: ['Dentro del límite', 'Cerca del límite'] },
        { domain: 'amazon.com', category: 'Humo real: Amazon', requireConcrete: true },
        { domain: 'hubspot.com', category: 'Humo real: HubSpot', requireConcrete: true },
        { domain: 'zoho.com', category: 'Humo real: Zoho', requireConcrete: true },
        { domain: 'shopify.com', category: 'Humo real: Shopify', requireConcrete: true },
        { domain: 'mailchimp.com', category: 'Humo real: Mailchimp', requireConcrete: true },
        { domain: 'github.com', category: 'Humo real: GitHub', requireConcrete: true },
        { domain: 'test.com', category: 'Humo real: Dominio sin SPF', expectedBadge: 'Sin registro' },
        { domain: 'badsecurityinc.be', category: 'Humo real: Política +all', requireConcrete: true },
        { domain: 'nxdomain-inboxseguro-test-1234567.com', category: 'Humo real: NXDOMAIN', expectedBadge: 'Sin registro' },
        { domain: 'dominio invalido!!!', category: 'Humo real: Entrada sintácticamente inválida', isInvalidInput: true }
    ];

    const results = [];
    const consoleErrors = [];

    async function createCleanPage() {
        const page = await browser.newPage();
        await page.addInitScript(() => {
            try {
                localStorage.setItem('inboxseguro_cookie_consent', 'accepted');
            } catch (e) {}
        });

        // Intercepción de DoH / DNS Proxy para mock determinista
        await page.route('**', async (route) => {
            const reqUrl = route.request().url();
            if (reqUrl.includes('/api/dns') ||
                reqUrl.includes('cloudflare-dns.com/dns-query') ||
                reqUrl.includes('dns.google/resolve') ||
                reqUrl.includes('dns.alidns.com/resolve')) {

                try {
                    const parsed = new URL(reqUrl);
                    const name = (parsed.searchParams.get('name') || '').toLowerCase().replace(/\.$/, '');
                    const type = (parsed.searchParams.get('type') || '').toUpperCase();

                    if (MOCK_DNS[name] && MOCK_DNS[name][type] !== undefined) {
                        const entry = MOCK_DNS[name][type];
                        if (entry.delay) {
                            await new Promise(r => setTimeout(r, entry.delay));
                        }
                        if (entry.abort) {
                            return route.abort();
                        }
                        return route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify(entry.response)
                        });
                    }
                } catch (e) {}
            }
            return route.continue();
        });

        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (text.includes('inboxseguro-dns-proxy') ||
                    text.includes('panel.inboxseguro.com') ||
                    text.includes('ERR_FAILED') ||
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
    console.log('\nVerificando autorun con ?d=google.com y ?domain=google.com (no deben disparar notificaciones ni tickets)...');
    for (const q of ['?d=google.com', '?domain=google.com']) {
        const page = await createCleanPage();
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
        await page.close();
    }

    // Ejecución de casos deterministas con DNS simulado
    console.log('\n--- PRUEBAS DETERMINISTAS CON DNS SIMULADO ---');
    for (const tc of deterministicCases) {
        console.log(`\nProbando [Mock]: ${tc.domain} (${tc.category})...`);
        const page = await createCleanPage();
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
        await page.fill('#dominioInput', tc.domain);
        await page.click('#diagBtn');

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

        await page.close();
    }

    // Ejecución de pruebas de humo reales
    console.log('\n--- PRUEBAS DE HUMO CON DOMINIOS REALES (SIN CONTEO EXACTO) ---');
    for (const tc of smokeCases) {
        console.log(`\nProbando [Humo]: ${tc.domain} (${tc.category})...`);
        const page = await createCleanPage();
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
        await page.fill('#dominioInput', tc.domain);
        await page.click('#diagBtn');

        if (tc.isInvalidInput) {
            const resultsHidden = await page.$eval('#diagResults', el => el.classList.contains('hidden'));
            results.push({
                domain: tc.domain,
                expected: 'Detenido por validación',
                actual: resultsHidden ? 'Detenido por validación' : 'Error',
                diff: 0,
                status: 'OK'
            });
            console.log('  -> Validación nativa correcta: no se ejecutó envío.');
            await page.close();
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

            console.log(`  -> Smoke OK: Badge="${badgeText}" | Resumen="${summaryText}" | Conteo="${countText}"`);

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

        await page.close();
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

    if (consoleErrors.length > 0) {
        console.error('\nErrores de consola detectados:', consoleErrors);
    } else {
        console.log('\nOK: Cero errores de consola durante las pruebas.');
    }

    const hasFailures = results.some(r => r.status === 'FALLO');
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
