const assert = require('assert');
const fs = require('fs');
const notify = require('./notify.js');

assert.strictEqual(notify.ENDPOINT, 'https://panel.inboxseguro.com/api/public/diagnosis-notify');

var payload = notify.buildPayload({
    tool: 'SPF Checker',
    domain: ' empresa.com ',
    score: 'Configurado',
    results: { spf: 'v=spf1 -all' }
});
assert.deepStrictEqual(payload, {
    domain: 'empresa.com',
    tool: 'SPF Checker',
    score: 'SPF Checker · Configurado',
    results: { spf: 'v=spf1 -all' }
});

assert.strictEqual(
    notify.buildPayload({ tool: 'Email Security Check', domain: 'a.com', score: 'SPF: ok · DMARC: ok' }).score,
    'Email Security Check · SPF: ok · DMARC: ok'
);
assert.strictEqual(
    notify.buildPayload({ tool: 'MX Lookup', domain: 'a.com', score: 'MX Lookup · ok' }).score,
    'MX Lookup · ok'
);
assert.deepStrictEqual(notify.buildPayload({ domain: 'a.com' }).results, {});
assert.strictEqual(
    notify.buildPayload({ tool: 'SPF Checker', domain: 'a.com', email: 'tu@empresa.com' }).email,
    'tu@empresa.com'
);
assert.strictEqual(notify.buildPayload({ tool: 'SPF Checker', domain: 'a.com' }).email, undefined);

var calls = [];
global.fetch = function (url, options) {
    calls.push({ url: url, options: options });
    return Promise.reject(new Error('red'));
};
notify.notifyToolUse({ tool: 'MX Lookup', domain: 'empresa.com', score: 'Configurado', results: { mx: 'Google' } });
assert.strictEqual(calls.length, 1);
assert.strictEqual(calls[0].url, notify.ENDPOINT);
assert.strictEqual(calls[0].options.method, 'POST');
assert.deepStrictEqual(JSON.parse(calls[0].options.body), {
    domain: 'empresa.com',
    tool: 'MX Lookup',
    score: 'MX Lookup · Configurado',
    results: { mx: 'Google' }
});

notify.notifyToolUse({ tool: 'SPF Checker', domain: '   ', score: 'x' });
assert.strictEqual(calls.length, 1);

global.fetch = function () { throw new Error('boom'); };
assert.doesNotThrow(function () {
    notify.notifyToolUse({ tool: 'DKIM Checker', domain: 'empresa.com', score: 'ok' });
});

global.fetch = function (url, options) {
    calls.push({ url: url, options: options });
    return Promise.resolve({ ok: false, status: 500 });
};
notify.notifyLead({
    tool: 'SPF Checker',
    domain: 'empresa.com',
    email: 'tu@empresa.com'
}).then(
    function () { throw new Error('expected reject'); },
    function () { /* ok */ }
).then(function () {
    var tools = [
        ['domain-checker.html', 'Email Security Check'],
        ['spf-checker.html', 'SPF Checker'],
        ['dmarc-checker.html', 'DMARC Checker'],
        ['dkim-checker.html', 'DKIM Checker'],
        ['mx-lookup.html', 'MX Lookup'],
        ['quien-puede-enviar-correos.html', 'Email Sender Checker'],
        ['verificar-lista-negra.html', 'Verificar lista negra'],
        ['inboxscore.html', 'InboxScore']
    ];
    tools.forEach(function (row) {
        var html = fs.readFileSync(row[0], 'utf8');
        var srcAt = html.indexOf('/notify.js');
        var callAt = html.indexOf('notifyToolUse');
        assert.ok(srcAt !== -1, row[0] + ' carga notify.js');
        assert.ok(callAt > srcAt, row[0] + ' llama al helper después de cargarlo');
        assert.ok(html.slice(callAt, callAt + 500).indexOf(row[1]) !== -1, row[0] + ' nombra la herramienta');
        assert.strictEqual(html.indexOf('diagnosis-notify'), -1, row[0] + ' no duplica la URL');
    });

    assert.strictEqual(fs.readFileSync('notify.js', 'utf8').split(notify.ENDPOINT).length - 1, 1);
    console.log('notify tests ok');
}).catch(function (err) {
    console.error(err);
    process.exit(1);
});
