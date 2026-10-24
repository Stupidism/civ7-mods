import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const xml = readFileSync(new URL('../text/settings.xml', import.meta.url), 'utf8');
const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const catalogs = Object.fromEntries(['EnglishText', 'LocalizedText'].map(section => {
  const body = xml.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`))[1];
  const entries = [...body.matchAll(/<Row Tag="([^"]+)"[^>]*><Text>([\s\S]*?)<\/Text><\/Row>/g)];
  assert.equal(new Set(entries.map(row => row[1])).size, entries.length, 'duplicate localization key');
  return [section === 'EnglishText' ? 'en_US' : 'zh_Hans_CN', Object.fromEntries(entries.map(row => [row[1], decode(row[2])]))];
}));

// Models the native Locale resolver with English fallback for other languages.
export function useGameLanguage(language = 'zh_Hans_CN') {
  globalThis.Locale = { compose(key, ...args) {
    const text = catalogs[language]?.[key] ?? catalogs.en_US[key];
    assert.equal(typeof text, 'string', `missing translation ${key}`);
    return text.replace(/\{(\d+)\}/g, (_, number) => {
      assert.ok(Number(number) <= args.length, `missing argument ${number} for ${key}`);
      return args[Number(number) - 1];
    });
  } };
}
