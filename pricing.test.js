const assert = require('assert');
const pricing = require('./pricing.js');

function totals(n, open) {
  const result = pricing.recommend(n, open);
  return {
    founding: result.quotes.founding.total,
    standard: result.quotes.standard.total,
    business: result.quotes.business.total,
    foundingExtra: result.quotes.founding.extraCost,
    standardExtra: result.quotes.standard.extraCost,
    businessExtra: result.quotes.business.extraCost,
    between: result.between,
    best: result.best
  };
}

assert.deepStrictEqual(totals(1, true), {
  founding: 25,
  standard: 39,
  business: 79,
  foundingExtra: 0,
  standardExtra: 0,
  businessExtra: 0,
  between: 'standard',
  best: 'founding'
});

assert.strictEqual(pricing.quote('founding', 4).total, 25 + 3 * 5);
assert.strictEqual(pricing.quote('standard', 4).total, 39 + 3 * 10);
assert.strictEqual(pricing.quote('business', 4).total, 79);
assert.strictEqual(pricing.quote('business', 4).extraCost, 0);

assert.strictEqual(pricing.quote('founding', 6).total, 25 + 5 * 5);
assert.strictEqual(pricing.quote('standard', 6).total, 39 + 5 * 10);
assert.strictEqual(pricing.quote('business', 6).total, 79 + 1 * 8);
assert.strictEqual(pricing.quote('business', 6).extra, 1);

const atFive = totals(5, true);
assert.strictEqual(atFive.standard, 79);
assert.strictEqual(atFive.business, 79);
assert.strictEqual(atFive.between, 'tie');
assert.strictEqual(atFive.best, 'founding');
assert.strictEqual(pricing.recommend(5, false).best, 'standard');
assert.notStrictEqual(pricing.recommend(5, false).best, 'business');

const atSix = totals(6, false);
assert.strictEqual(atSix.between, 'business');
assert.strictEqual(atSix.best, 'business');
assert.ok(atSix.business < atSix.standard);

assert.strictEqual(pricing.recommend(2, false).best, 'standard');
assert.strictEqual(pricing.recommend(2, false).between, 'standard');

assert.strictEqual(pricing.clampDomains(0), 1);
assert.strictEqual(pricing.clampDomains(-4), 1);
assert.strictEqual(pricing.clampDomains('no'), 1);
assert.strictEqual(pricing.clampDomains(1.9), 1);
assert.strictEqual(pricing.clampDomains(900), 500);
assert.strictEqual(pricing.quote('standard', 0).domains, 1);

assert.strictEqual(pricing.registerUrl('standard'), 'https://panel.inboxseguro.com/register?plan=starter');
assert.strictEqual(pricing.registerUrl('founding'), 'https://panel.inboxseguro.com/register?plan=founding');
assert.strictEqual(pricing.registerUrl('business'), null);
assert.strictEqual(pricing.PLANS.business.registerPlan, null);

assert.strictEqual(pricing.chipText('business', pricing.recommend(6, true)), 'Más conveniente que Estándar');
assert.strictEqual(pricing.chipText('founding', pricing.recommend(6, true)), 'Más económico');
assert.strictEqual(pricing.chipText('business', pricing.recommend(5, false)), '');
assert.strictEqual(pricing.chipText('standard', pricing.recommend(5, false)), 'Mismo precio');

const lines = pricing.recommendationLines(pricing.recommend(6, true));
assert.match(lines[0], /Fundador: US\$50\/mes/);
assert.match(lines[1], /Business es más conveniente: US\$87 frente a US\$89/);
assert.strictEqual(lines.length, 2);

const closed = pricing.recommendationLines(pricing.recommend(6, false));
assert.match(closed[0], /Business: US\$87\/mes/);
assert.match(closed[2], /plazas están agotadas/);

assert.strictEqual(pricing.extraLabel(pricing.quote('business', 7)), '2 dominios adicionales · US$16/mes');
assert.strictEqual(pricing.extraLabel(pricing.quote('standard', 1)), 'Sin dominios adicionales');

function FakeClassList(initial) {
  const set = new Set((initial || '').split(/\s+/).filter(Boolean));
  return {
    add(name) { set.add(name); },
    remove(name) { set.delete(name); },
    contains(name) { return set.has(name); },
    toString() { return Array.from(set).join(' '); }
  };
}

