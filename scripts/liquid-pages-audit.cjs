const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    'C:/Users/24656/AppData/Local/Temp/haru-ui-tests/node_modules/playwright-core'
);
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const palette = ['#e85d75', '#438e86', '#b282d1', '#dc9855', '#6384c4', '#d97756'];
    const cover = (index) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${palette[index % palette.length]}"/><stop offset="1" stop-color="#171a21"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="560" cy="220" r="170" fill="white" fill-opacity=".18"/><path d="M0 620L800 300V800H0Z" fill="white" fill-opacity=".12"/></svg>`)}`;
    let body;
    if (path === '/personalized') {
      body = {
        code: 200,
        result: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          name: `夜色精选 ${i + 1}`,
          picUrl: cover(i),
          copywriter: '为你挑选的音乐',
          playCount: 14800 + i * 913
        }))
      };
    } else if (path === '/top/artists') {
      body = {
        code: 200,
        artists: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          name: `Artist ${i + 1}`,
          picUrl: cover(i + 1)
        }))
      };
    } else if (path === '/dj/recommend') {
      body = { code: 200, djRadios: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `声音故事 ${i + 1}`, picUrl: cover(i), subCount: 10000 + i * 2000, programCount: 12 })) };
    } else if (path === '/dj/catelist') {
      body = { code: 200, categories: [{ id: 1, name: '音乐' }, { id: 2, name: '故事' }] };
    } else if (path === '/dj/today/perfered') {
      body = { code: 200, data: [] };
    } else if (path === '/album/new') {
      body = { code: 200, albums: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `唱片 ${i + 1}`, picUrl: cover(i), artists: [{ name: `音乐人 ${i + 1}` }] })), more: false };
    } else if (path === '/top/playlist') {
      body = { code: 200, playlists: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `歌单 ${i + 1}`, coverImgUrl: cover(i), playCount: 1000 })), more: false };
    } else if (path === '/toplist') {
      body = { code: 200, list: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `榜单 ${i + 1}`, coverImgUrl: cover(i), updateFrequency: '每周更新' })) };
    } else if (path === '/search/hot/detail') {
      body = { code: 200, data: Array.from({ length: 10 }, (_, i) => ({ searchWord: `搜索建议 ${i + 1}`, content: '音乐与艺术家' })) };
    } else if (path === '/top/album') {
      body = {
        code: 200,
        weekData: Array.from({ length: 6 }, (_, i) => ({
          id: i + 1,
          name: `午夜唱片 ${i + 1}`,
          picUrl: cover(i + 2),
          artists: [{ name: `音乐人 ${i + 1}` }]
        }))
      };
    } else if (path === '/personalized/newsong') {
      body = { code: 200, result: [] };
    }
    if (!body) return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('disclaimer_agreed_timestamp', String(Date.now()));
    localStorage.setItem('haru-liquid-mode', 'true');
  });
  await page.goto(process.env.UI_TEST_URL || 'http://127.0.0.1:5194/');
  await page.getByRole('button', { name: '关闭 Liquid Glass' }).waitFor();
  if (process.env.EDITORIAL_DESKTOP === '1') {
    await page.locator('.layout-page').evaluate((element) => element.classList.add('desktop-editorial-shell'));
  }
  const sidebar = page.locator('.liquid-sidebar');
  const sidebarToggle = page.getByRole('button', { name: '收起侧边栏' });
  await page.waitForFunction(() => document.querySelectorAll('.home-list-card img').length > 0);
  await sidebarToggle.click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.liquid-sidebar')).width === '76px');
  await page.getByRole('button', { name: '展开侧边栏' }).waitFor();
  fs.mkdirSync('artifacts/ui-audit/liquid-pages', { recursive: true });
  await page.screenshot({ path: 'artifacts/ui-audit/liquid-pages/home-sidebar-collapsed.png' });
  await page.reload();
  await page.getByRole('button', { name: '展开侧边栏' }).waitFor();
  if (process.env.EDITORIAL_DESKTOP === '1') {
    await page.locator('.layout-page').evaluate((element) => element.classList.add('desktop-editorial-shell'));
  }
  assert.equal(await sidebar.evaluate((element) => getComputedStyle(element).width), '76px');
  await page.getByRole('button', { name: '展开侧边栏' }).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.liquid-sidebar')).width === '260px');
  await page.screenshot({ path: 'artifacts/ui-audit/liquid-pages/home-cards.png' });
  const captures = [];
  for (const [name, route, label] of [
    ['home', '/', '首页'],
    ['search', '/search', '搜索'],
    ['playlists', '/list', '歌单'],
    ['albums', '/album', '专辑'],
    ['charts', '/toplist', '排行榜'],
    ['podcast', '/podcast', '播客'],
    ['settings', '/set', '设置']
  ]) {
    const before = errors.length;
    await page.locator('.liquid-nav-link').filter({ hasText: label }).click();
    await page.waitForFunction((path) => location.hash === `#${path}`, route);
    await page.waitForTimeout(350);
    const pageClass = await page.locator('.main-page').getAttribute('class');
    await page.screenshot({ path: `artifacts/ui-audit/liquid-pages/${name}.png` });
    if (name === 'podcast' && process.env.EDITORIAL_DESKTOP === '1') {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: 'artifacts/ui-audit/liquid-pages/podcast-compact.png' });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    captures.push({ name, route, pageClass, errors: errors.slice(before) });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(captures));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
