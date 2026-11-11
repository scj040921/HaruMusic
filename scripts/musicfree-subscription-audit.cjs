const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    'C:/Users/24656/AppData/Local/Temp/haru-ui-tests/node_modules/playwright-core'
);
const assert = require('node:assert/strict');

const subscriptions = {
  'https://qwerwhr.github.io/musicfree-plugins/plugins.json': {
    desc: 'qwerwhr MusicFree',
    plugins: Array.from({ length: 76 }, (_, index) => ({
      name: `Qwer 插件 ${index + 1}`,
      url: `https://example.test/qwer-${index + 1}.js`,
      version: '1.0.0'
    }))
  },
  'https://hebijunge.github.io/musicfree-plugins/plugins.json': {
    desc: 'hebijunge MusicFree',
    plugins: Array.from({ length: 57 }, (_, index) => ({
      name: `Hebi 插件 ${index + 1}`,
      url: `https://example.test/hebi-${index + 1}.js`,
      version: '1.0.0'
    }))
  }
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((mockSubscriptions) => {
    localStorage.setItem('disclaimer_agreed_timestamp', String(Date.now()));
    localStorage.setItem('haru-liquid-mode', 'true');
    window.electron = {
      ipcRenderer: {
        send: () => {},
        sendSync: (channel) =>
          channel === 'get-platform'
            ? 'win32'
            : channel === 'get-store-value'
              ? { musicApiPort: 3003 }
              : {},
        invoke: async () => null,
        on: () => () => {},
        removeAllListeners: () => {}
      }
    };
    window.api = new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === 'fetchMusicSourcePlugin') {
            return async (url) => ({
              url,
              name: 'Test MusicFree manifest',
              content: JSON.stringify(mockSubscriptions[url] || { plugins: [] })
            });
          }
          return String(key).startsWith('on') ? () => () => {} : async () => false;
        }
      }
    );
  }, subscriptions);

  await page.goto(process.env.UI_TEST_URL || 'http://127.0.0.1:5197/');
  await page.getByRole('button', { name: '关闭 Liquid Glass' }).waitFor();
  await page.evaluate(async () => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
    await router.push('/set');
  });
  await page.locator('.settings-tab').filter({ hasText: '播放' }).click();
  await page.getByText('配置音源', { exact: true }).click();
  await page.getByText('MusicFree 插件订阅').waitFor();

  await page.getByText('qwerwhr · MusicFree 插件', { exact: true }).click();
  await page.getByText('Qwer 插件 76', { exact: true }).waitFor();
  const qwerCount = await page.locator('.music-free-plugin-catalog button').count();
  assert.ok(qwerCount >= 76);

  await page.getByRole('button', { name: '返回订阅' }).click();
  await page.getByText('hebijunge · MusicFree 插件', { exact: true }).click();
  await page.getByText('Hebi 插件 57', { exact: true }).waitFor();
  assert.deepEqual(errors, []);

  console.log(JSON.stringify({ qwerwhrPlugins: 76, hebijungePlugins: 57, errors }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
