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
    const ipcRenderer = {
      send: () => {},
      sendSync: (channel) => channel === 'get-platform' ? 'win32' : {},
      invoke: async () => null,
      on: () => () => {},
      removeAllListeners: () => {}
    };
    window.electron = { ipcRenderer };
    window.api = new Proxy({}, {
      get: (_target, name) => String(name).startsWith('on')
        ? () => () => {}
        : () => Promise.resolve(name === 'invoke' ? [] : false)
    });
    localStorage.setItem('disclaimer_agreed_timestamp', String(Date.now()));
    localStorage.setItem('haru-liquid-mode', 'true');
    localStorage.removeItem('music-full-config');
  });
  await page.goto(process.env.UI_TEST_URL || 'http://127.0.0.1:5191/');
  await page.getByRole('button', { name: '关闭 Liquid Glass' }).waitFor();
  await page.evaluate(async () => {
    const { usePlayerStore } = await import('/store/modules/player.ts');
    const h = await import('/hooks/MusicHook.ts');
    const store = usePlayerStore();
    if (!h.playMusic) h.initMusicHook(store);
    store.setPlayMusic({
      id: 901,
      name: '交互验证曲目',
      picUrl:
        'data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#e83c51"/></svg>'
        ),
      ar: [{ id: 1, name: '测试艺人' }],
      al: { id: 1, name: '测试专辑' }
    });
    store.setPlayList([store.playMusic]);
  });
  await page.locator('.music-play-bar').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const { usePlayerStore } = await import('/store/modules/player.ts');
    const h = await import('/hooks/MusicHook.ts');
    const store = usePlayerStore();
    h.lrcArray.value = [0, 1, 2, 3, 4].map((index) => ({
      text: `歌词第 ${index + 1} 行`,
      startTime: index * 10,
      trText: '翻译',
      hasWordByWord: false
    }));
    h.nowTime.value = 20;
    h.allTime.value = 180;
    h.nowIndex.value = 2;
    h.lrcTimeArray.value = [0, 10, 20, 30, 40];
    store.setMusicFull(true);
  });

  const stage = page.locator('.liquid-record-stage');
  await stage.waitFor();
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const { audioService } = await import('/services/audioService.ts');
    const { usePlayerStore } = await import('/store/modules/player.ts');
    const h = await import('/hooks/MusicHook.ts');
    h.lrcArray.value = [0, 1, 2, 3, 4].map((index) => ({ text: `歌词第 ${index + 1} 行`, startTime: index * 10, trText: '翻译', hasWordByWord: false }));
    h.lrcTimeArray.value = [0, 10, 20, 30, 40];
    window.__originalGetCurrentSound = audioService.getCurrentSound;
    window.__testSound = { currentTime: 5, duration: 50 };
    audioService.getCurrentSound = () => window.__testSound;
    usePlayerStore().play = true;
  });
  await page.waitForFunction(() => document.querySelectorAll('.liquid-lyric-line')[0]?.classList.contains('active'), null, { timeout: 5000 }).catch(async (error) => {
    console.error('Desktop lyric state:', await page.evaluate(async () => {
      const h = await import('/hooks/MusicHook.ts');
      const { usePlayerStore } = await import('/store/modules/player.ts');
      return { lines: document.querySelectorAll('.liquid-lyric-line').length, sourceLines: h.lrcArray.value.length, active: document.querySelector('.liquid-lyric-line.active')?.textContent, times: h.lrcTimeArray.value, playing: usePlayerStore().play, audioTime: window.__testSound?.currentTime };
    }));
    throw error;
  });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.liquid-lyric-line.active')).filter === 'none');
  const initialMotion = await page.evaluate(() => ({
    angle: document.querySelector('.liquid-record img').style.transform,
    flow: document.querySelector('.aurora-field').style.getPropertyValue('--flow-x'),
    activeFilter: getComputedStyle(document.querySelector('.liquid-lyric-line.active')).filter,
    glow: getComputedStyle(document.querySelector('.liquid-lyric-line.active')).textShadow,
    inactiveFilter: getComputedStyle(document.querySelectorAll('.liquid-lyric-line')[1]).filter
  }));
  await page.evaluate(async () => {
    const { usePlayerStore } = await import('/store/modules/player.ts');
    window.__testSound.currentTime = 15;
    usePlayerStore().play = true;
  });
  await page.waitForFunction(() => document.querySelectorAll('.liquid-lyric-line')[1]?.classList.contains('active'));
  const laterMotion = await page.evaluate(() => ({
    angle: document.querySelector('.liquid-record img').style.transform,
    flow: document.querySelector('.aurora-field').style.getPropertyValue('--flow-x')
  }));
  assert.notEqual(initialMotion.angle, laterMotion.angle);
  assert.notEqual(initialMotion.flow, laterMotion.flow);
  assert.match(initialMotion.inactiveFilter, /blur/);
  assert.equal(initialMotion.activeFilter, 'none');
  assert.notEqual(initialMotion.glow, 'none');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.liquid-record img').evaluate((element) => element.style.transform), laterMotion.angle);
  assert.equal(await page.locator('.aurora-field').evaluate((element) => element.style.getPropertyValue('--flow-x')), laterMotion.flow);
  await page.evaluate(async () => {
    const { usePlayerStore } = await import('/store/modules/player.ts');
    usePlayerStore().play = false;
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__testSound.currentTime = 25; });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.liquid-record img').evaluate((element) => element.style.transform), laterMotion.angle);
  await page.evaluate(async () => { const h = await import('/hooks/MusicHook.ts'); h.nowTime.value = 25; });
  await page.waitForFunction(() => document.querySelectorAll('.liquid-lyric-line')[2]?.classList.contains('active'));
  const firstRestorePlay = await page.evaluate(async () => {
    const { usePlayerStore } = await import('/store/modules/player.ts');
    const { usePlaybackControl } = await import('/hooks/usePlaybackControl.ts');
    const store = usePlayerStore();
    const originalSetPlay = store.setPlay;
    let receivedId = null;
    store.setPlay = async (song) => { receivedId = song?.id ?? null; return true; };
    const result = await usePlaybackControl().playMusicEvent();
    store.setPlay = originalSetPlay;
    return { result, receivedId };
  });
  assert.deepEqual(firstRestorePlay, { result: true, receivedId: 901 });
  await page.evaluate(async () => {
    const { audioService } = await import('/services/audioService.ts');
    const { usePlayerStore } = await import('/store/modules/player.ts');
    usePlayerStore().play = false;
    audioService.getCurrentSound = window.__originalGetCurrentSound;
  });
  await stage.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'mouse',
        clientX: bounds.left + bounds.width * 0.78,
        clientY: bounds.top + bounds.height * 0.22,
        bubbles: true
      })
    );
  });
  await page.waitForFunction(() =>
    document.querySelector('.liquid-record-stage')?.classList.contains('is-hovering')
  );
  const tilt = await page.locator('.liquid-record').getAttribute('style');
  assert.match(tilt, /--tilt-[xy]: (?!0deg)/);
  await page.waitForFunction(
    () => Number(getComputedStyle(document.querySelector('.record-sheen')).opacity) > 0.95
  );
  await stage.dispatchEvent('pointerleave', { pointerType: 'mouse' });
  await page.screenshot({ path: 'artifacts/ui-audit/lyric-3d-polish.png' });

  const settingsButton = page.getByRole('button', { name: '歌词设置' });
  await settingsButton.click();
  const settings = page.locator('.w-80');
  await settings.waitFor();
  await page.getByText('界面', { exact: true }).click();
  const widthSlider = page.locator('.slider-group:visible input[type="range"]').first();
  await widthSlider.evaluate((el) => {
    el.value = '55';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() =>
    document.querySelector('.liquid-lyric-stage')?.getAttribute('style')?.includes('55%')
  );
  assert.match(await page.locator('.liquid-lyric-stage').getAttribute('style'), /55%/);
  await page
    .getByText('显示', { exact: true })
    .click()
    .catch(() => {});
  const focusToggle = page.locator('.setting-item').filter({ hasText: '聚焦当前歌词' }).locator('input[type="checkbox"]');
  await focusToggle.uncheck({ force: true });
  await page.waitForFunction(() => !document.querySelector('.liquid-now-playing')?.classList.contains('focused-lyrics'));
  await focusToggle.check({ force: true });
  await page.waitForFunction(() => document.querySelector('.liquid-now-playing')?.classList.contains('focused-lyrics'));
  const hideCoverRow = page.locator('.setting-item').filter({ hasText: '隐藏封面' });
  if (await hideCoverRow.count()) {
    await hideCoverRow.locator('input[type="checkbox"]').check({ force: true });
    await stage.waitFor({ state: 'hidden' });
  }
  await page.keyboard.press('Escape');
  await page.locator('.control-left .control-btn').first().click({ force: true });
  await page.locator('.liquid-now-playing').waitFor({ state: 'hidden' });
  const playBar = page.locator('.music-play-bar');
  await playBar.waitFor();
  const float = await playBar.evaluate((el) => ({
    position: getComputedStyle(el).position,
    rect: el.getBoundingClientRect().toJSON()
  }));
  assert.equal(float.position, 'fixed');
  assert(float.rect.bottom < 900 && float.rect.top > 0);
  assert(Math.abs((float.rect.left + float.rect.right) / 2 - (260 + (1440 - 260) / 2)) < 3);
  await page.setViewportSize({ width: 900, height: 700 });
  const compactPlayer = await playBar.boundingBox();
  assert(
    compactPlayer.x >= 260 && compactPlayer.x + compactPlayer.width <= 900,
    'compact floating player must remain inside the content column beside the sidebar'
  );
  await page.screenshot({ path: 'artifacts/ui-audit/compact-floating-player.png' });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: '音量与更多播放控制' }).click();
  await page.evaluate(() => {
    window.__qualityTransitionRan = false;
    document.addEventListener(
      'transitionrun',
      (event) => {
        if (event.target.closest?.('.n-popover-shared')) window.__qualityTransitionRan = true;
      },
      true
    );
  });
  await page.getByRole('button', { name: '自适应音质' }).click();
  const quality = page.locator('.quality-popover');
  await quality.waitFor();
  const popover = await quality.evaluate((el) => ({
    rect: el.getBoundingClientRect().toJSON(),
    className: el.className,
    shellClass: el.closest('.n-popover-shared')?.className || '',
    title: el.innerText
  }));
  assert(popover.rect.x >= 0 && popover.rect.y >= 0);
  assert(popover.rect.right <= 1440 && popover.rect.bottom <= 900);
  assert.match(popover.className, /quality-popover/);
  assert.match(popover.shellClass, /n-popover-shared/);
  await page.waitForFunction(() => window.__qualityTransitionRan, { timeout: 1500 });
  assert.match(popover.title, /自适应最高可用音质/);
  fs.mkdirSync('artifacts/ui-audit', { recursive: true });
  await page.screenshot({ path: 'artifacts/ui-audit/lyric-interaction-polish.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: vinyl pointer tilt, live lyric settings, fixed floating player, animated quality popover bounds, no runtime errors'
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
