/**
 * Antigravity History Manager — Internationalization (i18n) Engine
 * Supports RU and EN with Intl.PluralRules, Intl.DateTimeFormat, and dynamic switching.
 */

(function (window) {
  'use strict';

  let currentLang = 'ru';
  let translations = {
    ru: null,
    en: null
  };

  const listeners = [];

  // Helper for nested property lookup: getProp(obj, 'bar.export_all_btn')
  function getProp(obj, pathStr) {
    if (!obj || !pathStr) return null;
    const parts = pathStr.split('.');
    let curr = obj;
    for (const p of parts) {
      if (curr && typeof curr === 'object' && p in curr) {
        curr = curr[p];
      } else {
        return null;
      }
    }
    return curr;
  }

  // Template string interpolator: "Hello {name}" + { name: "World" }
  function interpolate(template, params = {}) {
    if (typeof template !== 'string') return '';
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      return key in params ? params[key] : `{${key}}`;
    });
  }

  const i18n = {
    async init(initialLang = 'system') {
      try {
        const [ruData, enData] = await Promise.all([
          fetch('i18n/ru.json').then(r => r.json()),
          fetch('i18n/en.json').then(r => r.json())
        ]);
        translations.ru = ruData;
        translations.en = enData;
      } catch (err) {
        console.error('Failed to load i18n dictionaries:', err);
      }

      let lang = initialLang;
      if (!lang || lang === 'system') {
        const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
        lang = navLang.startsWith('ru') ? 'ru' : 'en';
      }

      this.setLanguage(lang, false);
    },

    getLanguage() {
      return currentLang;
    },

    setLanguage(lang, notify = true) {
      const target = (lang === 'ru' || lang === 'en') ? lang : 'ru';
      currentLang = target;
      document.documentElement.lang = target;

      // Update static DOM elements marked with data-i18n
      this.translateDom();

      if (notify) {
        for (const fn of listeners) {
          try { fn(currentLang); } catch (e) { console.error(e); }
        }
      }
    },

    onChange(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },

    t(key, params = {}) {
      const dict = translations[currentLang] || translations.ru;
      const str = getProp(dict, key);
      if (typeof str === 'string') {
        return interpolate(str, params);
      }
      // Fallback to Russian
      const fallback = getProp(translations.ru, key);
      if (typeof fallback === 'string') {
        return interpolate(fallback, params);
      }
      return key;
    },

    plural(key, count, params = {}) {
      const dict = translations[currentLang] || translations.ru;
      const pluralObj = getProp(dict, `plural.${key}`);
      const mergedParams = { count, ...params };

      if (pluralObj && typeof pluralObj === 'object') {
        let rule = 'other';
        try {
          const pr = new Intl.PluralRules(currentLang);
          rule = pr.select(count);
        } catch {
          rule = (count === 1) ? 'one' : 'other';
        }

        const template = pluralObj[rule] || pluralObj.other || pluralObj.many || pluralObj.few || pluralObj.one;
        if (typeof template === 'string') {
          return interpolate(template, mergedParams);
        }
      }

      return `${count}`;
    },

    formatDate(rawDate) {
      if (!rawDate) return '—';
      try {
        const clean = String(rawDate).trim().replace(' ', 'T');
        const d = new Date(clean);
        if (isNaN(d.getTime())) return String(rawDate).slice(0, 16);

        const formatter = new Intl.DateTimeFormat(currentLang, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });
        return formatter.format(d);
      } catch {
        return String(rawDate).slice(0, 16);
      }
    },

    formatNumber(num) {
      if (typeof num !== 'number') return String(num);
      try {
        return new Intl.NumberFormat(currentLang).format(num);
      } catch {
        return String(num);
      }
    },

    translateDom() {
      // 1. Text content
      const elements = document.querySelectorAll('[data-i18n]');
      elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
          el.textContent = this.t(key);
        }
      });

      // 2. Title attributes
      const titled = document.querySelectorAll('[data-i18n-title]');
      titled.forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) {
          el.setAttribute('title', this.t(key));
        }
      });

      // 3. Placeholder attributes
      const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
      placeholders.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
          el.setAttribute('placeholder', this.t(key));
        }
      });
    }
  };

  window.i18n = i18n;
  window.t = (k, p) => i18n.t(k, p);
  window.plural = (k, c, p) => i18n.plural(k, c, p);
})(window);
