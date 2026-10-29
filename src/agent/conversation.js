'use strict';
const { t } = require('../i18n');
const domainRules = require('../domain/rules');

const PRODUCT_NAMES = [
  ['business-deposit-ladder', /business.*ladder|deposit ladder|scadente esalonate/],
  ['business-liquid-reserve', /business.*reserve|rezerva.*firm/],
  ['buffer-savings', /buffer savings|economii flexibile/],
  ['voluntary-pension', /pension|pensie/],
  ['term-deposit', /term deposit|depozit/],
  ['bond-fund', /bond|obligatiuni/],
  ['stocks-etfs', /etf|stocks|actiuni/],
  ['diversified-fund', /diversified|diversificat/],
];

// Deposit-protection questions (folded text). Kept separate from return guarantees,
// which are refused by safety.refusal().
const PROTECTION = new RegExp([
  /deposit (guarantee|protection|insurance)|guarantee (scheme|fund)|\bfgdb\b|fondul de garantare/.source,
  /garantarea depozitelor|depozit\w*.{0,40}(garantat|protejat|asigurat|acoperit)/.source,
  /(deposit|deposits|savings|money|cash)\b.{0,40}\b(guaranteed|protected|insured|covered|safe)\b/.source,
  /bank (fails|failed|failure|goes bankrupt|went bankrupt|collapses|goes bust|goes under)|if the bank/.source,
  /banca (da|ar da|intra|ar intra) (in )?faliment|falimentul bancii|daca banca/.source,
].join('|'));
const RULES = /why can'?t i|why cannot i|why am i not allowed|why is .* not (available|allowed|offered)|what rules|which rules|regulation|de ce nu pot|ce reguli|ce regul|reguli|regulament|reglement/;
const PENSION = /pension.*(tax|deduct)|(tax|deduct).*pension|pensi.*(deduc|fiscal|impozit)|(deduc|impozit).*pensi|pillar (3|iii)|pilonul (3|iii)/;

function classify(value) {
  if (PROTECTION.test(value)) {
    const product = PRODUCT_NAMES.find(([, pattern]) => pattern.test(value));
    return product ? { topic: 'protection', productId: product[0] } : { topic: 'protection' };
  }
  if (RULES.test(value)) {
    const product = PRODUCT_NAMES.find(([, pattern]) => pattern.test(value));
    return product ? { topic: 'rules', productId: product[0] } : { topic: 'rules' };
  }
  if (PENSION.test(value)) return { topic: 'pension', productId: 'voluntary-pension' };
  if (/why.*(this|recommend|product)|de ce.*(produs|recomand)/.test(value)) return { topic: 'why' };
  if (/what.*(know|data).*me|ce.*(stii|date).*mine/.test(value)) return { topic: 'profile' };
  if (/^(hi|hello|hey|salut|buna)( there)?[!. ]*$/.test(value)) return { topic: 'greeting' };
  if (/^(thanks|thank you|bye|goodbye|multumesc|mersi|la revedere)[!. ]*$/.test(value)) return { topic: 'thanks' };
  if (/withdraw|liquid|take.*money.*out|retrag|lichid/.test(value)) return { topic: 'withdraw' };
  if (/\bfees?\b|commission|comisio|costuri/.test(value)) return { topic: 'fees' };
  if (/market.*(drop|fall|crash)|market drops|lose.*money|piata.*(scad|cade)|scade piata/.test(value)) {
    return { topic: 'market' };
  }
  if (/inflation|inflatie|prices.*rise|preturi/.test(value)) return { topic: 'inflation' };
  if (/\btax\b|\btaxes\b|\btaxe\b|fiscal/.test(value) && !/help.*plan|ajuta.*plan/.test(value)) {
    return { topic: 'tax' };
  }
  if (/minimum|minim|least.*start|how little/.test(value)) return { topic: 'minimum' };
  if (/bitcoin|crypto|hot tips|hot stock|single stocks|cripto|ponturi/.test(value)) return { topic: 'crypto' };
  if (/how.*fund.*work|how.*funds.*work|cum.*function.*fond|cum.*merge.*fond/.test(value)) {
    return { topic: 'fund' };
  }
  if (/explain|tell me about|what is|explica|spune.*despre|ce este/.test(value)) {
    const product = PRODUCT_NAMES.find(([, pattern]) => pattern.test(value));
    if (product) return { topic: 'product', productId: product[0] };
  }
  if (/^(yes[,! ]*)?confirm|^da[,! ]*confirma/.test(value)) return { topic: 'confirmation' };
  return null;
}

