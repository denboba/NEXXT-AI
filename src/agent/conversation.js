'use strict';
const { t } = require('../i18n');

const PRODUCT_NAMES = [
  ['business-deposit-ladder', /business.*ladder|deposit ladder|scadente esalonate/],
  ['business-liquid-reserve', /business.*reserve|rezerva.*firm/],
  ['buffer-savings', /buffer savings|economii flexibile/],
  ['voluntary-pension', /pension|pensie/],
  ['term-deposit', /term deposit|depozit/],
  ['bond-fund', /bond|obligatiuni/],
  ['stocks-etfs', /etf|single stocks|actiuni/],
  ['diversified-fund', /diversified|diversificat/],
];

function classify(value) {
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
  if (route.topic === 'product' && !results.compare_products) {
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
  let key = 'question_' + route.topic;
  if (route.topic === 'withdraw') key += '_' + product.liquidity;
  if (route.topic === 'market' && product.risk < 2) key = 'question_market_buffer';
  if (['market', 'inflation'].includes(route.topic) && simulation?.error) return t(language, 'unavailable');
  if (route.topic === 'product') {
    values.description = t(language, 'blurb_' + product.id);
    values.liquidity = t(language, 'liquidity_' + product.liquidity);
  }
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'number') values[name] = value.toLocaleString(language === 'ro' ? 'ro-RO' : 'en-US');
  }
  return t(language, key, values);
}

module.exports = { classify, next, answer };