function FakeEl(attrs) {
  attrs = attrs || {};
  const el = {
    attrs: Object.assign({}, attrs),
    textContent: attrs.text || '',
    value: attrs.value || '',
    classList: FakeClassList(attrs.className || ''),
    children: [],
    listeners: {},
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    focus() {},
    querySelectorAll(selector) {
      const all = [];
      (function walk(node) {
        all.push(node);
        node.children.forEach(walk);
      })(el);
      return all.filter((node) => matches(node, selector));
    }
  };
  return el;
}

function matches(node, selector) {
  const valued = selector.match(/^\[([^=\]]+)="([^"]+)"\]$/);
  if (valued) return node.getAttribute(valued[1]) === valued[2];
  const present = selector.match(/^\[([^\]]+)\]$/);
  if (present) return node.getAttribute(present[1]) !== null;
  return false;
}

function mountHarness(seats) {
  const root = FakeEl({ id: 'pricing-app', 'data-founding-seats': seats });
  const numberInput = FakeEl({ id: 'domain-count', value: '1' });
  const rangeInput = FakeEl({ id: 'domain-range', value: '1', max: '40' });
  const rec = FakeEl({ id: 'pricing-recommendation' });
  const versus = FakeEl({ id: 'pricing-versus' });
  const note = FakeEl({ id: 'pricing-founding-note', className: 'hidden' });
  const foundingCta = FakeEl({ 'data-founding-cta': '', className: '' });
  const foundingClosed = FakeEl({ 'data-founding-closed': '', className: 'hidden' });
  ['founding', 'standard', 'business'].forEach((id) => {
    root.children.push(FakeEl({ 'data-plan-card': id, 'data-quote-amount': id }));
    root.children.push(FakeEl({ 'data-quote-extra': id }));
    root.children.push(FakeEl({ 'data-quote-chip': id, className: 'hidden' }));
  });
  root.children.push(foundingCta, foundingClosed, numberInput, rangeInput);
  const byId = {
    'pricing-app': root,
    'domain-count': numberInput,
    'domain-range': rangeInput,
    'pricing-recommendation': rec,
    'pricing-versus': versus,
    'pricing-founding-note': note
  };
  const doc = {
    getElementById(id) { return byId[id] || null; }
  };
  pricing.mount(doc);
  return { numberInput, rec, versus, note, foundingCta, foundingClosed, root };
}

const openUi = mountHarness('open');
assert.strictEqual(openUi.foundingCta.classList.contains('hidden'), false);
assert.strictEqual(openUi.foundingClosed.classList.contains('hidden'), true);
assert.match(openUi.rec.textContent, /Fundador: US\$25\/mes/);
assert.strictEqual(openUi.root.querySelectorAll('[data-quote-chip="founding"]')[0].textContent, 'Más económico');

openUi.numberInput.value = '6';
openUi.numberInput.listeners.input();
assert.match(openUi.rec.textContent, /Fundador: US\$50\/mes/);
assert.match(openUi.versus.textContent, /Business es más conveniente: US\$87 frente a US\$89/);
assert.strictEqual(openUi.root.querySelectorAll('[data-quote-amount="business"]')[0].textContent, '87');
assert.strictEqual(openUi.root.querySelectorAll('[data-quote-extra="business"]')[0].textContent, '1 dominio adicional · US$8/mes');
assert.strictEqual(openUi.root.querySelectorAll('[data-plan-card="business"]')[0].classList.contains('is-picked'), false);
assert.strictEqual(openUi.root.querySelectorAll('[data-plan-card="founding"]')[0].classList.contains('is-picked'), true);

openUi.numberInput.value = '5';
openUi.numberInput.listeners.input();
assert.match(openUi.versus.textContent, /no hay diferencia de precio/);
assert.strictEqual(openUi.root.querySelectorAll('[data-quote-chip="business"]')[0].textContent, '');
assert.strictEqual(openUi.root.querySelectorAll('[data-quote-chip="business"]')[0].classList.contains('hidden'), true);

const closedUi = mountHarness('closed');
assert.strictEqual(closedUi.foundingCta.classList.contains('hidden'), true);
assert.strictEqual(closedUi.foundingClosed.classList.contains('hidden'), false);
closedUi.numberInput.value = '6';
closedUi.numberInput.listeners.input();
assert.match(closedUi.rec.textContent, /Business: US\$87\/mes/);
assert.match(closedUi.note.textContent, /plazas están agotadas/);
assert.strictEqual(closedUi.root.querySelectorAll('[data-plan-card="business"]')[0].classList.contains('is-picked'), true);

console.log('pricing tests ok');

