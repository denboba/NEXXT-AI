'use strict';
// Versioned, cited rule cards for the Romanian/EU retail-banking context of this demo.
// Statements are deliberately conservative summaries for an informational coach. They are
// NOT legal or tax advice and every card must be verified by bank compliance before launch.
const { PRODUCTS, RISK_CAP } = require('../products');

const VERSION = '2026-02-28.1';
const AS_OF = '2026-02-28';
const DEPOSITS = ['term-deposit', 'buffer-savings', 'business-deposit-ladder', 'business-liquid-reserve'];
const FUNDS = ['diversified-fund', 'bond-fund'];
const INVESTMENTS = ['diversified-fund', 'bond-fund', 'stocks-etfs', 'voluntary-pension'];
const TOPICS = ['deposit_protection', 'early_withdrawal', 'appropriateness', 'pension_deduction', 'tax_scope',
  'buffer_policy', 'segment'];

const byProduct = field => Object.fromEntries(PRODUCTS.map(product => [product.id, product[field]]));

const DEFINITIONS = [
  { id: 'fgdb-deposit-cover', topic: 'deposit_protection', appliesTo: DEPOSITS,
    title: 'Bank deposits are covered by the deposit guarantee scheme',
    statement: 'Eligible bank deposits, including term deposits and savings accounts, are covered by FGDB up to the '
      + 'lei equivalent of 100,000 EUR per depositor per bank. All deposits of one depositor at the same bank are '
      + 'added together for this limit.',
    constraint: { scheme: 'FGDB', coverageEur: 100000, basis: 'per depositor per bank', fgdbCovered: true },
    exception: 'Some depositors are excluded (for example other banks, investment firms and public authorities). '
      + 'Temporary high balances from specific life events can have extra cover for a limited time.',
    source: 'Fondul de Garantare a Depozitelor Bancare (FGDB); Law 311/2015; EU Directive 2014/49/EU',
    ro: { title: 'Depozitele bancare sunt acoperite de schema de garantare a depozitelor',
      statement: 'Depozitele bancare eligibile, inclusiv depozitele la termen și conturile de economii, sunt acoperite '
        + 'de FGDB până la echivalentul în lei a 100.000 EUR per deponent, per bancă. Toate depozitele unui deponent '
        + 'la aceeași bancă se adună pentru această limită.',
      exception: 'Unii deponenți sunt excluși (de exemplu alte bănci, firme de investiții și autorități publice). '
        + 'Soldurile temporar ridicate din anumite evenimente de viață pot avea acoperire suplimentară limitată în timp.' } },
  { id: 'not-a-deposit', topic: 'deposit_protection', appliesTo: INVESTMENTS,
    title: 'Investment products are not deposits',
    statement: 'Fund units, voluntary pension assets, stocks and ETFs are not bank deposits. FGDB does not cover them '
      + 'and their market value can fall below what was paid in.',
    constraint: { fgdbCovered: false, marketValueCanFall: true },
    exception: 'Cash that is not yet invested and stays in a current or savings account remains a deposit.',
    source: 'Law 311/2015 (definition of deposits); EU Directive 2014/49/EU',
    ro: { title: 'Produsele de investiții nu sunt depozite',
      statement: 'Unitățile de fond, activele de pensie facultativă, acțiunile și ETF-urile nu sunt depozite bancare. '
        + 'FGDB nu le acoperă, iar valoarea lor de piață poate scădea sub suma plătită.',
      exception: 'Numerarul neinvestit care rămâne într-un cont curent sau de economii rămâne depozit.' } },
  { id: 'depositary-segregation', topic: 'deposit_protection', appliesTo: [...FUNDS, 'voluntary-pension'],
    title: 'Fund assets are held separately by a depositary',
    statement: 'The assets of a fund are kept by an independent depositary, separate from the asset manager\'s own '
      + 'assets, so they are not used to pay the manager\'s debts.',
    constraint: { segregatedAssets: true },
    exception: 'Segregation protects ownership of the assets, not their market value.',
    source: 'EU UCITS Directive 2009/65/EC; Law 204/2006 for voluntary pensions; ASF supervision',
    ro: { title: 'Activele fondului sunt păstrate separat de un depozitar',
      statement: 'Activele unui fond sunt păstrate de un depozitar independent, separat de activele proprii ale '
        + 'administratorului, deci nu sunt folosite pentru datoriile acestuia.',
      exception: 'Separarea protejează dreptul de proprietate asupra activelor, nu valoarea lor de piață.' } },
  { id: 'investor-compensation', topic: 'deposit_protection', appliesTo: [...FUNDS, 'stocks-etfs'],
    title: 'Investor compensation is limited and never covers market losses',
    statement: 'If an investment firm fails and cannot return client assets, the investor compensation fund may pay '
      + 'up to 20,000 EUR per investor. It does not cover losses from market movements.',
    constraint: { scheme: 'FCI', compensationEur: 20000, coversMarketLosses: false },
    exception: 'Whether it applies depends on how and with which firm the units or securities are held.',
    source: 'Fondul de Compensare a Investitorilor (FCI); EU Directive 97/9/EC',
    ro: { title: 'Compensarea investitorilor este limitată și nu acoperă pierderile din piață',
      statement: 'Dacă o firmă de investiții intră în incapacitate și nu poate returna activele clienților, fondul '
        + 'de compensare a investitorilor poate plăti până la 20.000 EUR per investitor. Nu acoperă pierderile din '
        + 'evoluția pieței.',
      exception: 'Aplicarea depinde de modul în care și de firma la care sunt deținute unitățile sau titlurile.' } },
  { id: 'pension-rights-guarantee', topic: 'deposit_protection', appliesTo: ['voluntary-pension'],
    title: 'Private pension rights have a separate guarantee fund',
    statement: 'Private pension rights are protected by a separate scheme with its own conditions. It is not the '
      + 'deposit scheme and it does not protect against market losses.',
    constraint: { scheme: 'FGDSPP', coversMarketLosses: false },
    exception: 'Cover applies only in the situations defined by the scheme rules.',
    source: 'Fondul de Garantare a Drepturilor din Sistemul de Pensii Private (FGDSPP); Law 187/2011; ASF',
    ro: { title: 'Drepturile de pensie privată au un fond separat',
      statement: 'Drepturile de pensie privată sunt protejate de o schemă separată, cu propriile condiții. Nu este '
        + 'schema depozitelor și nu protejează împotriva pierderilor din piață.',
      exception: 'Acoperirea se aplică doar în situațiile definite de regulile schemei.' } },
  { id: 'term-lock', topic: 'early_withdrawal', appliesTo: ['term-deposit', 'business-deposit-ladder'],
    title: 'Term deposits are locked for the agreed term',
    statement: 'Money in a term deposit stays locked until maturity. In this demo, breaking it early forfeits the '
      + 'accrued interest.',
    constraint: { liquidity: 'locked', earlyBreak: 'accrued interest forfeited (demo)' },
    exception: 'The actual early-termination terms are set in the signed product contract.',
    source: 'Demo product terms (src/products.js); final terms in the bank deposit contract',
    ro: { title: 'Depozitele la termen sunt blocate pe perioada convenită',
      statement: 'Banii dintr-un depozit la termen rămân blocați până la scadență. În acest demo, lichidarea '
        + 'anticipată pierde dobânda acumulată.',
      exception: 'Condițiile reale de lichidare anticipată sunt cele din contractul semnat.' } },
  { id: 'redemption-settlement', topic: 'early_withdrawal', appliesTo: [...FUNDS, 'stocks-etfs'],
    title: 'Selling units or securities takes days to settle',
    statement: 'Fund units and securities can be sold at any time, but the money arrives only after settlement, at '
      + 'the market value of that day.',
    constraint: { settlementDays: Object.fromEntries([...FUNDS, 'stocks-etfs']
      .map(id => [id, byProduct('settlementDays')[id]])) },
    exception: 'Settlement can be longer around holidays or in stressed markets.',
    source: 'Demo product terms (src/products.js); fund prospectus',
    ro: { title: 'Vânzarea unităților sau a titlurilor se decontează în câteva zile',
      statement: 'Unitățile de fond și titlurile pot fi vândute oricând, dar banii ajung doar după decontare, la '
        + 'valoarea de piață din ziua respectivă.',
      exception: 'Decontarea poate dura mai mult în perioadele de sărbători sau pe piețe tensionate.' } },
  { id: 'pension-withdrawal', topic: 'early_withdrawal', appliesTo: ['voluntary-pension'],
    title: 'Voluntary pension money is long term',
    statement: 'Voluntary pension assets are generally paid out from age 60, after at least 90 monthly contributions.',
    constraint: { liquidity: 'locked', minAge: 60, minContributions: 90 },
    exception: 'Earlier payment is possible in specific cases such as disability; check the scheme rules.',
    source: 'Law 204/2006 on voluntary pensions; ASF',
    ro: { title: 'Banii din pensia facultativă sunt pe termen lung',
      statement: 'Activele de pensie facultativă se plătesc în general de la 60 de ani, după cel puțin 90 de '
        + 'contribuții lunare.',
      exception: 'Plata mai devreme este posibilă în cazuri specifice, cum ar fi invaliditatea; verifică regulile schemei.' } },
  { id: 'instant-access', topic: 'early_withdrawal', appliesTo: ['buffer-savings', 'business-liquid-reserve'],
    title: 'Buffer accounts keep instant access',
    statement: 'Buffer savings and the business liquid reserve can be used at any time, which is why they hold '
      + 'emergency money and payroll.',
    constraint: { liquidity: 'instant' },
    exception: 'Daily transfer limits of the account still apply.',
    source: 'Demo product terms (src/products.js)',
    ro: { title: 'Conturile de rezervă păstrează accesul imediat',
      statement: 'Economiile flexibile și rezerva lichidă a firmei pot fi folosite oricând, de aceea păstrează '
        + 'banii de urgență și salariile.',
      exception: 'Limitele zilnice de transfer ale contului se aplică în continuare.' } },
  { id: 'mifid-assessment', topic: 'appropriateness', appliesTo: [...FUNDS, 'stocks-etfs'],
    title: 'Investment products need an appropriateness or suitability assessment',
    statement: 'Before selling or recommending an investment product, the bank must assess the customer\'s knowledge '
      + 'and experience, and for advice also the financial situation and objectives.',
    constraint: { assessment: 'appropriateness or suitability before sale' },
    exception: 'This demo asks one explicit risk question. It must be replaced by the bank\'s regulated questionnaire.',
    source: 'MiFID II, EU Directive 2014/65/EU, Article 25; Law 126/2018; ASF',
    ro: { title: 'Produsele de investiții cer o evaluare a adecvării sau a potrivirii',
      statement: 'Înainte de a vinde sau recomanda un produs de investiții, banca trebuie să evalueze cunoștințele și '
        + 'experiența clientului, iar pentru consultanță și situația financiară și obiectivele.',
      exception: 'Acest demo pune o singură întrebare explicită despre risc. Trebuie înlocuită cu chestionarul '
        + 'reglementat al băncii.' } },
  { id: 'demo-risk-cap', topic: 'appropriateness', appliesTo: ['all'],
    title: 'Your risk answer caps the products offered',
    statement: 'The coach only offers products whose risk level is within the cap for the risk answer you gave.',
    constraint: { riskCap: { ...RISK_CAP } },
    exception: 'The cap mapping is a bank-internal demo policy, not a regulation.',
    source: 'Bank-internal demo policy (RISK_CAP in src/products.js)',
    ro: { title: 'Răspunsul tău despre risc limitează produsele oferite',
      statement: 'Coach-ul oferă doar produse al căror nivel de risc se încadrează în limita pentru răspunsul tău.',
      exception: 'Corespondența limitelor este o politică internă demonstrativă, nu o reglementare.' } },
  { id: 'horizon-fit', topic: 'appropriateness', appliesTo: ['all'],
    title: 'The product horizon must fit your goal',
    statement: 'A product is only offered when your goal horizon is at least the product\'s minimum horizon.',
    constraint: { minHorizonYears: byProduct('minHorizonYears') },
    exception: 'Changing the goal horizon re-runs the comparison and replaces any proposal.',
    source: 'Bank-internal demo policy (src/products.js); MiFID II suitability objectives',
    ro: { title: 'Orizontul produsului trebuie să se potrivească obiectivului',
      statement: 'Un produs este oferit doar dacă orizontul obiectivului tău este cel puțin orizontul minim al produsului.',
      exception: 'Schimbarea orizontului reface comparația și înlocuiește orice propunere.' } },
  { id: 'pillar3-deduction', topic: 'pension_deduction', appliesTo: ['voluntary-pension'],
    title: 'Voluntary pension contributions are tax-deductible within a cap',
    statement: 'Contributions to a Pillar III voluntary pension are deductible from taxable income up to the lei '
      + 'equivalent of 400 EUR per year per participant.',
    constraint: { deductibleEurPerYear: 400, basis: 'per participant per year' },
    exception: 'The demo does not compute your personal tax. Employer-paid contributions follow separate rules.',
    source: 'Romanian Fiscal Code (Law 227/2015); Law 204/2006 on voluntary pensions',
    ro: { title: 'Contribuțiile la pensia facultativă sunt deductibile în limita unui plafon',
      statement: 'Contribuțiile la pensia facultativă (Pilonul III) sunt deductibile din venitul impozabil până la '
        + 'echivalentul în lei a 400 EUR pe an, per participant.',
      exception: 'Demo-ul nu calculează impozitul tău personal. Contribuțiile plătite de angajator au reguli separate.' } },
  { id: 'no-tax-advice', topic: 'tax_scope', appliesTo: ['all'],
    title: 'The coach does not give tax advice',
    statement: 'The coach protects known tax obligations as non-investable cash but does not give tax or legal advice.',
    constraint: { taxAdvice: false },
    exception: 'For personal tax questions, the coach offers an adviser or a tax professional.',
    source: 'Bank policy for digital guidance (demo)',
    ro: { title: 'Coach-ul nu oferă consultanță fiscală',
      statement: 'Coach-ul protejează obligațiile fiscale cunoscute ca bani neinvestibili, dar nu oferă consultanță '
        + 'fiscală sau juridică.',
      exception: 'Pentru întrebări fiscale personale, coach-ul oferă un consultant sau un specialist fiscal.' } },
  { id: 'pfa-single-declaration', topic: 'tax_scope', appliesTo: ['all'],
    title: 'Freelancer taxes are settled through the annual single declaration',
    statement: 'A freelancer (PFA) pays income tax and social contributions through the annual single declaration, '
      + 'so the reserve for it is protected and never treated as investable.',
    constraint: { incomePattern: 'irregular', declaration: 'Declarația unică' },
    exception: 'Amounts depend on income, tax regime and thresholds; an accountant or adviser must confirm them.',
    source: 'Romanian Fiscal Code (Law 227/2015); ANAF Declarația unică',
    ro: { title: 'Taxele PFA se plătesc prin declarația unică anuală',
      statement: 'Un PFA plătește impozitul pe venit și contribuțiile sociale prin declarația unică anuală, de aceea '
        + 'rezerva pentru ele este protejată și nu este tratată ca bani investibili.',
      exception: 'Sumele depind de venit, regimul fiscal și plafoane; un contabil sau consultant trebuie să le confirme.' } },
  { id: 'buffer-months', topic: 'buffer_policy', appliesTo: ['all'],
    title: 'An emergency buffer comes before investing',
    statement: 'Essential spending is reserved before any investment: 3 months for salaried customers and '
      + 'businesses, 6 months for irregular income and 1 month for part-time income.',
    constraint: { salaried: 3, business: 3, irregular: 6, partTime: 1 },
    exception: 'This is a bank-internal demo policy, not a regulation.',
    source: 'Bank-internal demo policy (capacity() in src/tools/finance.js)',
    ro: { title: 'Rezerva de urgență vine înaintea investițiilor',
      statement: 'Cheltuielile esențiale sunt rezervate înaintea oricărei investiții: 3 luni pentru salariați și '
        + 'firme, 6 luni pentru venituri neregulate și 1 lună pentru venituri part-time.',
      exception: 'Aceasta este o politică internă demonstrativă, nu o reglementare.' } },
  { id: 'obligations-protected', topic: 'buffer_policy', appliesTo: ['all'],
    title: 'Obligations and payroll are never investable',
    statement: 'Known obligations such as taxes and payroll are subtracted from available cash before the coach '
      + 'computes a safe monthly amount.',
    constraint: { investable: false },
    exception: 'This is a bank-internal demo policy, not a regulation.',
    source: 'Bank-internal demo policy (capacity() in src/tools/finance.js)',
    ro: { title: 'Obligațiile și salariile nu sunt investibile',
      statement: 'Obligațiile cunoscute, precum taxele și salariile, sunt scăzute din numerarul disponibil înainte '
        + 'de calculul sumei lunare prudente.',
      exception: 'Aceasta este o politică internă demonstrativă, nu o reglementare.' } },
  { id: 'segment-match', topic: 'segment', appliesTo: ['all'],
    title: 'Products are offered only to their customer segment',
    statement: 'Business products are offered only to business customers and individual products only to '
      + 'individuals.',
    constraint: { segments: byProduct('segment') },
    exception: 'A business owner can hold individual products in a separate personal relationship.',
    source: 'Bank-internal product governance (demo)',
    ro: { title: 'Produsele sunt oferite doar segmentului lor',
      statement: 'Produsele pentru firme sunt oferite doar clienților persoane juridice, iar cele individuale doar '
        + 'persoanelor fizice.',
      exception: 'Proprietarul unei firme poate deține produse individuale într-o relație personală separată.' } },
];

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const RULES = freeze(DEFINITIONS.map(rule => ({ ...rule, verifyWith: 'bank compliance', asOf: AS_OF,
  illustrative: true })));

const applies = (rule, productId) => !productId || rule.appliesTo.includes('all') || rule.appliesTo.includes(productId);
function byTopic(topic, productId) {
  return RULES.filter(rule => rule.topic === topic && applies(rule, productId));
}
function localize(rule, language) {
  const { ro, ...base } = rule;
  return language === 'ro' ? { ...base, ...ro } : base;
}
function protectionOf(productId) {
  return DEPOSITS.includes(productId) ? 'deposit_guarantee' : 'not_deposit';
}
const DISCLAIMER = {
  en: 'Informational summary of rules as of ' + AS_OF + ', not legal or tax advice. To be verified by bank compliance.',
  ro: 'Rezumat informativ al regulilor la ' + AS_OF + ', nu consultanță juridică sau fiscală. De verificat de '
    + 'departamentul de conformitate al băncii.',
};

module.exports = { RULES, TOPICS, VERSION, AS_OF, DISCLAIMER, byTopic, localize, protectionOf };
