'use strict';
window.I18n = (() => {
  let language = 'en', catalog = {};
  const normalize = value => String(value || '').toLowerCase().split(/[-_;,]/)[0] === 'ro' ? 'ro' : 'en';
  const t = (key, values = {}) => (catalog[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '{' + name + '}'));
  async function load(value) {
    const selected = normalize(value);
    const response = await fetch('/i18n/' + selected + '.json');
    if (!response.ok) throw new Error('Could not load language catalog');
    catalog = await response.json();
    language = selected;
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  }
  async function init() {
    let selected;
    try { selected = localStorage.getItem('language'); } catch {}
    await load(selected || navigator.language || 'en');
  }
  function selector(onchange) {
    const select = document.createElement('select');
    select.className = 'language'; select.setAttribute('aria-label', t('language'));
    for (const [value, label] of [['en', 'English'], ['ro', 'Română']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
    }
    select.value = language;
    select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        await load(select.value);
        try { localStorage.setItem('language', language); } catch {}
        await onchange?.(language);
      } catch (error) {
        select.value = language;
        console.error(error.message);
      } finally { select.disabled = false; }
    });
    return select;
  }
  return { init, selector, t, get language() { return language; }, get locale() { return language === 'ro' ? 'ro-RO' : 'en-US'; } };
})();
