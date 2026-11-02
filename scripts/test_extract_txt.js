#!/usr/bin/env node
/**
 * Prueba mínima: extractTXT concatena fragmentos TXT entre comillas sin espacio (RFC 7208 / RFC 6376).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'dns-utils.js'), 'utf8');
const context = { window: {}, console: console };
vm.createContext(context);
vm.runInContext(code, context);

const extractTXT = context.window.extractTXT;
if (typeof extractTXT !== 'function') {
    console.error('FAIL: extractTXT no está definido');
    process.exit(1);
}

function assert(condition, message) {
    if (!condition) {
        console.error('FAIL:', message);
        process.exit(1);
    }
}

const single = extractTXT({
    Answer: [{ type: 16, data: '"v=spf1 ip4:192.0.2.1 -all"' }]
});
assert(single.length === 1 && single[0] === 'v=spf1 ip4:192.0.2.1 -all', 'registro TXT de un solo trozo');

const chunked = extractTXT({
    Answer: [{
        type: 16,
        data: '"v=spf1 include:sub2.test-" "nested.fake -all"'
    }]
});
assert(
    chunked.length === 1 && chunked[0] === 'v=spf1 include:sub2.test-nested.fake -all',
    'fragmentos TXT unidos sin espacio'
);

console.log('OK: test_extract_txt.js (' + chunked[0] + ')');