const call = (name, input = {}) => ({ id: 'question-' + name, name, input });

function next(route, results) {
  results.conversation = route;
  if (!results.get_customer_profile) return { toolCalls: [call('get_customer_profile')] };
  const profile = results.get_customer_profile;
  if (profile.error) {
    return results.request_authentication ? { text: '' }
      : { toolCalls: [call('request_authentication', { kind: 'login' })], stopAfterTools: true };
  }
  if (['greeting', 'thanks', 'confirmation'].includes(route.topic)) return { text: '' };
  if (!results.find_savings_capacity) return { toolCalls: [call('find_savings_capacity')] };
  if (route.topic === 'profile' && !results.get_spending_summary) {
    return { toolCalls: [call('get_spending_summary')] };
  }
  if (route.topic === 'protection' && !results.check_rules) {
    return { toolCalls: [call('check_rules', { topic: 'deposit_protection',
      productId: route.productId || profile.planning.product.id })] };
  }
  if (route.topic === 'pension' && !results.check_rules) {
    return { toolCalls: [call('check_rules', { topic: 'pension_deduction', productId: 'voluntary-pension' })] };
  }
  if (route.topic === 'tax' && !results.check_rules) {
    return { toolCalls: [call('check_rules', { topic: 'tax_scope' })] };
  }
  if (route.topic === 'rules' && results.compare_products && !results.check_rules) {
    const target = results.compare_products.products?.find(item => item.id === (route.productId
      || profile.planning.product.id));
    return { toolCalls: [call('check_rules', { topic: target?.ruleIds?.[0] || 'appropriateness',
      productId: target?.id || profile.planning.product.id })] };
  }
  if (['product', 'rules'].includes(route.topic) && !results.compare_products) {
    return { toolCalls: [call('compare_products', {
      horizonYears: profile.planning.horizonYears,
      riskComfort: profile.planning.risk || 'medium',
    })] };
  }
  if (['market', 'inflation'].includes(route.topic) && !results.simulate) {
    return { toolCalls: [call('simulate', {
      monthly: profile.planning.monthly,
      years: Math.max(1, Math.floor(profile.planning.horizonYears)),
      productId: profile.planning.product.id,
    })] };
  }
  return { text: '' };
}

function answer(results, language) {
  if (results.request_authentication) return t(language, 'needHistory');
  const profile = results.get_customer_profile;
  if (!profile || profile.error) return t(language, 'unavailable');
  const route = results.conversation;
  const planning = profile.planning;
  const product = route.productId
    ? results.compare_products?.products?.find(item => item.id === route.productId) : planning.product;
  const cap = results.find_savings_capacity;
  const simulation = results.simulate;
  const values = {
    name: profile.firstName,
    product: t(language, 'product_' + (product?.id || planning.product.id)),
    monthly: planning.monthly,
    years: planning.horizonYears,
    fee: product?.annualFeePct,
    entryFee: product?.entryFeePct,
    days: product?.settlementDays,
    minimum: product?.minMonthly,
    buffer: cap?.buffer,
    safe: cap?.safeMonthly,
    obligations: cap?.obligationTotal,
    income: results.get_spending_summary?.monthlyIncome,
    spend: results.get_spending_summary?.monthlySpend,
    fund: simulation?.fund,
    stressed: simulation?.stressFund,
    drop: simulation?.stressDropPct,
    cash: simulation?.cashReal,
    inflation: simulation?.inflationPct,
  };
  if (['protection', 'pension', 'tax', 'rules'].includes(route.topic)) {
    const checked = results.check_rules;
    if (!checked || checked.error || !checked.rules?.length) return t(language, 'unavailable');
    return rulesAnswer(route, results, values, language);
  }
  let key = 'question_' + route.topic;
  if (route.topic === 'withdraw') key += '_' + product.liquidity;
  if (route.topic === 'market' && product.risk < 2) key = 'question_market_buffer';
  if (['market', 'inflation'].includes(route.topic) && simulation?.error) return t(language, 'unavailable');
  if (route.topic === 'product') {
    values.description = t(language, 'blurb_' + product.id);
    values.liquidity = t(language, 'liquidity_' + product.liquidity);
  }
  return t(language, key, format(values, language));
}

