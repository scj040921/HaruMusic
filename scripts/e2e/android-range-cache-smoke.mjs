import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' });
const bytes = Buffer.alloc(3 * 512 * 1024, 42);
let requests = 0;
let foregroundReads = 0;
let slowStarted = false;
let cancelled = false;
const server = createServer((request, response) => {
  requests++;
  if (request.url === '/slow') {
    slowStarted = true;
    response.once('close', () => { cancelled = true; });
    return;
  }
  const match = /bytes=(\d+)-(\d*)/.exec(request.headers.range || '');
  const start = match ? Number(match[1]) : 0;
  if (start === 0) foregroundReads++;
  const end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
  response.writeHead(206, { 'Content-Type': 'audio/flac', 'Accept-Ranges': 'bytes',
    'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
  response.end(bytes.subarray(start, end + 1));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
adb('reverse', `tcp:${port}`, `tcp:${port}`);
adb('forward', 'tcp:30490', 'tcp:30488');
const endpoint = track => `http://127.0.0.1:30490/__media?d=${encodeURIComponent(JSON.stringify({ url: `http://127.0.0.1:${port}/${track}` }))}`;
try {
  const health = await fetch('http://127.0.0.1:30490/__health', { headers: { Origin: 'https://localhost' } });
  assert.equal((await health.json()).service, 'harumusic');
  for (let index = 0; index < 20; index++) {
    const response = await fetch(endpoint(`track-${index % 3}`), {
      headers: { Origin: 'https://localhost', Range: 'bytes=0-8191' }
    });
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 8192);
  }
  const afterReplay = requests;
  assert.equal(foregroundReads, 3, `20 repeated plays must reuse the three tracks' initial blocks`);
  const controller = new AbortController();
  const stalled = fetch(endpoint('slow'), {
    headers: { Origin: 'https://localhost', Range: 'bytes=0-8191' }, signal: controller.signal
  });
  for (let i = 0; i < 40 && !slowStarted; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(slowStarted, 'The slow upstream fixture must be reached before cancellation');
  controller.abort();
  await stalled.catch(() => undefined);
  for (let i = 0; i < 40 && !cancelled; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(cancelled, 'Cancelling a stalled track must close its upstream request');
  const next = await fetch(endpoint('track-0'), { headers: { Origin: 'https://localhost', Range: 'bytes=0-8191' } });
  assert.equal((await next.arrayBuffer()).byteLength, 8192);
  console.log(`Android native gateway passed: 20 repeat/switch requests, ${foregroundReads} foreground initial-block downloads (${afterReplay} total including speculative blocks), stalled-request cancellation and subsequent playback read.`);
} finally {
  adb('reverse', '--remove', `tcp:${port}`);
  server.closeAllConnections(); server.close();
}
