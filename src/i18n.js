'use strict';
const catalogs = { en: require('./i18n/en.json'), ro: require('./i18n/ro.json') };
function language(value) { return /^ro(?:[-_;,]|$)/i.test(String(value || '')) ? 'ro' : 'en'; }
function t(locale, key, values = {}) {
  const catalog = catalogs[language(locale)];
  return (catalog[key] || catalogs.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '{' + name + '}'));
}
module.exports = { language, t };
