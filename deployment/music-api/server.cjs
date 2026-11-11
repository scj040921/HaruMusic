const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const API_PORT = Number(process.env.API_PORT || '30489');
const PORT = Number(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://localhost';
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || '1');
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || '1200');

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}
if (!Number.isInteger(API_PORT) || API_PORT < 1 || API_PORT > 65535 || API_PORT === PORT) {
  throw new Error('API_PORT must be a valid port different from PORT.');
}
if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0 || TRUST_PROXY_HOPS > 4) {
  throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 4.');
}
if (!Number.isInteger(RATE_LIMIT_MAX) || RATE_LIMIT_MAX < 1) {
  throw new Error('RATE_LIMIT_MAX must be a positive integer.');
}

// The upstream package creates this token file during its Electron host startup.
const tokenPath = path.join(os.tmpdir(), 'anonymous_token');
if (!fs.existsSync(tokenPath)) {
  fs.writeFileSync(tokenPath, '', { encoding: 'utf8', mode: 0o600 });
}

// The upstream package logs full request URLs and error bodies. These can
// include user cookies, so suppress per-request output in the public service.
const originalLog = console.log.bind(console);
console.log = (...args) => {
  if (args[0] === '[OK]' || args[0] === '[ERR]') return;
  originalLog(...args);
};

let publicServer;
let apiServer;

async function start() {
  process.env.CORS_ALLOW_ORIGIN = ALLOWED_ORIGIN;

  const { serveNcmApi } = require('netease-cloud-music-api-alger/server');
  const upstreamApp = await serveNcmApi({ port: API_PORT, host: '127.0.0.1' });

  const app = express();
  if (TRUST_PROXY_HOPS > 0) app.set('trust proxy', TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  app.get('/healthz', (_request, response) => response.json({ ok: true }));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (request) => request.method === 'OPTIONS' || request.path === '/healthz'
    })
  );
  app.use(
    createProxyMiddleware({
      target: `http://127.0.0.1:${API_PORT}`,
      changeOrigin: false,
      xfwd: true
    })
  );

  publicServer = app.listen(PORT, HOST, () => {
    originalLog(`HaruMusic API gateway listening on ${HOST}:${PORT}`);
  });
  apiServer = upstreamApp.server;
}

function shutdown() {
  publicServer?.close();
  apiServer?.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((error) => {
  console.error('HaruMusic API gateway failed to start:', error.message);
  process.exitCode = 1;
});
