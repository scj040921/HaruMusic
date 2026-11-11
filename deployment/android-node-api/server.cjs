const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const unblockMusic = require('@unblockneteasemusic/server');
const { app: nodeApp, channel } = require('bridge');

const GATEWAY_PORT = Number(process.env.HARUMUSIC_GATEWAY_PORT || '30488');
const API_BASE_PORT = Number(process.env.HARUMUSIC_API_BASE_PORT || String(GATEWAY_PORT + 1));
const MAX_PORT_ATTEMPTS = 12;
const LOOPBACK = '127.0.0.1';
const MAX_SOURCE_BODY_BYTES = 8 * 1024 * 1024;
const sourceRequests = new Map();

if (!Number.isInteger(GATEWAY_PORT) || GATEWAY_PORT < 1 || GATEWAY_PORT > 65535) {
  throw new Error('HARUMUSIC_GATEWAY_PORT must be a valid TCP port.');
}
if (!Number.isInteger(API_BASE_PORT) || API_BASE_PORT < 1 || API_BASE_PORT > 65535) {
  throw new Error('HARUMUSIC_API_BASE_PORT must be a valid TCP port.');
}

function log(...args) {
  console.info('[HaruMusic API]', ...args);
}

function createNodeModuleTempDirectory() {
  const dataDirectory = nodeApp.datadir();
  if (!dataDirectory) {
    throw new Error('The Node.js bridge did not provide an app-private data directory.');
  }

  // Node mobile reports the POSIX default `/tmp` even though Android does not
  // grant the app access to it. Override the JS os helper before loading the
  // music API, which resolves its anonymous token path during module import.
  const tempDirectory = path.join(dataDirectory, 'tmp');
  process.env.TMPDIR = tempDirectory;
  os.tmpdir = () => tempDirectory;
  fs.mkdirSync(tempDirectory, { recursive: true });

  // netease-cloud-music-api-alger reads this synchronously during import.
  const anonymousTokenPath = path.join(tempDirectory, 'anonymous_token');
  if (!fs.existsSync(anonymousTokenPath)) {
    fs.writeFileSync(anonymousTokenPath, '', { encoding: 'utf8', mode: 0o600 });
  }
}

function suppressCredentialBearingUpstreamLogs() {
  const originalLog = console.log.bind(console);
  console.log = (...args) => {
    // Upstream request logs include query strings, which can contain account cookies.
    if (args[0] === '[OK]' || args[0] === '[ERR]') return;
    originalLog(...args);
  };
}

