const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    'C:/Users/24656/AppData/Local/Temp/haru-ui-tests/node_modules/playwright-core'
);
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('disclaimer_agreed_timestamp', String(Date.now()));
    localStorage.setItem('haru-liquid-mode', 'true');
    localStorage.removeItem('music-full-config');
  });
  await page.goto(process.env.UI_TEST_URL || 'http://127.0.0.1:5191/');
  await page.getByRole('button', { name: '切换经典模式' }).waitFor();
  await page.evaluate(async () => {
    const { usePlayerStore } = await import('/store/modules/player.ts');
    const hooks = await import('/hooks/MusicHook.ts');
    const store = usePlayerStore();
    if (!hooks.playMusic) hooks.initMusicHook(store);
    store.setPlayMusic({
      id: 990,
      name: '悬浮播放栏测试',
      picUrl: '',
      ar: [{ id: 1, name: '测试艺人' }],
      al: { id: 1, name: '测试专辑' }
    });
    store.setPlayList([store.playMusic]);
  });

  const player = page.locator('.music-play-bar');
  await player.waitFor({ state: 'visible' });
  const desktop = await player.evaluate((element) => ({
    position: getComputedStyle(element).position,
    rect: element.getBoundingClientRect().toJSON()
  }));
  assert.equal(desktop.position, 'fixed');
  assert(Math.abs((desktop.rect.left + desktop.rect.right) / 2 - 850) < 3);

  await page.setViewportSize({ width: 900, height: 700 });
  const compact = await player.boundingBox();
  assert(compact.x >= 260 && compact.x + compact.width <= 900);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  fs.mkdirSync('artifacts/ui-audit', { recursive: true });
  await page.screenshot({ path: 'artifacts/ui-audit/compact-floating-player.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: fixed floating player stays centered and inside the content column at compact widths'
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
