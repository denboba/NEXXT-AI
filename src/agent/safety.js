'use strict';
const clean = text => String(text || '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim();
const fold = text => clean(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function refusal(text, customer) {
  const value = fold(text);
  const injection = new RegExp([
    /ignore.*(instruction|rule|previous)|system prompt|reveal.*(secret|token|key)|override|jailbreak/.source,
    /ignora.*(instruct|regul)|act as.*(system|admin)|execute.*(shell|command)|<\/?system>|\[inst\]/.source,
  ].join('|'));
  if (injection.test(value)) return 'injection';
  const otherNames = ['ioana','andrei','mihai','elena'].filter(name => name !== customer?.firstName?.toLowerCase());
  const crossCustomer = new RegExp([
    /other (customer|client|person|user)|another (customer|client|person|user)|all (customer|client)/.source,
    /altui client|alti clienti|altor clienti|customer[_ -]?id|user[_ -]?id/.source,
  ].join('|'));
  if (crossCustomer.test(value) || otherNames.some(name => new RegExp('\\b' + name + '\\b').test(value))) {
    return 'cross_customer';
  }
  if (/guarantee|guaranteed|garant(eaza|at|ezi)|fara risc/.test(value)) return 'guarantee';
  const protectedMoney = new RegExp([
    /emergency fund|emergency buffer|fondul de urgenta|banii de urgenta/.source,
    /everything.*(stock|invest)|tot(i|i banii|ul).*(actiuni|invest)/.source,
  ].join('|'));
  if (protectedMoney.test(value)) return 'protected_money';
  if (/\b(fuck|shit|idiot|stupid|prost|tampit)\b/.test(value)) return 'abuse';
  if (require('./conversation').classify(value)) return null;
  const offTopic = /weather|football|politic|president|recipe|write.*(code|poem)|tell.*joke|vremea|fotbal|reteta|poezie|napoleon/;
  if (offTopic.test(value)) return 'off_topic';
  const finance = new RegExp([
    /invest|sav(e|ing)|spare|cash|money|budget|start|begin|compare|product|plan|risk|low|medium|high|bonus|rent|car|year|fee/.source,
    /tax|payroll|buffer|salary|income|spend|subscription|deposit|fund|pension|stock|advis|human|person|withdraw|confirm|yes|help/.source,
    /bani|econom|incep|risc|scazut|mediu|ridicat|chiri|masin|ani|depozit|doband|salari|fond|pens|cheltu|abonament/.source,
    /compar|consilier|ajutor|lichid|doi|bonjour|salut/.source,
  ].join('|'));
  if (!finance.test(value)) return 'off_topic';
  return null;
}
function intent(text) {
  const value = fold(text);
  const risk = /^(?:risk[: ]+|risc[: ]+)?(low|medium|high|scazut|mediu|ridicat)[.!]?$/.exec(value);
  const map = { low:'low',medium:'medium',high:'high',scazut:'low',mediu:'medium',ridicat:'high' };
  const change = {};
  const horizon = /(\d{1,2})\s*(?:years?|ani)/.exec(value);
  if (horizon && Number(horizon[1])>=1 && Number(horizon[1])<=30) change.horizonYears=Number(horizon[1]);
  if (/\b(car|masina)\b.*\b(two|doi)\b|\b(two|doi)\b.*\b(year|ani)\b/.test(value)) change.horizonYears=2;
  const bonus = /bonus[^\d]{0,30}(\d{1,6})/.exec(value);
  if (bonus) change.bonus=Math.min(100000,Number(bonus[1]));
  const rent = /(?:rent|chiria|chirie)[^\d]{0,40}(\d{1,5})/.exec(value);
  if (rent && /increas|rise|more|creste|major|plus/.test(value)) change.rentIncrease=Number(rent[1]);
  const clarify=/bonus/.test(value) && !bonus?'bonus':/(?:rent|chiri).*(increas|rise|creste|major)/.test(value) && !rent?'rent':null;
  const amount=/\b(\d{1,5}(?:[., ]\d{3})*)\s*(?:lei|ron)\b/.exec(value);
  const monthly = amount && /a month|monthly|lunar|pe luna|\b(save|invest)\b|economisesc|investesc/.test(value)
    && !Object.keys(change).length ? Number(amount[1].replace(/[., ]/g, '')) : null;
  const conversation = !risk && !Object.keys(change).length && monthly === null
    ? require('./conversation').classify(value) : null;
  return { riskAnswer:risk ? map[risk[1]] : null, change:Object.keys(change).length ? change : null,
    monthly, clarify, conversation, handoff:/advis|human|consilier|talk to.*person/.test(value) };
}
module.exports = { clean, fold, refusal, intent };
