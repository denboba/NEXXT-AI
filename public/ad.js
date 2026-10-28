'use strict';
const ADS = [
  { src: 'instagram', cmp: 'cash-loses', name: 'Instagram', style: '', head: 'Your cash loses 5–6% a year.', sub: 'See what 300 lei/month could become.', cta: 'See your numbers' },
  { src: 'facebook', cmp: 'first-invest', name: 'Facebook', style: 'y', head: 'Your first investment in 2 minutes.', sub: 'No jargon. Start from 100 lei a month.', cta: 'Try the simulation' },
  { src: 'tiktok', cmp: 'worries', name: 'TikTok', style: '', head: 'Scared of losing money?', sub: 'Ask the coach anything. Plain answers, no brochure.', cta: 'Ask the coach' },
];
const root = document.getElementById('ads');
for (const a of ADS) {
  const card = document.createElement('article');
  card.className = 'ad';
  const who = document.createElement('div'); who.className = 'who';
  const logo = document.createElement('span'); logo.className = 'logo'; logo.textContent = 'R';
  const nm = document.createElement('div'); nm.textContent = 'Raiffeisen Bank';
  const sp = document.createElement('small'); sp.textContent = `Sponsored · ${a.name}`; nm.append(sp);
  who.append(logo, nm);
  const art = document.createElement('div'); art.className = `art ${a.style}`;
  const b = document.createElement('b'); b.textContent = a.head;
  const s = document.createElement('span'); s.textContent = a.sub;
  art.append(b, s);
  const cta = document.createElement('div'); cta.className = 'cta';
  const ch = document.createElement('span'); ch.className = 'chan'; ch.textContent = `${a.src} / ${a.cmp}`;
  const link = document.createElement('a'); link.className = 'btn'; link.textContent = a.cta + ' →';
  link.href = `/?src=${encodeURIComponent(a.src)}&cmp=${encodeURIComponent(a.cmp)}`;
  link.target = '_blank'; link.rel = 'noopener';
  cta.append(ch, link);
  card.append(who, art, cta);
  root.append(card);
}
