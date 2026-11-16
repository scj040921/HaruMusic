import { createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { startApiOnAvailablePort } from '../src/main/musicApiLifecycle';

const servers: Server[] = [];
const start = async (port: number) => {
  const server = createServer();
  servers.push(server);
  server.listen(port, '127.0.0.1');
  return { server };
};
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .filter((server) => server.listening)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  );
});

describe('music API startup', () => {
  it('waits for a real bind and moves past an occupied IPv4 loopback port', async () => {
    const occupied = createServer();
    servers.push(occupied);
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const port = (occupied.address() as { port: number }).port;
    const result = await startApiOnAvailablePort(start, port);
    expect(result.port).toBeGreaterThan(port);
    expect(result.app.server.listening).toBe(true);
    expect((result.app.server.address() as { address: string }).address).toBe('127.0.0.1');
  });

  it('rejects a failed bind without reporting startup success or an unhandled error', async () => {
    const occupied = createServer();
    servers.push(occupied);
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const port = (occupied.address() as { port: number }).port;
    await expect(startApiOnAvailablePort(start, port, 1)).rejects.toMatchObject({
      code: 'EADDRINUSE'
    });
  });

  it('propagates errors unrelated to port occupation without retrying', async () => {
    let attempts = 0;
    await expect(
      startApiOnAvailablePort(async () => {
        attempts++;
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      }, 30488)
    ).rejects.toMatchObject({ code: 'EACCES' });
    expect(attempts).toBe(1);
  });
});
