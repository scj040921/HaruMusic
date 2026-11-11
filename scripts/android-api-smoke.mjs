import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = join(root, 'deployment', 'android-node-api');
const gatewayPort = Number(process.env.HARUMUSIC_ANDROID_API_TEST_PORT || '31488');
const apiBasePort = gatewayPort + 1;
const origin = 'https://localhost';
const temporaryDir = await mkdtemp(join(os.tmpdir(), 'harumusic-android-api-'));
const bridgeShimPath = join(temporaryDir, 'bridge-shim.cjs');
const serverPath = join(projectDir, 'server.cjs');
const mockAudio = Buffer.from('0123456789');
const mockUpstream = createServer((request, response) => {
  if (request.url === '/audio-no-range') {
    response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    response.end(Buffer.alloc(9 * 1024 * 1024));
    return;
  }
  if (request.url === '/source.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end('module.exports = { platform: "smoke" };');
    return;
  }
  if (request.url === '/audio') {
    const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), mockAudio.length - 1) : mockAudio.length - 1;
      const body = mockAudio.subarray(start, end + 1);
      response.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(body.length),
        'Content-Range': `bytes ${start}-${end}/${mockAudio.length}`,
        'Content-Type': 'audio/mpeg'
      });
      response.end(body);
      return;
    }
    response.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(mockAudio.length),
      'Content-Type': 'audio/mpeg'
    });
    response.end(mockAudio);
    return;
  }
  response.writeHead(404).end();
});
mockUpstream.listen(0, '127.0.0.1');
await once(mockUpstream, 'listening');
const mockPort = mockUpstream.address().port;

await writeFile(
  bridgeShimPath,
  `const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'bridge') return {
    app: { on() {}, datadir: () => require('node:path').join(${JSON.stringify(temporaryDir)}, 'app-private') },
    channel: { post: (...args) => console.log('[bridge]', JSON.stringify(args)) }
  };
  return originalLoad.call(this, request, parent, isMain);
};\n`,
  'utf8'
);

const server = spawn(process.execPath, ['--require', bridgeShimPath, serverPath], {
  cwd: projectDir,
  env: {
    ...process.env,
    HARUMUSIC_GATEWAY_PORT: String(gatewayPort),
    HARUMUSIC_API_BASE_PORT: String(apiBasePort)
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
server.stdout.setEncoding('utf8').on('data', (chunk) => (output += chunk));
server.stderr.setEncoding('utf8').on('data', (chunk) => (output += chunk));

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/__health`, {
        headers: { Origin: origin }
      });
      if (response.ok) return response;
    } catch {
      // The API boot is asynchronous; keep polling until its bounded deadline.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Embedded API did not become healthy. Process output:\n${output}`);
}

try {
  const health = await waitForHealth();
  assert.deepEqual(await health.json(), { ok: true, service: 'harumusic' });
  assert.ok(output.includes(`[bridge] ${JSON.stringify(['api-ready', gatewayPort])}`));
  assert.equal(health.headers.get('access-control-allow-origin'), origin);
  assert.equal(health.headers.get('access-control-allow-credentials'), 'true');

  const foreignOrigin = await fetch(`http://127.0.0.1:${gatewayPort}/__http`, {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `http://127.0.0.1:${mockPort}/source.js` })
  });
  assert.equal(foreignOrigin.status, 403);
  assert.equal(foreignOrigin.headers.get('access-control-allow-origin'), null);

  const preflight = await fetch(`http://127.0.0.1:${gatewayPort}/login/status`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type'
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);

  // The Netease static API page exercises the loopback proxy without contacting
  // a third-party music service or requiring a user account.
  const proxiedPage = await fetch(`http://127.0.0.1:${gatewayPort}/`);
  assert.equal(proxiedPage.status, 200);
  assert.match(await proxiedPage.text(), /NeteaseCloudMusicApi|网易云音乐/);

  const fetchedPlugin = await fetch(`http://127.0.0.1:${gatewayPort}/__http`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `http://127.0.0.1:${mockPort}/source.js`,
      options: { method: 'GET' },
      requestId: 'smoke-plugin-fetch'
    })
  });
  assert.equal(fetchedPlugin.status, 200);
  assert.equal(fetchedPlugin.headers.get('access-control-allow-origin'), origin);
  assert.match((await fetchedPlugin.json()).body, /platform: "smoke"/);

  // Some hosts ignore Range and return a whole track. A probe must inspect
  // the response headers without buffering the entire audio file as text.
  const mediaProbe = await fetch(`http://127.0.0.1:${gatewayPort}/__http`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `http://127.0.0.1:${mockPort}/audio-no-range`,
      options: { method: 'GET', headers: { Range: 'bytes=0-8191' }, responseType: 'media-probe' },
      requestId: 'smoke-media-probe'
    })
  });
  assert.equal(mediaProbe.status, 200);
  const probeResult = await mediaProbe.json();
  assert.equal(probeResult.statusCode, 200);
  assert.equal(probeResult.headers['content-type'], 'audio/mpeg');
  assert.equal(probeResult.body, '');

  const mediaDescriptor = encodeURIComponent(
    JSON.stringify({ url: `http://127.0.0.1:${mockPort}/audio`, headers: {} })
  );
  const rangedMedia = await fetch(`http://127.0.0.1:${gatewayPort}/__media?d=${mediaDescriptor}`, {
    headers: { Range: 'bytes=2-5', Origin: origin }
  });
  assert.equal(rangedMedia.status, 206);
  assert.equal(rangedMedia.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await rangedMedia.text(), '2345');

  const invalidUnblock = await fetch(`http://127.0.0.1:${gatewayPort}/__unblock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 0 })
  });
  assert.equal(invalidUnblock.status, 400);

  console.log('Android embedded API, plugin HTTP, and ranged media smoke checks passed.');
  assert.equal(
    await import('node:fs/promises').then(({ access }) => access(join(temporaryDir, 'app-private', 'tmp', 'anonymous_token')).then(() => true)),
    true,
    'the API token file must stay inside the app-private data directory'
  );
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 2000))
  ]);
  mockUpstream.close();
  await once(mockUpstream, 'close');
  await rm(temporaryDir, { recursive: true, force: true });
}
