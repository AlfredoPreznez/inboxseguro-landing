const assert = require('assert');
const fs = require('fs');
const lead = require('./tool-lead.js');
const notify = require('./notify.js');

assert.ok(lead.COPY.indexOf('te contactamos') !== -1);
assert.ok(lead.leadMarkup({ idPrefix: 'spfLead' }).indexOf('tu@empresa.com') !== -1);
assert.ok(lead.leadMarkup({ idPrefix: 'spfLead' }).indexOf('Quiero el detalle') !== -1);
assert.ok(lead.leadMarkup({ idPrefix: 'spfLead' }).indexOf('id="spfLeadEmail"') !== -1);

var payload = notify.buildPayload({
    tool: 'SPF Checker',
    domain: 'empresa.com',
    email: 'tu@empresa.com',
    score: 'Configurado'
});
assert.strictEqual(payload.email, 'tu@empresa.com');

var calls = [];
global.fetch = function (url, options) {
    calls.push({ url: url, options: options });
    return Promise.resolve({ ok: true });
};

notify.notifyLead({
    tool: 'SPF Checker',
    domain: 'empresa.com',
    email: 'tu@empresa.com',
    score: 'ok'
}).then(function () {
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, notify.ENDPOINT);
    var body = JSON.parse(calls[0].options.body);
    assert.strictEqual(body.email, 'tu@empresa.com');
    assert.strictEqual(body.domain, 'empresa.com');

    return notify.notifyLead({ tool: 'SPF Checker', domain: 'empresa.com' }).then(
        function () { throw new Error('should reject without email'); },
        function (err) { assert.ok(err); }
    );
}).then(function () {
    var tools = [
        'spf-checker.html',
        'dkim-checker.html',
        'dmarc-checker.html',
        'mx-lookup.html',
        'domain-checker.html',
        'quien-puede-enviar-correos.html',
        'verificar-lista-negra.html'
    ];
    tools.forEach(function (file) {
        var html = fs.readFileSync(file, 'utf8');
        assert.ok(html.indexOf('/tool-lead.js') !== -1, file + ' carga tool-lead.js');
        assert.ok(html.indexOf('InboxSeguroToolLead.mount') !== -1, file + ' monta el lead');
    });
    console.log('tool-lead tests ok');
}).catch(function (err) {
    console.error(err);
    process.exit(1);
});
