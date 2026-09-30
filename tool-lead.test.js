const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('./tool-lead.js', 'utf8');
const sandbox = { window: {}, globalThis: {}, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox);

const api = sandbox.InboxSeguroToolLead;
assert.ok(api);
assert.strictEqual(api.isValidEmail('ops@empresa.com'), true);
assert.strictEqual(api.isValidEmail('bad'), false);
assert.strictEqual(api.TOOL_NAME, 'sending_systems');
assert.strictEqual(api.CONSENT_SUMMARY_VERSION, 'summary_email_v1');

// Analytics sanitizer / high risk no domain
const analyticsCode = fs.readFileSync('./seo-analytics.js', 'utf8');
const events = [];
const aSandbox = {
    window: {
        location: { pathname: '/quien-puede-enviar-correos' },
        dataLayer: [],
        gtag: function (type, name, params) {
            if (type === 'event') events.push({ name, params });
        }
    },
    document: {
        addEventListener: function () {}
    }
};
aSandbox.window.gtag = aSandbox.window.gtag;
aSandbox.window.document = aSandbox.document;
aSandbox.window.location = aSandbox.window.location;
aSandbox.window.dataLayer = aSandbox.window.dataLayer;
vm.runInNewContext(analyticsCode.replace('(function () {', 'var window = this.window; var document = this.document; (function () {'), {
    window: aSandbox.window,
    document: aSandbox.document
});

aSandbox.window.trackCheckerHighRisk('secret-domain.com');
aSandbox.window.trackLeadFormEvent('lead_form_view', {
    tool_name: 'sending_systems',
    email: 'leak@x.com',
    domain: 'secret-domain.com',
    status: 'visible'
});

assert.ok(events.length >= 2);
const highRisk = events.find((e) => e.name === 'checker_high_risk');
assert.ok(highRisk);
assert.strictEqual(highRisk.params.domain, undefined);
assert.strictEqual(highRisk.params.status, 'high_risk');

const leadView = events.find((e) => e.name === 'lead_form_view');
assert.ok(leadView);
assert.strictEqual(leadView.params.email, undefined);
assert.strictEqual(leadView.params.domain, undefined);
assert.strictEqual(leadView.params.tool_name, 'sending_systems');
assert.strictEqual(leadView.params.page_path, '/quien-puede-enviar-correos');

// Form appears only after successful result markup exists in page
const html = fs.readFileSync('./quien-puede-enviar-correos.html', 'utf8');
assert.ok(html.includes('id="leadSummaryBlock"'));
assert.ok(html.includes('class="hidden mt-7 pt-6 border-t border-white/10"'));
assert.ok(html.indexOf('id="systemsResults"') < html.indexOf('id="leadSummaryBlock"'));
assert.ok(html.indexOf('id="leadSummaryBlock"') < html.indexOf('¿Quieres saber cuáles están enviando realmente?'));
assert.ok(html.includes('¿Quieres saber qué significa esto para tu empresa?'));
assert.ok(html.includes('Enviarme el resumen'));
assert.ok(html.includes('Sin instalar nada. Puedes darte de baja cuando quieras.'));
assert.ok(html.includes('href="/privacidad"'));
assert.ok(html.includes('leadApi.showForDomain'));
assert.ok(html.includes('leadApi.hide()'));

console.log('OK: tool-lead + analytics privacy tests passed');
