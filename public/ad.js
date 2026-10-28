'use strict';
const t = (key, values) => I18n.t(key, values);
function drawAds() {
const ADS = [
  { src: 'instagram', cmp: 'cash-loses', name: 'Instagram', style: '', head: t("adHead1"), sub: t("adSub1"), cta: t("adCta1") },
  { src: 'facebook', cmp: 'first-invest', name: 'Facebook', style: 'y', head: t("adHead2"), sub: t("adSub2"), cta: t("adCta2") },
  { src: 'tiktok', cmp: 'worries', name: 'TikTok', style: '', head: t("adHead3"), sub: t("adSub3"), cta: t("adCta3") },
];
const root = document.getElementById('ads');
root.replaceChildren();
for (const a of ADS) {
  const card = document.createElement('article');
  card.className = 'ad';
  const who = document.createElement('div'); who.className = 'who';
  const logo = document.createElement('span'); logo.className = 'logo'; logo.textContent = 'R';
  const nm = document.createElement('div'); nm.textContent = t("bankName");
  const sp = document.createElement('small'); sp.textContent = t("sponsored",{channel:a.name}); nm.append(sp);
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

}
I18n.init().then(() => { document.querySelector("header nav").append(I18n.selector(drawAds)); drawAds(); });
