const assert = require('assert');
const api = require('./email-security-check.js');

const realMx = {
    Status: 0,
    Answer: [
        { type: 15, data: '50 mx3.zoho.com.' },
        { type: 15, data: '10 mx.zoho.com.' },
        { type: 15, data: '20 mx2.zoho.com.' },
        { type: 5, data: 'ignored.example.' }
    ]
};

const records = api.extractMX(realMx);
assert.deepStrictEqual(records.map(function (row) { return row.host; }), ['mx.zoho.com', 'mx2.zoho.com', 'mx3.zoho.com']);
assert.strictEqual(api.identifyMxProvider('mx.zoho.com'), 'Zoho Mail');
assert.strictEqual(api.identifyMxProvider('empresa-com.mail.protection.outlook.com'), 'Microsoft 365');
assert.strictEqual(api.identifyMxProvider('aspmx.l.google.com'), 'Google Workspace');
assert.strictEqual(api.identifyMxProvider('mail.empresa.com'), '');

const mx = api.analyzeMxRecords(records, true);
assert.strictEqual(mx.status, 'ok');
assert.strictEqual(mx.label, 'Correcto');
assert.match(mx.text, /recibe el correo/);
assert.match(mx.text, /No confirma autorización ni actividad de envío/);
assert.doesNotMatch(mx.text, /autorizado para enviar/);

assert.strictEqual(api.analyzeMxRecords([], true).status, 'missing');
assert.strictEqual(api.analyzeMxRecords([], false).status, 'unknown');
assert.strictEqual(api.dnsQuerySucceeded({ Status: 2 }), false);
assert.strictEqual(api.dnsQuerySucceeded({ Status: 3 }), true);

assert.strictEqual(api.analyzeSpfFromTxt([], true).status, 'missing');
assert.strictEqual(api.analyzeSpfFromTxt(['v=spf1 include:_spf.google.com ~all'], true).status, 'ok');
assert.strictEqual(api.analyzeSpfFromTxt(['v=spf1 +all'], true).status, 'attention');
assert.strictEqual(api.analyzeSpfFromTxt(['v=spf1 include:a.com', 'v=spf1 include:b.com -all'], true).status, 'attention');
assert.strictEqual(api.analyzeSpfFromTxt([], false).status, 'unknown');

assert.strictEqual(api.dmarcPolicy('v=DMARC1; p=none; sp=reject'), 'none');
assert.strictEqual(api.dmarcPolicy('v=DMARC1; sp=reject; p=quarantine'), 'quarantine');
assert.strictEqual(api.analyzeDmarcFromTxt(['v=DMARC1; p=none; sp=reject'], true).status, 'attention');
assert.strictEqual(api.analyzeDmarcFromTxt(['v=DMARC1; p=quarantine'], true).status, 'ok');
assert.strictEqual(api.analyzeDmarcFromTxt(['v=DMARC1; p=reject'], true).status, 'ok');
assert.strictEqual(api.analyzeDmarcFromTxt([], true).status, 'missing');

assert.strictEqual(api.analyzeDkimLookup({ found: true, selector: 'google' }, true).status, 'ok');
assert.strictEqual(api.analyzeDkimLookup({ found: false, selector: null }, true).status, 'unknown');
assert.match(api.analyzeDkimLookup({ found: false, selector: null }, true).text, /no demuestra que falte DKIM/);

console.log('email-security-check tests ok');

const dkim = require('./dkim-lookup.js');
assert.deepStrictEqual(dkim.normalizeDkimSelector(''), { ok: true, selector: '' });
assert.deepStrictEqual(dkim.normalizeDkimSelector(' Google '), { ok: true, selector: 'google' });
assert.strictEqual(dkim.normalizeDkimSelector('selector.extra').ok, false);
assert.strictEqual(dkim.normalizeDkimSelector('../x').ok, false);

const present = dkim.interpretSelectorQuery(['v=DKIM1; k=rsa; p=ABC'], 'google', true);
assert.strictEqual(present.status, 'ok');
assert.match(present.text, /no demuestra/);

const revoked = dkim.interpretSelectorQuery(['v=DKIM1; p=;'], 'old', true);
assert.strictEqual(revoked.status, 'attention');

const absent = dkim.interpretSelectorQuery(['v=spf1 include:example.com'], 'mail', true);
assert.strictEqual(absent.status, 'missing');
assert.match(absent.text, /Otros selectores/);

assert.strictEqual(dkim.interpretSelectorQuery([], 'google', false).status, 'unknown');
const scan = dkim.interpretCommonScan(false, null);
assert.strictEqual(scan.status, 'unknown');
assert.match(scan.text, /no demuestra que falte DKIM/);
const scanGoogle = dkim.interpretCommonScan(true, 'google');
assert.strictEqual(scanGoogle.status, 'ok');
assert.match(scanGoogle.serviceNote, /Google Workspace/);
assert.match(scanGoogle.text, /no demuestra/);

const services = {
    google: 'Google Workspace',
    titan1: 'Titan Email',
    titan2: 'Titan Email',
    selector1: 'Microsoft 365',
    selector2: 'Microsoft 365',
    zmail: 'Zoho Mail',
    zoho: 'Zoho Mail',
    k1: 'Mailchimp',
    k2: 'Mailchimp',
    k3: 'Mailchimp',
    s1: 'SendGrid',
    s2: 'SendGrid',
    hs1: 'HubSpot',
    hs2: 'HubSpot',
    mandrill: 'Mandrill',
    amazonses: 'Amazon SES',
    ses: 'Amazon SES',
    mailjet: 'Mailjet',
    pm: 'Postmark',
    brevo: 'Brevo',
    sendinblue: 'Brevo'
};
Object.keys(services).forEach(function (selector) {
    const found = dkim.interpretSelectorQuery(['v=DKIM1; k=rsa; p=ABC'], selector, true);
    assert.strictEqual(found.status, 'ok');
    assert.strictEqual(found.serviceNote, 'Este selector suele estar relacionado con ' + services[selector] + '.');
    assert.strictEqual(found.businessNote, 'Eso significa que ese servicio puede firmar correos con tu dominio.');
    assert.doesNotMatch(found.serviceNote + found.businessNote, /pyme|precio|coincide con tu MX/i);
    assert.match(found.text, /no demuestra/);
});

const unknownSelector = dkim.interpretSelectorQuery(['v=DKIM1; p=QQQ'], 'correo1', true);
assert.match(unknownSelector.serviceNote, /El selector existe, pero no pudimos identificar el servicio a partir de su nombre/);
assert.match(unknownSelector.businessNote, /quien publicó esa clave puede firmar correos con tu dominio/);

assert.strictEqual(revoked.serviceNote, undefined);
assert.strictEqual(absent.serviceNote, undefined);
assert.strictEqual(dkim.interpretSelectorQuery([], 'titan1', false).serviceNote, undefined);
assert.strictEqual(scan.serviceNote, undefined);
assert.match(present.serviceNote, /Google Workspace/);
console.log('dkim-lookup tests ok');
