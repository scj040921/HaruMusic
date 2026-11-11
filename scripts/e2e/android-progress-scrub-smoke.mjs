import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const forwardPort = 9231;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();

let socket;
for (let attempt = 0; attempt < 60 && !socket; attempt++) {
  socket = adb('shell', 'cat', '/proc/net/unix').match(/@webview_devtools_remote_(\d+)/)?.[1];
  if (!socket) await sleep(500);
}
assert.ok(socket, 'Android WebView DevTools socket is not available');
adb('forward', `tcp:${forwardPort}`, `localabstract:webview_devtools_remote_${socket}`);

const targets = await (await fetch(`http://127.0.0.1:${forwardPort}/json/list`)).json();
const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
assert.ok(target, 'HaruMusic WebView target is not available');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 90000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
};
const waitFor = async (expression, timeoutMs = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await evaluate(`Boolean(${expression})`);
    if (value) return value;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${expression}`);
};

const storageKeys = ['player-core-store', 'playProgress'];
await waitFor("location.origin === 'https://localhost' && document.querySelector('#app')");
const original = await evaluate(
  `JSON.stringify(Object.fromEntries(${JSON.stringify(storageKeys)}.map(key => [key, localStorage.getItem(key)])))`
);

const sampleRate = 8000;
const seconds = 18;
const wav = Buffer.alloc(44 + sampleRate * seconds * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(wav.length - 44, 40);
const sampleUrl = `data:audio/wav;base64,${wav.toString('base64')}`;
const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#f59c55"/><stop offset=".48" stop-color="#9c426d"/><stop offset="1" stop-color="#243c58"/></linearGradient><radialGradient id="b"><stop stop-color="#fbe4a5" stop-opacity=".9"/><stop offset="1" stop-color="#fbe4a5" stop-opacity="0"/></radialGradient></defs><rect width="900" height="900" fill="url(#a)"/><circle cx="260" cy="260" r="430" fill="url(#b)"/><path d="M0 650 230 430l180 145 180-270 310 340v255H0z" fill="#111827" fill-opacity=".55"/><path d="M80 0h68v900H80zm650 0h28v900h-28z" fill="#fff" fill-opacity=".16"/></svg>`;
const coverUrl = `data:image/svg+xml,${encodeURIComponent(coverSvg)}`;
const testSong = {
  id: 'android-progress-scrub-smoke',
  name: '进度拖动自动化验证',
  source: 'local',
  playMusicUrl: sampleUrl,
  picUrl: coverUrl,
  ar: [],
  dt: seconds * 1000,
  lyric: {
    lrcTimeArray: Array.from({ length: 18 }, (_, i) => i),
    lrcArray: Array.from({ length: 18 }, (_, i) => ({ text: `第 ${i + 1} 行 · 随音乐慢慢流动`, trText: '', startTime: i * 1000, duration: 1000 })),
    hasWordByWord: false
  }
};

try {
  await evaluate(`(() => {
    localStorage.setItem('player-core-store', ${JSON.stringify(
      JSON.stringify({
        playMusic: testSong,
        playMusicUrl: sampleUrl,
        playbackRate: 1,
        volume: 0,
        isMuted: true,
        isPlay: false,
        audioOutputDeviceId: 'default'
      })
    )});
    localStorage.removeItem('playProgress');
    setTimeout(() => location.reload(), 100);
  })()`);

  await waitFor("document.querySelector('.mini-song-info')");
  await evaluate("document.querySelector('#mobile-drawer-target .control-btn')?.click()");
  await waitFor("document.querySelector('.mobile-header')");
  const stylesheet = readFileSync('src/renderer/index.css', 'utf8');
  const geometry = stylesheet.slice(stylesheet.indexOf(':root {'), stylesheet.indexOf('/* 页面内容区域'));
  await evaluate(`(() => { const style = document.createElement('style'); style.textContent = ${JSON.stringify(geometry)}; document.head.append(style); })()`);
  const headerMetrics = await evaluate(`(() => {
    const header = document.querySelector('.mobile-header');
    const content = document.querySelector('.mobile-content');
    return { padding: getComputedStyle(header).paddingTop, height: header.getBoundingClientRect().height, contentTop: content.getBoundingClientRect().top };
  })()`);
  assert.equal(headerMetrics.padding, '0px', 'Floating header must not apply the safe inset twice');
  assert.equal(headerMetrics.height, 52);
  assert.equal(headerMetrics.contentTop, 0, 'Content background must extend behind the header');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.header-btn')).borderRadius"), '50%', 'Icon controls must use circular corners');
  mkdirSync('artifacts/screenshots', { recursive: true });
  const homeShot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('artifacts/screenshots/android-floating-navigation.png', Buffer.from(homeShot.data, 'base64'));
  await evaluate("document.querySelector('.mini-song-info').click()");
  await sleep(1000);
  const lyricView = await evaluate(`JSON.stringify({
    playBar: document.querySelector('.mobile-play-bar')?.className,
    drawer: document.querySelector('#mobile-drawer-target')?.className,
    hasSlider: !!document.querySelector('#mobile-drawer-target .apple-style-progress'),
    text: document.body.innerText.slice(-500)
  })`);
  assert.ok(JSON.parse(lyricView).hasSlider, `Now Playing did not render its progress control: ${lyricView}`);

  const rect = await evaluate(`(() => {
    const slider = [...document.querySelectorAll('#mobile-drawer-target .apple-style-progress')]
      .find(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; });
    if (!slider) return null;
    const box = slider.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height,
      max: Number(slider.getAttribute('aria-valuemax')) };
  })()`);
  assert.ok(rect && rect.width > 100 && rect.height > 0, 'Progress slider has no touchable area');

  const y = rect.top + rect.height / 2;
  const startX = rect.left + rect.width * 0.12;
  const endX = rect.left + rect.width * 0.72;
  await evaluate(`(() => {
    window.__scrubEvents = [];
    const slider = document.querySelector('#mobile-drawer-target .apple-style-progress');
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend']) {
      slider.addEventListener(type, event => window.__scrubEvents.push({ type, pointerType: event.pointerType, x: event.clientX }), true);
      window.addEventListener(type, event => window.__scrubEvents.push({ type: 'window-' + type, pointerType: event.pointerType, x: event.clientX, target: event.target?.className }), true);
    }
  })()`);
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y, id: 1 }]
  });
  await sleep(80);
  await send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: endX, y, id: 1 }]
  });
  await sleep(80);
  const previewTime = await evaluate(
    "Number(document.querySelector('#mobile-drawer-target .apple-style-progress')?.getAttribute('aria-valuenow'))"
  );
  const eventLog = await evaluate('JSON.stringify(window.__scrubEvents)');
  const state = await evaluate(`JSON.stringify({ rect: document.querySelector('#mobile-drawer-target .apple-style-progress')?.getBoundingClientRect().toJSON(), max: document.querySelector('#mobile-drawer-target .apple-style-progress')?.getAttribute('aria-valuemax'), now: document.querySelector('#mobile-drawer-target .apple-style-progress')?.getAttribute('aria-valuenow'), atStart: document.elementFromPoint(${startX}, ${y})?.className, atEnd: document.elementFromPoint(${endX}, ${y})?.className, body: document.body.innerText.slice(-180) })`);
  assert.ok(previewTime > rect.max * 0.55, `Touch drag did not move preview: ${previewTime}; expectedMax=${rect.max}; state=${state}; events=${eventLog}`);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const committedTime = await evaluate(
    "document.querySelector('#mobile-drawer-target .time-info .current-time')?.textContent?.trim()"
  );
  assert.match(committedTime || '', /00:(0[8-9]|1[0-8])/);
  console.log(`Android lyric progress drag passed: preview=${previewTime}s, committed=${committedTime}`);
  const normalShot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('artifacts/screenshots/android-now-playing.png', Buffer.from(normalShot.data, 'base64'));
  const controlsBounds = await evaluate(
    "document.querySelector('#mobile-drawer-target .unified-controls')?.getBoundingClientRect().toJSON()"
  );
  assert.ok(controlsBounds?.bottom <= 850, `Playback controls should clear the bottom gesture area: ${JSON.stringify(controlsBounds)}`);
  const lyricRect = await evaluate(`(() => {
    const node = document.querySelector('.ios-layout-container .lyrics-wrapper');
    return node && { height: node.clientHeight, scroll: node.scrollHeight, touch: getComputedStyle(node).touchAction };
  })()`);
  assert.ok(lyricRect && lyricRect.height >= 100 && lyricRect.scroll > lyricRect.height, `Lyrics must be readable and scrollable: ${JSON.stringify(lyricRect)}`);
  await evaluate("document.querySelector('.lyrics-expand').click()");
  await waitFor("document.querySelector('.fullscreen-lyrics .lyrics-scroller')");
  const pure = await evaluate(`(() => {
    const node = document.querySelector('.fullscreen-lyrics .lyrics-scroller');
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height * .7, height: box.height, before: node.scrollTop };
  })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pure.x, y: pure.y, id: 2 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pure.x, y: pure.y - 160, id: 2 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
  const after = await evaluate("document.querySelector('.fullscreen-lyrics .lyrics-scroller').scrollTop");
  assert.ok(Math.abs(after - pure.before) > 20, 'Pure lyrics must respond to native touch drag');
  mkdirSync('artifacts/screenshots', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('artifacts/screenshots/android-pure-lyrics.png', Buffer.from(shot.data, 'base64'));
  console.log(`Android lyric viewport and native drag passed: height=${lyricRect.height}, pureHeight=${pure.height}, scrollDelta=${after - pure.before}`);
} finally {
  await evaluate(`(() => {
    const original = JSON.parse(${JSON.stringify(original)});
    for (const [key, value] of Object.entries(original)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    setTimeout(() => location.reload(), 100);
  })()`);
  await sleep(500);
  ws.close();
  try {
    adb('forward', '--remove', `tcp:${forwardPort}`);
  } catch {
    // adb may remove forwards automatically when the emulator exits.
  }
}
