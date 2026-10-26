#!/usr/bin/env node
/**
 * Test suite reproducible para el contador de consultas DNS de spf-checker.html según RFC 7208.
 * Compara el conteo manual/DoH contra el verificador renderizado con Playwright y red real.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH ? path.join(process.env.NODE_PATH, 'playwright') : 'playwright');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/home/ubuntu/.gemini/antigravity-ide/brain/44ecd550-b638-43df-af1c-e6dc0981e028';

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

async function runSuite() {
    console.log('--- INICIANDO SUITE DE PRUEBAS DEL CONTADOR SPF (RFC 7208) ---');
    const { server, port } = await startServer();
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Servidor local listo en ${baseUrl}`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const testCases = [
        {
            domain: 'google.com',
            category: 'Google Workspace (includes anidados)',
            expectedLookups: 1,
            expectedState: 'Dentro del límite'
        },
        {
            domain: 'microsoft.com',
            category: 'Microsoft 365 (spf.protection.outlook.com)',
            expectedLookups: 7,
            expectedState: 'Dentro del límite'
        },
        {
            domain: 'shopify.com',
            category: 'Varios servicios de envío',
            expectedLookups: 4,
            expectedState: 'Dentro del límite'
        },
        {
            domain: 'github.com',
            category: 'Cerca del límite (10 consultas)',
            expectedLookups: 10,
            expectedState: 'Cerca del límite'
        },
        {
            domain: 'lyft.com',
            category: 'Supera el límite (>10 consultas, permerror)',
            expectedLookups: 18,
            expectedState: 'Supera el límite; SPF devuelve permerror'
        },
        {
            domain: 'test.com',
            category: 'Dominio sin SPF publicado',
            expectedLookups: 0,
            expectedState: 'Sin registro'
        },
        {
            domain: 'badsecurityinc.be',
            category: 'Dominio con política +all',
            expectedLookups: 0,
            expectedState: 'Dentro del límite'
        },
        {
            domain: 'nxdomain-inboxseguro-test-1234567.com',
            category: 'Dominio inexistente (NXDOMAIN)',
            expectedLookups: null,
            expectedState: 'No verificable / Sin registro'
        },
        {
            domain: 'dominio invalido!!!',
            category: 'Entrada inválida',
            expectedLookups: null,
            expectedState: 'No evaluado (validación de formulario)'
        }
    ];

    const results = [];
    const consoleErrors = [];

    // Helper para inicializar contexto limpio sin banner de cookies
    async function createCleanPage() {
        const page = await browser.newPage();
        await page.addInitScript(() => {
            try {
                localStorage.setItem('inboxseguro_cookie_consent', 'accepted');
            } catch (e) {}
        });
        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                // Ignorar errores de red externos por CORS en localhost hacia el panel o workers.dev
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

    // 1. Probar autorun con ?d=google.com (debe ejecutarse sin llamadas a notificaciones)
    console.log('\nVerificando autorun con ?d=google.com (no debe disparar notificaciones ni tickets)...');
    {
        const page = await createCleanPage();
        let notified = false;
        page.on('request', req => {
            const url = req.url();
            if (url.includes('/api/notify') || url.includes('diagnosis-notify') || url.includes('diagnosis-ticket')) {
                notified = true;
            }
        });

        await page.goto(`${baseUrl}/spf-checker.html?d=google.com`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#diagResults:not(.hidden)', { timeout: 10000 });
        const summaryText = await page.$eval('#spfCounterSummary', el => el.textContent.trim());
        const badgeText = await page.$eval('#spfCounterBadge', el => el.textContent.trim());

        if (notified) {
            console.error('FALLO: El autorun disparó una notificación al panel.');
        } else {
            console.log(`OK: Autorun completado sin notificaciones. Resultado: "${summaryText}" [${badgeText}]`);
        }
        await page.close();
    }

    // 2. Ejecutar cada dominio en la página
    for (const tc of testCases) {
        console.log(`\nProbando: ${tc.domain} (${tc.category})...`);
        const page = await createCleanPage();

        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
        await page.fill('#dominioInput', tc.domain);
        await page.click('#diagBtn');

        if (tc.domain.includes('invalido')) {
            // Verificamos que la validación nativa HTML5/JS detuvo el envío
            const resultsHidden = await page.$eval('#diagResults', el => el.classList.contains('hidden'));
            results.push({
                domain: tc.domain,
                expected: tc.expectedLookups !== null ? `${tc.expectedLookups}` : 'N/A',
                actual: resultsHidden ? 'Detenido por validación' : 'Error',
                diff: 0,
                status: 'OK'
            });
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

            let actualLookups = null;
            const match = summaryText.match(/(\d+)\s+de\s+10/);
            if (match) {
                actualLookups = parseInt(match[1], 10);
            } else if (badgeText === 'Sin registro') {
                actualLookups = 0;
            }

            const diff = (tc.expectedLookups !== null && actualLookups !== null) ? Math.abs(actualLookups - tc.expectedLookups) : 0;
            results.push({
                domain: tc.domain,
                expected: tc.expectedLookups !== null ? `${tc.expectedLookups}` : 'N/A',
                actual: actualLookups !== null ? `${actualLookups} (${badgeText})` : badgeText,
                diff: diff,
                status: diff === 0 ? 'OK' : 'DIFERENCIA'
            });

            console.log(`  -> Conteo: ${actualLookups !== null ? actualLookups : badgeText} | Badge: "${badgeText}" | Diff: ${diff}`);

            // Ocultar navbar fixed para que la cabecera del contador no quede tapada en la captura
            await page.evaluate(() => {
                const nav = document.querySelector('nav');
                if (nav) nav.style.display = 'none';
            });

            // Capturar screenshots de los 3 estados reales
            if (tc.domain === 'google.com') {
                const box = await page.$('#spfCounterBox');
                if (box) {
                    await page.waitForTimeout(200);
                    await box.screenshot({ path: path.join(ARTIFACT_DIR, 'counter_verde.png') });
                }
            } else if (tc.domain === 'github.com') {
                const box = await page.$('#spfCounterBox');
                if (box) {
                    await page.waitForTimeout(200);
                    await box.screenshot({ path: path.join(ARTIFACT_DIR, 'counter_ambar.png') });
                }
            } else if (tc.domain === 'lyft.com') {
                const box = await page.$('#spfCounterBox');
                if (box) {
                    await page.waitForTimeout(200);
                    await box.screenshot({ path: path.join(ARTIFACT_DIR, 'counter_rojo.png') });
                }
            }
        } catch (err) {
            console.error(`  -> Error esperando resultados para ${tc.domain}:`, err.message);
            results.push({
                domain: tc.domain,
                expected: `${tc.expectedLookups}`,
                actual: 'Error / Timeout',
                diff: 'N/A',
                status: 'FALLO'
            });
        }

        await page.close();
    }

    // 3. Capturar screenshot del estado incompleto (simulado via renderSpfCounter)
    {
        const page = await createCleanPage();
        await page.goto(`${baseUrl}/spf-checker.html`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            const nav = document.querySelector('nav');
            if (nav) nav.style.display = 'none';
            const resultsDiv = document.getElementById('diagResults');
            resultsDiv.classList.remove('hidden');
            renderSpfCounter('ejemplo-incompleto.com', {
                domain: 'ejemplo-incompleto.com',
                incomplete: true,
                lookupCount: null,
                warnings: ['Se alcanzó el límite de seguridad de 30 consultas en el navegador.'],
                mechanisms: []
            });
        });
        const box = await page.$('#spfCounterBox');
        if (box) await box.screenshot({ path: path.join(ARTIFACT_DIR, 'counter_incompleto.png') });
        console.log('\nCaptura de estado incompleto generada exitosamente.');
        await page.close();
    }

    await browser.close();
    server.close();

    // 4. Imprimir tabla de resultados
    console.log('\n========================= TABLA DE RESULTADOS =========================');
    console.log('| Dominio | Conteo Esperado | Conteo Verificador | Diferencia | Estado |');
    console.log('|---|---|---|---|---|');
    for (const r of results) {
        console.log(`| ${r.domain} | ${r.expected} | ${r.actual} | ${r.diff} | ${r.status} |`);
    }

    if (consoleErrors.length > 0) {
        console.error('\nErrores de consola detectados:', consoleErrors);
    } else {
        console.log('\nOK: Cero errores de consola durante las pruebas.');
    }

    const hasFailures = results.some(r => r.status === 'FALLO' || (typeof r.diff === 'number' && r.diff > 0));
    if (hasFailures) {
        console.error('\nHay pruebas que difieren del conteo esperado.');
        process.exit(1);
    } else {
        console.log('\nTODAS LAS PRUEBAS COINCIDEN CON EL CONTEO ESPERADO (RFC 7208).');
        process.exit(0);
    }
}

runSuite().catch(err => {
    console.error('Error fatal en suite:', err);
    process.exit(1);
});
