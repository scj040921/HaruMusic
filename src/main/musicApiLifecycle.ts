import type { Server } from 'node:net';

async function waitForListening(server: Server): Promise<void> {
  if (server.listening) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      server.removeListener('listening', ready);
      server.removeListener('error', failed);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    server.once('listening', ready);
    server.once('error', failed);
  });
}

/** Bind the real server; a separate probe has a race and can check a different host. */
export async function startApiOnAvailablePort<T extends { server: Server }>(
  start: (port: number) => Promise<T>,
  preferredPort: number,
  attempts = 10
): Promise<{ port: number; app: T }> {
  const first =
    Number.isInteger(preferredPort) && preferredPort > 0 && preferredPort <= 65535
      ? preferredPort
      : 30488;
  for (let i = 0; i < attempts && first + i <= 65535; i++) {
    try {
      const app = await start(first + i);
      await waitForListening(app.server);
      return { port: first + i, app };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
      if (i === attempts - 1 || first + i === 65535) throw error;
    }
  }
  throw new Error('No available loopback music API port');
}
