import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';
import { catalogs } from './locale-fixture.js';

const game = process.env.CIV7_GAME_DIR;
const playwrightPath = process.env.CIV7_PLAYWRIGHT_MODULE;
const chromiumPath = process.env.CIV7_CHROMIUM_PATH;
const ready = game && playwrightPath && chromiumPath;

test('rendered break text uses the native language-specific font stack, including Chinese glyphs', { skip: !ready }, async () => {
  const { chromium } = createRequire(import.meta.url)(playwrightPath);
  const core = join(game, 'Base/modules/core');
  const scaling = readFileSync(join(core, 'ui/themes/default/global-scaling.js'), 'utf8').split('const GlobalScaling = new GlobalScalingImpl();')[0];
  const css = readFileSync(new URL('../ui/rest-guard.css', import.meta.url), 'utf8');
  const script = ['defaults', 'rest-model', 'rest-session', 'rest-view'].map(name =>
    readFileSync(new URL(`../ui/${name}.js`, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  try {
    const page = await browser.newPage();
    const fontPath = join(core, 'fonts/NotoSansSC-Regular.ttf');
    assert.ok(existsSync(fontPath));
    const font = `@font-face {font-family:BodyFont-SC;src:url(data:font/ttf;base64,${readFileSync(fontPath).toString('base64')})}`;
    for (const language of ['zh_Hans_CN', 'en_US']) {
      const nativeCss = vm.runInNewContext(scaling + '\nGlobalScalingImpl.prototype.generateFontSizeRules.call({fontScales:new Map([[1,18]]),fontScale:1,getFontSizeInScreenPixels:()=>12},[]).join("\\n")',
        { Locale: { getCurrentDisplayLocale: () => language } });
      await page.setContent(`<style>${font}\n${nativeCss}\n${css}</style><div class="font-body" id="native-reference"></div>`);
      await page.evaluate(({ script, catalog }) => {
        window.Locale = { compose: (key, ...args) => catalog[key].replace(/\{(\d+)\}/g, (_, i) => args[Number(i)-1]) };
        (0, eval)(script + '\nwindow.restView = new RestView({resume(){},quit(){}});');
      }, { script, catalog: catalogs[language] });
      for (const mode of ['idle', 'rest', 'night']) {
        const fonts = await page.evaluate(async mode => {
          const view = window.restView;
          if (mode === 'idle') view.showIdleRest();
          if (mode === 'rest') view.showRest({ reason: 'time', durationMs: 300000 });
          if (mode === 'night') view.showNight({ startedAt: 0, endsAt: 3600000 }, { nightStart: 1320, nightEnd: 420 }, 0);
          view.updateSaveStatus({ status: 'saved' });
          await document.fonts.ready;
          return { expected: getComputedStyle(document.querySelector('#native-reference')).fontFamily,
            nodes: [...document.querySelectorAll('.c7r-subtitle,.c7r-tip,.c7r-footnote')].map(node => ({ text: node.textContent, font: getComputedStyle(node).fontFamily })) };
        }, mode);
        for (const node of fonts.nodes) assert.equal(node.font, fonts.expected, `${language} ${mode}: ${node.text}`);
        if (language === 'zh_Hans_CN') {
          const client = await page.context().newCDPSession(page);
          await client.send('DOM.enable'); await client.send('CSS.enable');
          const { root } = await client.send('DOM.getDocument');
          const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.c7r-subtitle' });
          const { fonts: used } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
          assert.ok(used.some(font => font.isCustomFont && /Noto.*Sans.*SC/i.test(font.familyName) && font.glyphCount > 0), JSON.stringify(used));
          await client.detach();
        }
      }
    }
  } finally { await browser.close(); }
});