function format(values, language) {
  const out = { ...values };
  for (const [name, value] of Object.entries(out)) {
    if (typeof value === 'number') out[name] = value.toLocaleString(language === 'ro' ? 'ro-RO' : 'en-US');
  }
  return out;
}

// Every figure in these answers comes from the check_rules or capacity tool result, never from the template.
function rulesAnswer(route, results, values, language) {
  const checked = results.check_rules;
  const rule = id => checked.rules.find(item => item.id === id);
  const say = (key, extra = {}) => t(language, key, format({ ...values, ...extra }, language));
  const sources = list => [...new Set(list.filter(Boolean).map(item => item.source))].join('; ');
  if (route.topic === 'protection') {
    const product = t(language, 'product_' + checked.product.id);
    const parts = [];
    let cited;
    if (checked.product.protection === 'deposit_guarantee' && rule('fgdb-deposit-cover')) {
      const cover = rule('fgdb-deposit-cover');
      parts.push(say('question_protection_deposit', { product, scheme: cover.constraint.scheme,
        coverage: cover.constraint.coverageEur }));
      cited = [cover];
    } else {
      parts.push(say('question_protection_other', { product }));
      cited = [rule('not-a-deposit')];
      if (rule('depositary-segregation')) { parts.push(say('protectionLine_depositary')); cited.push(rule('depositary-segregation')); }
      const compensation = rule('investor-compensation');
      if (compensation) {
        parts.push(say('protectionLine_compensation', { compensation: compensation.constraint.compensationEur }));
        cited.push(compensation);
      }
      if (rule('pension-rights-guarantee')) { parts.push(say('protectionLine_pension')); cited.push(rule('pension-rights-guarantee')); }
    }
    parts.push(say('rulesClosing', { source: sources(cited) }));
    return parts.join(' ');
  }
  if (route.topic === 'pension') {
    const deduction = rule('pillar3-deduction');
    if (!deduction) return t(language, 'unavailable');
    return say('question_pension', { product: t(language, 'product_voluntary-pension'),
      cap: deduction.constraint.deductibleEurPerYear, source: deduction.source });
  }
  if (route.topic === 'tax') {
    const freelancer = results.get_customer_profile.incomePattern === 'irregular' && rule('pfa-single-declaration');
    const cited = freelancer || rule('no-tax-advice') || checked.rules[0];
    return say('question_tax') + ' ' + say(freelancer ? 'taxLine_pfa' : 'taxLine_scope',
      { rule: cited.title, source: cited.source });
  }
  const planning = results.get_customer_profile.planning;
  const target = results.compare_products?.products?.find(item => item.id === (route.productId || planning.product.id));
  if (!target) return t(language, 'unavailable');
  // Cite the rule cards that actually excluded the product (all of them), not the topic's first card.
  const causes = (target.ruleCards || []).map(id => domainRules.RULES.find(item => item.id === id))
    .filter(Boolean).map(item => domainRules.localize(item, language));
  const cited = causes.length ? causes : [checked.rules[0]];
  const extra = { product: t(language, 'product_' + target.id), rule: cited.map(item => item.title).join('; '),
    source: sources(cited) };
  if (target.eligible) return say('question_rules_ok', extra);
  return say('question_rules_blocked', { ...extra,
    reasons: (target.ruleIds || []).map(id => t(language, 'ruleShort_' + id)).join(' ') });
}

module.exports = { classify, next, answer, PROTECTION };
