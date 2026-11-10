import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const AUTH_ERROR =
  '无法读取 GitHub CLI 登录凭据。请安装 GitHub CLI 并运行 gh auth login，或打开发布页面手动更新。';

/** Retrieve the existing credential without saving it, logging it, or invoking a shell. */
export async function getGithubUpdateCredential(): Promise<string> {
  const installed = join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI', 'gh.exe');
  const executable = process.platform === 'win32' && existsSync(installed) ? installed : 'gh';
  try {
    const result = await runFile(executable, ['auth', 'token', '--hostname', 'github.com'], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 16_384
    });
    const token = result.stdout.trim();
    if (!token || /[\r\n]/.test(token)) throw new Error('Invalid credential');
    return token;
  } catch {
    throw new Error(AUTH_ERROR);
  }
}