function waitForListening(server) {
  if (server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

function validateHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function safeRequestHeaders(value) {
  const headers = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return headers;
  for (const [name, content] of Object.entries(value).slice(0, 48)) {
    if (
      !/^[!#$%&'*+.^_`|~\w-]+$/.test(name) ||
      name.length > 128 ||
      typeof content !== 'string' ||
      content.length > 2048 ||
      /^(host|connection|content-length|transfer-encoding|upgrade|proxy-.+)$/i.test(name)
    ) continue;
    headers[name] = content;
  }
  return headers;
}

function appendQueryParams(url, params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
    else if (typeof value === 'object') url.searchParams.set(key, JSON.stringify(value));
    else url.searchParams.set(key, String(value));
  }
}

async function readResponseText(response, maxBytes = MAX_SOURCE_BODY_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('插件请求响应超过 8 MB。');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function normalizeSongData(data) {
  const song = data && typeof data === 'object' ? { ...data } : {};
  song.name = typeof song.name === 'string' ? song.name : '';
  song.artists = Array.isArray(song.artists)
    ? song.artists.map((artist) => ({ name: artist?.name || '' }))
    : Array.isArray(song.ar)
      ? song.ar.map((artist) => ({ name: artist?.name || '' }))
      : [];
  song.album = song.album && typeof song.album === 'object'
    ? song.album
    : song.al && typeof song.al === 'object'
      ? song.al
      : { name: '' };
  return song;
}

function findAvailablePort(port) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once('error', reject);
    tester.listen(port, LOOPBACK, () => {
      tester.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function selectApiPort() {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const port = API_BASE_PORT + offset;
    try {
      return await findAvailablePort(port);
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
    }
  }

  throw new Error('No available local API port was found.');
}

async function start() {
  createNodeModuleTempDirectory();
  suppressCredentialBearingUpstreamLogs();

  // Capacitor's local document is served from https://localhost. The server reflects
  // that exact origin and remains bound to loopback; no remote device can reach it.
  process.env.CORS_ALLOW_ORIGIN = 'https://localhost';

  const port = await selectApiPort();
  const { serveNcmApi } = require('netease-cloud-music-api-alger/server');
  const upstream = await serveNcmApi({ port, host: LOOPBACK });
  await waitForListening(upstream.server);

  // Add a lightweight health route in front of the existing API so the WebView can
  // recover cleanly after a renderer reload while the Node runtime remains alive.
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (origin === 'https://localhost') {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');
      response.status(204).end();
      return;
    }
    next();
  });
  app.get('/__health', (_request, response) => response.json({ ok: true, service: 'harumusic' }));
  app.post('/__http', express.json({ limit: '2mb' }), async (request, response) => {
    const body = request.body || {};
    const target = validateHttpUrl(body.url);
    if (!target) return response.status(400).json({ error: '只支持有效的 HTTP 或 HTTPS 音源地址。' });

    const options = body.options && typeof body.options === 'object' ? body.options : {};
    const method = String(options.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return response.status(400).json({ error: '不支持的音源请求方法。' });
    }
    appendQueryParams(target, options.params);

    const headers = safeRequestHeaders(options.headers);
    const init = { method, headers, redirect: 'follow' };
    if (!['GET', 'HEAD'].includes(method)) {
      if (options.body !== undefined) init.body = String(options.body);
      else if (options.data !== undefined) {
        if (typeof options.data === 'string') init.body = options.data;
        else {
          init.body = JSON.stringify(options.data);
          if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
            headers['Content-Type'] = 'application/json';
          }
        }
      } else if (options.form || options.formData) {
        init.body = new URLSearchParams(options.form || options.formData).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    const controller = new AbortController();
    const requestId = String(body.requestId || `${Date.now()}-${Math.random()}`);
    sourceRequests.set(requestId, controller);
    const timeoutMs = Math.min(Math.max(Number(options.timeout) || 30000, 1000), 120000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    init.signal = controller.signal;
    try {
      const upstream = await fetch(target, init);
      const rawBody = method === 'HEAD' ? '' : await readResponseText(upstream);
      let parsedBody = rawBody;
      const contentType = upstream.headers.get('content-type') || '';
      if (contentType.includes('application/json') || /^[\s]*[\[{]/.test(rawBody)) {
        try { parsedBody = JSON.parse(rawBody); } catch { /* Preserve a non-JSON response. */ }
      }
      const responseHeaders = {};
      upstream.headers.forEach((value, name) => { responseHeaders[name] = value; });
      return response.json({ statusCode: upstream.status, headers: responseHeaders, body: parsedBody });
    } catch (error) {
      return response.status(error?.name === 'AbortError' ? 504 : 502)
        .json({ error: error?.message || '音源请求失败。' });
    } finally {
      clearTimeout(timeout);
      sourceRequests.delete(requestId);
    }
  });
  app.post('/__http/cancel', express.json({ limit: '32kb' }), (request, response) => {
    const controller = sourceRequests.get(String(request.body?.requestId || ''));
    if (controller) controller.abort();
    response.json({ cancelled: Boolean(controller) });
  });
  app.post('/__unblock', express.json({ limit: '256kb' }), async (request, response) => {
    const id = Number(request.body?.id);
    if (!Number.isSafeInteger(id) || id <= 0) return response.status(400).json({ error: '歌曲 ID 无效。' });
    const allowed = new Set(['migu', 'kugou', 'kuwo', 'pyncmd']);
    const platforms = Array.isArray(request.body?.sources)
      ? request.body.sources.filter((source) => allowed.has(source))
      : ['pyncmd'];
    try {
      const data = await unblockMusic(id, platforms, normalizeSongData(request.body?.song));
      return response.json({ data: { data, params: { id, type: 'song' } } });
    } catch (error) {
      return response.status(502).json({ error: error?.message || '音源解析失败。' });
    }
  });
  app.get('/__media', async (request, response) => {
    let descriptor;
    try { descriptor = JSON.parse(String(request.query.d || '')); } catch { descriptor = null; }
    const target = validateHttpUrl(descriptor?.url);
    if (!target) return response.status(400).end();
    const headers = safeRequestHeaders(descriptor?.headers);
    const range = request.headers.range;
    if (range && /^bytes=\d*-\d*(,\s*\d*-\d*)*$/.test(range)) headers.Range = range;
    if (request.headers['if-range']) headers['If-Range'] = request.headers['if-range'];
    try {
      const upstream = await fetch(target, { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers });
      response.status(upstream.status);
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag', 'cache-control']) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      response.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Accept-Ranges');
      if (request.method === 'HEAD' || !upstream.body) return response.end();
      Readable.fromWeb(upstream.body).on('error', (error) => response.destroy(error)).pipe(response);
    } catch {
      if (!response.headersSent) response.status(502).end();
      else response.destroy();
    }
  });
  app.use(
    createProxyMiddleware({
      target: `http://${LOOPBACK}:${port}`,
      changeOrigin: false,
      xfwd: true
    })
  );

  const gateway = app.listen(GATEWAY_PORT, LOOPBACK);
  await waitForListening(gateway);
  const address = gateway.address();
  if (!address || typeof address === 'string') {
    throw new Error('The local API gateway did not bind to a TCP port.');
  }

  log(`ready on 127.0.0.1:${GATEWAY_PORT}`);
  channel.post('api-ready', GATEWAY_PORT);
  nodeApp.on('pause', (pauseLock) => pauseLock.release());
}

start().catch((error) => {
  console.error('[HaruMusic API] failed to start:', error?.message || error);
  channel.post('api-error', String(error?.message || error));
});
