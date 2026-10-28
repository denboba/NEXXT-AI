'use strict';
const ESSENTIALS = new Set(['rent', 'utilities', 'groceries', 'transport', 'health']);
const round = n => Math.round(n * 100) / 100;
function spending(customer, months = 12) {
  const periods = [...new Set(customer.transactions.map(tx => tx.date.slice(0, 7)))].sort().slice(-months);
  const transactions = customer.transactions.filter(tx => periods.includes(tx.date.slice(0, 7)));
  const categories = {}, monthly = {}, merchants = new Map();
  for (const tx of transactions) {
    const period = tx.date.slice(0, 7); monthly[period] ||= { income: 0, spend: 0 };
    if (tx.amount > 0) monthly[period].income += tx.amount;
    else { monthly[period].spend -= tx.amount; categories[tx.category] = round((categories[tx.category] || 0) - tx.amount); }
    if (tx.recurring && tx.amount < 0) {
      const key = tx.category + ':' + tx.merchant;
      const item = merchants.get(key) || { merchant: tx.merchant, category: tx.category, total: 0, count: 0 };
      item.total -= tx.amount; item.count++; merchants.set(key, item);
    }
  }
  const count = periods.length || 1;
  const income = round(Object.values(monthly).reduce((sum, month) => sum + month.income, 0));
  const spend = round(Object.values(categories).reduce((sum, amount) => sum + amount, 0));
  const recurringBills = [...merchants.values()].map(({ total, count: occurrences, ...item }) => ({
    ...item, monthly: round(total / count), occurrences,
  }));
  return { months: count, income, spend,
    monthlyIncome: round(income / count), monthlySpend: round(spend / count),
    monthlySurplus: round((income - spend) / count), categories, monthly, recurringBills,
    subscriptions: recurringBills.filter(item => item.category === 'subscriptions'),
    trend: Object.values(monthly).at(-1)?.spend - Object.values(monthly)[0]?.spend || 0,
  };
}
function capacity(customer, balance = customer.balance, changes = {}) {
  const summary = spending(customer);
  const irregular = customer.incomePattern === 'irregular';
  const business = customer.segment === 'business';
  const bufferMonths = business ? 3 : irregular ? 6 : customer.incomePattern === 'part-time' ? 1 : 3;
  const extraRent = changes.rentIncrease || 0;
  const essentialMonthly = round(Object.entries(summary.categories)
    .filter(([key]) => ESSENTIALS.has(key))
    .reduce((sum, [, value]) => sum + value / summary.months, 0) + extraRent);
  const buffer = round(essentialMonthly * bufferMonths);
  const obligations = (customer.obligations || []).map(item => ({ ...item }));
  const obligationTotal = obligations.reduce((sum, item) => sum + item.amount, 0);
  const cashFlowLowReserve = business ? Math.max(0, ...Object.values(summary.monthly).map(month => month.spend - month.income)) : 0;
  const adjustedBalance = round(balance + (changes.bonus || 0));
  const idleCash = Math.max(0, round(adjustedBalance - buffer - obligationTotal - cashFlowLowReserve));
  const bufferShortfall = Math.max(0, round(buffer + obligationTotal + cashFlowLowReserve - adjustedBalance));
  const surplus = round(summary.monthlySurplus - extraRent);
  const bufferReady = bufferShortfall === 0;
  const safeMonthly = bufferReady ? Math.max(0, Math.min(irregular ? 200 : 2000, Math.floor(surplus * .5 / 50) * 50)) : 0;
  const subscriptionSaving = round(summary.subscriptions.reduce((sum, bill) => sum + bill.monthly, 0) * .5);
  const microSaving = !bufferReady && surplus + subscriptionSaving >= 100 ? 100 : 0;
  return { asOf: customer.asOf, balance: adjustedBalance, essentialMonthly, bufferMonths, buffer,
    obligations, obligationTotal, cashFlowLowReserve, idleCash, monthlySurplus: surplus, safeMonthly,
    bufferReady, bufferShortfall, microSaving, subscriptionSaving,
    readyInMonths: bufferShortfall && microSaving ? Math.ceil(bufferShortfall / microSaving) : 0,
    reasons: ['Reserve essentials before investing.', 'Upcoming obligations are not investable cash.',
      irregular ? 'Irregular income needs a larger buffer and smaller recurring commitments.'
        : business ? 'Protect payroll and seasonal cash-flow lows.'
          : 'Only half the observed surplus is available for a recurring commitment.'],
    ...(business ? { ladder: [1, 2, 3].map(month => ({ month, amount: Math.floor(idleCash / 3 / 100) * 100 })) } : {}),
  };
}
module.exports = { spending, capacity };
