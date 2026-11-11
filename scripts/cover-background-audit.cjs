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
  const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#146c60"/><circle cx="540" cy="220" r="190" fill="#f1bd55"/><path d="M0 640L800 330V800H0Z" fill="#e76b52"/></svg>')}`;
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    const bodies = {
      '/album/new': { code: 200, albums: [{ id: 42, name: '封面专辑', picUrl: cover, artists: [{ id: 77, name: '封面背景歌手' }] }], more: false },
      '/album': { code: 200, album: { id: 42, name: '封面专辑', picUrl: cover, artists: [{ id: 77, name: '封面背景歌手' }], artist: { id: 77, name: '封面背景歌手', picUrl: cover } }, songs: [{ id: 1, name: '样本曲目', picUrl: cover, al: { id: 42, name: '封面专辑', picUrl: cover }, ar: [{ id: 77, name: '封面背景歌手' }], dt: 180000 }] },
      '/artist/detail': { data: { artist: { id: 77, name: '封面背景歌手', cover, picUrl: cover, musicSize: 0, albumSize: 0 } } },
      '/artist/songs': { songs: [] },
      '/artist/album': { hotAlbums: [] }
    };
    return bodies[path]
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bodies[path]) })
      : route.fallback();
  });
  await page.addInitScript(() => {
    localStorage.setItem('disclaimer_agreed_timestamp', String(Date.now()));
    localStorage.setItem('haru-liquid-mode', 'true');
    const ipcRenderer = { send: () => {}, sendSync: (channel) => channel === 'get-platform' ? 'win32' : channel === 'get-store-value' ? { musicApiPort: 3003 } : {}, invoke: async () => null, on: () => () => {}, removeAllListeners: () => {} };
    window.electron = { ipcRenderer };
    window.api = new Proxy({}, { get: (_target, key) => String(key).startsWith('on') ? () => () => {} : () => Promise.resolve(false) });
  });
  await page.goto(process.env.UI_TEST_URL || 'http://127.0.0.1:5197/');
  await page.getByRole('button', { name: '关闭 Liquid Glass' }).waitFor();
  const albumNav = await page.evaluate(async (coverUrl) => {
    const { useMusicStore } = await import('/store/modules/music.ts');
    const vueApp = document.querySelector('#app').__vue_app__;
    const router = vueApp.config.globalProperties.$router;
    const store = useMusicStore(vueApp.config.globalProperties.$pinia);
    store.setCurrentMusicList([{ id: 1, name: '样本曲目', picUrl: coverUrl, al: { id: 42, name: '封面专辑', picUrl: coverUrl }, ar: [{ id: 77, name: '封面背景歌手' }] }], '封面专辑', { id: 42, picUrl: coverUrl, coverImgUrl: coverUrl }, false);
    await router.push('/music-list/42?type=album');
    return { route: router.currentRoute.value.fullPath, id: store.currentListInfo?.id, count: store.currentMusicList?.length };
  }, cover);
  await page.waitForTimeout(400);
  if (!(await page.locator('.music-list-page').count())) throw new Error(`Album route did not render: ${JSON.stringify({ albumNav, hash: await page.evaluate(() => location.hash), errors })}`);
  await page.locator('.music-list-page').waitFor();
  await page.waitForTimeout(400);
  const album = await page.locator('.hero-bg').first().evaluate((element) => ({
    display: getComputedStyle(element).display,
    artwork: getComputedStyle(element.firstElementChild).backgroundImage,
    tint: getComputedStyle(element.firstElementChild).backgroundImage.includes('146c60'),
    overlayOpacity: getComputedStyle(element.lastElementChild).opacity,
    shell: document.querySelector('.layout-page').classList.contains('desktop-editorial-shell')
  }));
  const albumLayers = await page.locator('.desktop-album-cover-page').evaluate((element) => ({
    pageBackground: getComputedStyle(element).backgroundColor,
    pageRadius: getComputedStyle(element).borderTopLeftRadius,
    pageOverflow: getComputedStyle(element).overflow,
    actionRadius: getComputedStyle(element.querySelector('.action-bar')).borderTopLeftRadius,
    actionBackground: getComputedStyle(element.querySelector('.action-bar')).backgroundColor,
    actionBlur: getComputedStyle(element.querySelector('.action-bar')).backdropFilter,
    imageOpacity: getComputedStyle(element.querySelector('.desktop-album-artwork')).opacity,
    blurFilter: getComputedStyle(element.querySelector('.desktop-album-backdrop')).filter,
    blurMask: getComputedStyle(element.querySelector('.desktop-album-backdrop')).maskImage,
    reflectionFilter: getComputedStyle(element.querySelector('.desktop-album-reflection')).filter,
    reflectionTransform: getComputedStyle(element.querySelector('.desktop-album-reflection')).transform,
    artworkFilter: getComputedStyle(element.querySelector('.desktop-album-artwork')).filter,
    artworkMask: getComputedStyle(element.querySelector('.desktop-album-artwork')).maskImage,
    edgeMask: getComputedStyle(element.querySelector('.desktop-album-backdrop')).maskImage,
    ambienceBlend: getComputedStyle(element.querySelector('.desktop-cover-ambience'), '::before').mixBlendMode,
    ambienceBlur: getComputedStyle(element.querySelector('.desktop-cover-ambience'), '::before').filter,
    layerBounds: element.querySelector('.desktop-album-backdrop').getBoundingClientRect().toJSON()
  }));
  assert.equal(album.display, 'none');
  assert.match(album.artwork, /data:image\/svg\+xml/);
  assert.equal(album.tint, true);
  assert.equal(album.shell, true);
  assert.notEqual(albumLayers.pageBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(albumLayers.pageRadius, '28px');
  assert.equal(albumLayers.actionRadius, '24px');
  assert.equal(albumLayers.actionBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(albumLayers.actionBlur, 'none');
  assert.equal(albumLayers.pageOverflow, 'hidden');
  assert.equal(albumLayers.imageOpacity, '0.96');
  assert.match(albumLayers.blurFilter, /blur\(30px\)/);
  assert.match(albumLayers.blurMask, /linear-gradient/);
  assert.match(albumLayers.reflectionFilter, /blur\(30px\)/);
  assert.notEqual(albumLayers.reflectionTransform, 'none');
  assert.equal(albumLayers.artworkFilter, 'saturate(1.04)');
  assert.match(albumLayers.artworkMask, /linear-gradient/);
  assert.match(albumLayers.edgeMask, /rgba\(0, 0, 0, 0\)/);
  assert.equal(albumLayers.ambienceBlend, 'soft-light');
  assert.equal(albumLayers.ambienceBlur, 'blur(240px)');
  fs.mkdirSync('artifacts/ui-audit', { recursive: true });
  await page.screenshot({ path: 'artifacts/ui-audit/album-background-desktop.png' });

  await page.evaluate(async () => {
    const vueApp = document.querySelector('#app').__vue_app__;
    const router = vueApp.config.globalProperties.$router;
    await router.push('/artist/detail/77');
  });
  await page.locator('.artist-detail-page').waitFor();
  await page.waitForFunction(() => document.querySelector('.artist-detail-page h1')?.textContent?.includes('封面背景歌手'));
  await page.waitForTimeout(400);
  const artist = await page.locator('.artist-detail-page .hero-bg').last().evaluate((element) => ({
    display: getComputedStyle(element).display,
    artwork: getComputedStyle(element.firstElementChild).backgroundImage,
    tint: getComputedStyle(element.firstElementChild).backgroundImage.includes('146c60'),
    shell: document.querySelector('.layout-page').classList.contains('desktop-editorial-shell')
  }));
  const artistLayers = await page.locator('.desktop-artist-cover-page').evaluate((element) => ({
    pageBackground: getComputedStyle(element).backgroundColor,
    pageRadius: getComputedStyle(element).borderTopLeftRadius,
    pageOverflow: getComputedStyle(element).overflow,
    actionRadius: getComputedStyle(element.querySelector('.action-bar')).borderTopLeftRadius,
    actionBackground: getComputedStyle(element.querySelector('.action-bar')).backgroundColor,
    actionBlur: getComputedStyle(element.querySelector('.action-bar')).backdropFilter,
    imageOpacity: getComputedStyle(element.querySelector('.desktop-artist-artwork')).opacity,
    blurFilter: getComputedStyle(element.querySelector('.desktop-artist-backdrop')).filter,
    blurMask: getComputedStyle(element.querySelector('.desktop-artist-backdrop')).maskImage,
    reflectionFilter: getComputedStyle(element.querySelector('.desktop-artist-reflection')).filter,
    reflectionTransform: getComputedStyle(element.querySelector('.desktop-artist-reflection')).transform,
    artworkFilter: getComputedStyle(element.querySelector('.desktop-artist-artwork')).filter,
    artworkMask: getComputedStyle(element.querySelector('.desktop-artist-artwork')).maskImage,
    edgeMask: getComputedStyle(element.querySelector('.desktop-artist-backdrop')).maskImage,
    ambienceBlend: getComputedStyle(element.querySelector('.desktop-cover-ambience'), '::before').mixBlendMode,
    ambienceBlur: getComputedStyle(element.querySelector('.desktop-cover-ambience'), '::before').filter,
    tint: getComputedStyle(element.querySelector('.desktop-artist-tint')).backgroundColor
  }));
  assert.equal(artist.display, 'none');
  assert.match(artist.artwork, /data:image\/svg\+xml/);
  assert.equal(artist.tint, true);
  assert.equal(artist.shell, true);
  assert.notEqual(artistLayers.pageBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(artistLayers.pageRadius, '28px');
  assert.equal(artistLayers.actionRadius, '24px');
  assert.equal(artistLayers.actionBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(artistLayers.actionBlur, 'none');
  assert.equal(artistLayers.pageOverflow, 'hidden');
  assert.equal(artistLayers.imageOpacity, '0.96');
  assert.match(artistLayers.blurFilter, /blur\(30px\)/);
  assert.match(artistLayers.blurMask, /linear-gradient/);
  assert.match(artistLayers.reflectionFilter, /blur\(30px\)/);
  assert.notEqual(artistLayers.reflectionTransform, 'none');
  assert.equal(artistLayers.artworkFilter, 'saturate(1.04)');
  assert.match(artistLayers.artworkMask, /linear-gradient/);
  assert.match(artistLayers.edgeMask, /rgba\(0, 0, 0, 0\)/);
  assert.equal(artistLayers.ambienceBlend, 'soft-light');
  assert.equal(artistLayers.ambienceBlur, 'blur(240px)');
  await page.screenshot({ path: 'artifacts/ui-audit/artist-background-desktop.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ album, albumLayers, artist, artistLayers }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
