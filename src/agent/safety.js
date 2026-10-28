'use strict';
const clean = text => String(text || '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim();
const fold = text => clean(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function refusal(text, customer) {
  const value = fold(text);
  if (/ignore.*(instruction|rule|previous)|system prompt|reveal.*(secret|token|key)|override|jailbreak|ignora.*(instruct|regul)|act as.*(system|admin)|execute.*(shell|command)|<\/?system>|\[inst\]/.test(value)) return 'injection';
  const otherNames = ['ioana','andrei','mihai','elena'].filter(name => name !== customer?.firstName?.toLowerCase());
  if (/other (customer|client|person|user)|another (customer|client|person|user)|all (customer|client)|altui client|alti clienti|altor clienti|customer[_ -]?id|user[_ -]?id/.test(value) || otherNames.some(name => new RegExp('\\b' + name + '\\b').test(value))) return 'cross_customer';
  if (/guarantee|guaranteed|garant(eaza|at|ezi)|fara risc/.test(value)) return 'guarantee';
  if (/emergency fund|emergency buffer|fondul de urgenta|banii de urgenta|everything.*(stock|invest)|tot(i|i banii|ul).*(actiuni|invest)/.test(value)) return 'protected_money';
  if (/\b(fuck|shit|idiot|stupid|prost|tampit)\b/.test(value)) return 'abuse';
  if (/weather|football|politic|president|recipe|write.*(code|poem)|tell.*joke|vremea|fotbal|reteta|poezie|napoleon/.test(value)) return 'off_topic';
  if (!/invest|sav(e|ing)|spare|cash|money|budget|start|begin|compare|product|plan|risk|low|medium|high|bonus|rent|car|year|fee|tax|payroll|buffer|salary|income|spend|subscription|deposit|fund|pension|stock|advis|human|person|withdraw|confirm|yes|help|bani|econom|incep|risc|scazut|mediu|ridicat|chiri|masin|ani|depozit|doband|salari|fond|pens|cheltu|abonament|compar|consilier|ajutor|lichid|doi|bonjour|salut/.test(value)) return 'off_topic';
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
  return { riskAnswer:risk ? map[risk[1]] : null, change:Object.keys(change).length ? change : null, handoff:/advis|human|consilier|talk to.*person/.test(value) };
}
module.exports = { clean, fold, refusal, intent };
