/**
 * Precios públicos de InboxSeguro, por cantidad de dominios.
 * Una sola suscripción por cliente: los dominios adicionales no son otro plan
 * ni otra suscripción. El alta del panel solo conoce estos identificadores:
 *   Estándar → plan=starter
 *   Fundador → plan=founding
 *   Business → plan=business
 * La cantidad va en domains. El panel la usa como unidades del checkout.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.InboxSeguroPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var MAX_DOMAINS = 500;
  var REGISTER_BASE = 'https://panel.inboxseguro.com/register';

  var PLANS = {
    founding: {
      id: 'founding',
      name: 'Fundador',
      base: 25,
      included: 1,
      extraPrice: 5,
      maxDomains: 9,
      registerPlan: 'founding'
    },
    standard: {
      id: 'standard',
      name: 'Estándar',
      base: 39,
      included: 1,
      extraPrice: 10,
      maxDomains: 4,
      registerPlan: 'starter'
    },
    business: {
      id: 'business',
      name: 'Business',
      base: 79,
      included: 5,
      extraPrice: 7,
      maxDomains: 45,
      registerPlan: 'business'
    }
  };

  function clampDomains(value) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < 1) return 1;
    if (n > MAX_DOMAINS) return MAX_DOMAINS;
    return n;
  }

  function quote(planId, domains) {
    var plan = PLANS[planId];
    if (!plan) throw new Error('Plan desconocido: ' + planId);
    var count = clampDomains(domains);
    var extra = Math.max(0, count - plan.included);
    var extraCost = extra * plan.extraPrice;
    var available = !plan.maxDomains || count <= plan.maxDomains;
    return {
      id: plan.id,
      name: plan.name,
      domains: count,
      included: plan.included,
      maxDomains: plan.maxDomains || null,
      extra: extra,
      extraPrice: plan.extraPrice,
      extraCost: extraCost,
      base: plan.base,
      total: plan.base + extraCost,
      available: available
    };
  }

  /**
   * between: comparación estricta Estándar vs Business.
   * En empate no se elige Business por ser el plan superior.
   * best: el más barato entre los que se pueden contratar.
   * Fundador entra solo si hay plazas (foundingOpen).
   */
  function recommend(domains, foundingOpen) {
    var quotes = {
      founding: quote('founding', domains),
      standard: quote('standard', domains),
      business: quote('business', domains)
    };
    var between;
    if (!quotes.standard.available) between = 'upgrade';
    else if (quotes.business.total < quotes.standard.total) between = 'business';
    else if (quotes.standard.total < quotes.business.total) between = 'standard';
    else between = 'tie';

    var options = [];
    if (quotes.standard.available) options.push('standard');
    if (quotes.business.available) options.push('business');
    var best = options.length ? options[0] : null;
    for (var i = 1; i < options.length; i++) {
      var other = options[i];
      if (quotes[other].total < quotes[best].total) best = other;
      else if (quotes[other].total === quotes[best].total && best === 'business' && other === 'standard') best = 'standard';
    }
    if (foundingOpen && quotes.founding.available && (best === null || quotes.founding.total < quotes[best].total)) {
      best = 'founding';
    }

    return {
      quotes: quotes,
      between: between,
      best: best,
      foundingOpen: !!foundingOpen
    };
  }

  function registerUrl(planId, domains) {
    var plan = PLANS[planId];
    if (!plan || !plan.registerPlan) return null;
    var count = clampDomains(domains || 1);
    if (plan.maxDomains && count > plan.maxDomains) count = plan.maxDomains;
    return REGISTER_BASE + '?plan=' + plan.registerPlan + '&domains=' + count;
  }

  function domainNoun(n) {
    return n === 1 ? 'dominio' : 'dominios';
  }

  function extraLabel(q) {
    if (!q.available && q.id === 'standard') {
      return 'Máximo 4 dominios: 1 incluido y 3 adicionales. Para más, cambia de plan.';
    }
    if (!q.available && q.id === 'founding') {
      return 'La tarifa preferencial cubre hasta 9 dominios, sin cambiar de plan. Por encima, se acuerda con el equipo.';
    }
    if (!q.available && q.id === 'business') {
      return 'Hasta 45 dominios: 5 incluidos y 40 adicionales a US$7. Por encima, se acuerda con el equipo.';
    }
    if (q.extra === 0) return 'Sin dominios adicionales';
    var noun = q.extra === 1 ? 'dominio adicional' : 'dominios adicionales';
    return q.extra + ' ' + noun + ' · US$' + q.extraCost + '/mes';
  }

  function recommendationLines(result) {
    var q = result.quotes;
    var n = q.standard.domains;
    var lines = [];
    if (result.between === 'tie' && result.best !== 'founding') {
      lines.push(
        'Para ' + n + ' ' + domainNoun(n) + ', Estándar y Business cuestan lo mismo: US$' +
        q.standard.total + '/mes.'
      );
    } else if (result.best) {
      lines.push(
        'Para ' + n + ' ' + domainNoun(n) + ', la opción más económica es ' +
        q[result.best].name + ': US$' + q[result.best].total + '/mes.'
      );
    }
    if (!q.standard.available) {
      lines.push(
        'Estándar admite hasta 4 dominios: 1 incluido y 3 adicionales. Con ' +
        n + ' ' + domainNoun(n) + ' conviene cambiar de plan.'
      );
    } else if (result.between === 'tie') {
      lines.push(
        'Entre Estándar y Business no hay diferencia de precio (US$' + q.standard.total +
        '/mes). Business no conviene más solo por ser un plan superior.'
      );
    } else if (result.between === 'business') {
      lines.push(
        'Entre Estándar y Business, Business es más conveniente: US$' +
        q.business.total + ' frente a US$' + q.standard.total + '.'
      );
    } else {
      lines.push(
        'Entre Estándar y Business, Estándar es más conveniente: US$' +
        q.standard.total + ' frente a US$' + q.business.total + '.'
      );
    }
    if (!result.foundingOpen) {
      lines.push('El Plan Fundador no se puede contratar: las plazas están agotadas.');
    } else if (!q.founding.available) {
      lines.push('Fundador mantiene US$5 por dominio adicional hasta 9 dominios, sin cambiar de plan. Por encima de 9 se acuerda con el equipo.');
    }
    return lines;
  }

  function chipText(planId, result) {
    var q = result.quotes[planId];
    if (!q.available) {
      if (planId === 'standard') return 'Hasta 4 dominios';
      if (planId === 'founding') return 'Hasta 9 dominios';
      if (planId === 'business') return 'Hasta 45 dominios';
      return '';
    }
    if (result.best === planId) {
      if (result.between === 'tie' && planId !== 'founding') return 'Mismo precio';
      return 'Más económico';
    }
    if (result.between === planId) {
      return 'Más conveniente que ' + (planId === 'business' ? 'Estándar' : 'Business');
    }
    return '';
  }

  function mount(doc) {
    var root = doc.getElementById('pricing-app');
    if (!root) return;
    var numberInput = doc.getElementById('domain-count');
    var rangeInput = doc.getElementById('domain-range');
    if (!numberInput) return;

    var seatsOpen = root.getAttribute('data-founding-seats') === 'open';

    function paint(raw) {
      var result = recommend(raw, seatsOpen);
      var n = result.quotes.standard.domains;

      var counts = root.querySelectorAll('[data-domain-count]');
      for (var i = 0; i < counts.length; i++) counts[i].textContent = String(n);
      var nouns = root.querySelectorAll('[data-domain-noun]');
      for (var j = 0; j < nouns.length; j++) nouns[j].textContent = domainNoun(n);

      var ids = ['founding', 'standard', 'business'];
      for (var k = 0; k < ids.length; k++) {
        var id = ids[k];
        var q = result.quotes[id];
        var amounts = root.querySelectorAll('[data-quote-amount="' + id + '"]');
        for (var a = 0; a < amounts.length; a++) {
          amounts[a].textContent = q.available ? String(q.total) : ('Hasta ' + q.maxDomains);
        }
        var currencies = root.querySelectorAll('[data-quote-currency="' + id + '"]');
        for (var u = 0; u < currencies.length; u++) {
          if (q.available) currencies[u].classList.remove('hidden');
          else currencies[u].classList.add('hidden');
        }
        var sentences = root.querySelectorAll('[data-quote-sentence="' + id + '"]');
        var sentence = q.available
          ? ('Para ' + q.domains + ' ' + domainNoun(q.domains) + ': US$' + q.total + '/mes')
          : ('Hasta ' + q.maxDomains + ' ' + domainNoun(q.maxDomains) + ' en este plan');
        for (var s = 0; s < sentences.length; s++) sentences[s].textContent = sentence;
        var extras = root.querySelectorAll('[data-quote-extra="' + id + '"]');
        for (var e = 0; e < extras.length; e++) extras[e].textContent = extraLabel(q);
        var chips = root.querySelectorAll('[data-quote-chip="' + id + '"]');
        var label = chipText(id, result);
        for (var c = 0; c < chips.length; c++) {
          chips[c].textContent = label;
          if (label) chips[c].classList.remove('hidden');
          else chips[c].classList.add('hidden');
        }
        var links = root.querySelectorAll('[data-register-plan="' + id + '"]');
        var url = registerUrl(id, n);
        for (var h = 0; h < links.length; h++) {
          if (url && q.available) links[h].setAttribute('href', url);
        }
        var cards = root.querySelectorAll('[data-plan-card="' + id + '"]');
        for (var p = 0; p < cards.length; p++) {
          if (result.best === id) cards[p].classList.add('is-picked');
          else cards[p].classList.remove('is-picked');
          if (q.available) cards[p].classList.remove('is-capped');
          else cards[p].classList.add('is-capped');
        }
      }

      var lines = recommendationLines(result);
      var rec = doc.getElementById('pricing-recommendation');
      var versus = doc.getElementById('pricing-versus');
      var closed = doc.getElementById('pricing-founding-note');
      if (rec) rec.textContent = lines[0];
      if (versus) versus.textContent = lines[1];
      if (closed) {
        if (lines[2]) {
          closed.textContent = lines[2];
          closed.classList.remove('hidden');
        } else {
          closed.textContent = '';
          closed.classList.add('hidden');
        }
      }

      var presets = root.querySelectorAll('[data-domain-preset]');
      for (var s = 0; s < presets.length; s++) {
        var preset = Number(presets[s].getAttribute('data-domain-preset'));
        if (preset === n) presets[s].setAttribute('aria-pressed', 'true');
        else presets[s].setAttribute('aria-pressed', 'false');
      }

      if (numberInput.value !== String(n)) numberInput.value = String(n);
      if (rangeInput) {
        var slider = Math.min(n, Number(rangeInput.max) || n);
        if (rangeInput.value !== String(slider)) rangeInput.value = String(slider);
      }
    }

    function setDomains(raw) {
      paint(raw);
    }

    numberInput.addEventListener('input', function () {
      if (numberInput.value === '') return;
      setDomains(numberInput.value);
    });
    numberInput.addEventListener('blur', function () {
      setDomains(numberInput.value === '' ? 1 : numberInput.value);
    });
    if (rangeInput) {
      rangeInput.addEventListener('input', function () {
        setDomains(rangeInput.value);
      });
    }

    var steps = root.querySelectorAll('[data-domain-step]');
    for (var t = 0; t < steps.length; t++) {
      steps[t].addEventListener('click', function (event) {
        var delta = Number(event.currentTarget.getAttribute('data-domain-step')) || 0;
        var current = numberInput.value === '' ? 1 : Number(numberInput.value);
        setDomains(current + delta);
        numberInput.focus();
      });
    }

    var presetButtons = root.querySelectorAll('[data-domain-preset]');
    for (var u = 0; u < presetButtons.length; u++) {
      presetButtons[u].addEventListener('click', function (event) {
        setDomains(event.currentTarget.getAttribute('data-domain-preset'));
      });
    }

    var ctas = root.querySelectorAll('[data-founding-cta]');
    var closedBlocks = root.querySelectorAll('[data-founding-closed]');
    for (var f = 0; f < ctas.length; f++) {
      if (seatsOpen) ctas[f].classList.remove('hidden');
      else ctas[f].classList.add('hidden');
    }
    for (var g = 0; g < closedBlocks.length; g++) {
      if (seatsOpen) closedBlocks[g].classList.add('hidden');
      else closedBlocks[g].classList.remove('hidden');
    }

    setDomains(numberInput.value || 1);
  }

  return {
    MAX_DOMAINS: MAX_DOMAINS,
    PLANS: PLANS,
    clampDomains: clampDomains,
    quote: quote,
    recommend: recommend,
    registerUrl: registerUrl,
    extraLabel: extraLabel,
    recommendationLines: recommendationLines,
    chipText: chipText,
    mount: mount
  };
});
