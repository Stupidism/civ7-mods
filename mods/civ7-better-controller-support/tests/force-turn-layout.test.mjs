// Detached browser geometry only; never connects to the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const ready = !!process.env.CIV7_PLAYWRIGHT_MODULE;
test('force-turn hint keeps its text inside a readable horizontal card on one line in both languages', { skip: !ready }, async () => {
  const { chromium } = createRequire(import.meta.url)(process.env.CIV7_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, ...(process.env.CIV7_CHROMIUM_PATH ? { executablePath: process.env.CIV7_CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const entry = readFileSync(new URL('../ui/force-turn.js', import.meta.url), 'utf8');
    const style = entry.match(/indicator\.style\.cssText = '([^']+)'/)[1];
    const hints = readFileSync(new URL('../ui/instruction-hints.js', import.meta.url), 'utf8')
      .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    const xml = readFileSync(new URL('../text/map-tools.xml', import.meta.url), 'utf8');
    const texts = [...xml.matchAll(/<Row Tag="LOC_MTG_FORCE_TURN_(?:RELEASE|HOLD)"[^>]*>\s*<Text>(.*?)<\/Text>/gs)].map(m => m[1]);
    assert.equal(texts.length, 4);
    for (const width of [720, 1920]) for (const [language, text] of texts.entries()) {
      await page.setViewportSize({ width, height: 720 });
      await page.setContent('<style>body{margin:0;background:#1d2b39;font:22px Arial,sans-serif}fxs-nav-help{display:block;width:36px;height:36px;border:1px solid #bca472;border-radius:50%}.fonticon{display:inline-block;width:22px;min-width:22px;height:22px;vertical-align:middle}</style>');
      await page.evaluate(({ style, hints, text }) => {
        window.Locale = { compose: () => text, stylize: () => text.replace(/\[icon:[^\]]+\]/g, '<span class="fonticon">◉</span>') };
        const card = document.createElement('div'); card.id = 'force-turn-hint'; card.style.cssText = style;
        const label = document.createElement('div'); card.append(label); document.body.append(card);
        Function(hints + '\nsetInstruction(arguments[0], "release", "shell-action-5", { singleLine: true });')(label);
      }, { style, hints, text });
      const sizes = await page.evaluate(() => {
        const card = document.querySelector('#force-turn-hint');
        const text = card.firstElementChild.lastElementChild;
        const a = card.getBoundingClientRect(), b = text.getBoundingClientRect();
        return { cardWidth: a.width, cardHeight: a.height, textWidth: b.width, textHeight: b.height, whiteSpace:getComputedStyle(text).whiteSpace,
          inside: b.right <= a.right + 1 && b.bottom <= a.bottom + 1 };
      });
      if (process.env.CIV7_FORCE_TURN_PREVIEW_DIR) await page.screenshot({ path: `${process.env.CIV7_FORCE_TURN_PREVIEW_DIR}/hint-${width}-${language}.png` });
      assert.ok(sizes.textWidth >= 220 && sizes.cardWidth <= width * 0.8 + 1, JSON.stringify(sizes));
      assert.ok(sizes.textHeight <= 36 && sizes.whiteSpace === 'nowrap' && sizes.inside, JSON.stringify(sizes));
    }
  } finally { await browser.close(); }
});
