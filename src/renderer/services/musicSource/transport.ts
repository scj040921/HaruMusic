import { getAndroidEmbeddedApiBaseUrl } from '@/services/androidEmbeddedApi';
import { isAndroidApp, isElectron } from '@/utils';

export type MusicSourceHttpOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  data?: unknown;
  params?: Record<string, unknown>;
  form?: Record<string, string>;
  formData?: Record<string, string>;
  timeout?: number;
  responseType?: 'media-probe';
};

export type MusicSourceHttpResponse = {
  statusCode: number;
  headers?: Record<string, string | string[]>;
  body?: unknown;
};

const appendParams = (rawUrl: string, params?: Record<string, unknown>): string => {
  const url = new URL(rawUrl);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
    else if (typeof value === 'object') url.searchParams.set(key, JSON.stringify(value));
    else url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  const trimmed = text.trimStart();
  if (
    response.headers.get('content-type')?.includes('application/json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    try {
      return JSON.parse(text);
    } catch {
      // Preserve successful non-JSON plugin responses as text.
    }
  }
  return text;
};

/** HTTP transport shared by desktop IPC, the Android loopback API and browser fallback. */
export const requestMusicSourceHttp = async (
  url: string,
  options: MusicSourceHttpOptions = {},
  requestId = `music-source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
): Promise<MusicSourceHttpResponse> => {
  if (isElectron) {
    return window.api.lxMusicHttpRequest({ url, options, requestId });
  }

  if (isAndroidApp) {
    const baseUrl = await getAndroidEmbeddedApiBaseUrl();
    const response = await fetch(`${baseUrl}/__http`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, options, requestId })
    });
    const payload = (await response.json()) as MusicSourceHttpResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || `音源请求失败（${response.status}）`);
    return payload;
  }

  const target = appendParams(url, options.params);
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  let body: BodyInit | undefined;
  if (!['GET', 'HEAD'].includes(method)) {
    if (options.body !== undefined) body = options.body;
    else if (options.data !== undefined) {
      if (typeof options.data === 'string') body = options.data;
      else {
        body = JSON.stringify(options.data);
        headers['Content-Type'] ||= 'application/json';
      }
    } else if (options.form || options.formData) {
      body = new URLSearchParams(options.form || options.formData).toString();
      headers['Content-Type'] ||= 'application/x-www-form-urlencoded';
    }
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeout || 30000);
  try {
    const response = await fetch(target, { method, headers, body, signal: controller.signal });
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await parseResponseBody(response)
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const cancelMusicSourceHttp = async (requestId: string): Promise<void> => {
  if (isElectron) {
    await window.api.lxMusicHttpCancel(requestId);
    return;
  }
  if (!isAndroidApp) return;
  const baseUrl = await getAndroidEmbeddedApiBaseUrl();
  await fetch(`${baseUrl}/__http/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId })
  });
};

export const fetchMusicSourcePlugin = async (
  sourceUrl: string
): Promise<{ name: string; content: string; url: string }> => {
  if (isElectron) return window.api.fetchMusicSourcePlugin(sourceUrl);
  const url = new URL(sourceUrl);
  let name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'online-source');
  name = name.replace(/\.(m?js|cjs)$/i, '') || 'online-source';
  const candidates = [sourceUrl, ...getMusicSourceMirrorUrls(sourceUrl)];
  const isManifest = /\.json$/i.test(url.pathname);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const response = await requestMusicSourceHttp(candidate, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/javascript, */*',
          'User-Agent': 'HaruMusic/0.1'
        },
        timeout: 20000
      });
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`HTTP ${response.statusCode}`);
      }
      const content =
        typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
      if (!content.trim()) throw new Error('服务器返回了空内容。');
      if (content.length > 2 * 1024 * 1024) throw new Error('音源脚本不能超过 2 MB。');
      if (isManifest) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error('返回内容不是有效的 JSON 订阅清单。');
        }
        if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as any).plugins)) {
          throw new Error('订阅清单缺少 plugins 列表。');
        }
      }
      return { name, content, url: sourceUrl };
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : '网络请求失败。';
  throw new Error(`无法读取音源地址（已尝试 GitHub 内容镜像）：${detail}`);
};

/** GitHub Pages/CDN在部分 Android 网络中不可达时，尝试同仓库的 jsDelivr 与 raw 镜像。 */
export const getMusicSourceMirrorUrls = (sourceUrl: string): string[] => {
  try {
    const source = new URL(sourceUrl);
    const mirrors: string[] = [];
    const githubPageMirrors: Record<string, { repo: string; prefix: string }> = {
      'qwerwhr.github.io': { repo: 'qwerwhr/musicfree-plugins', prefix: '/musicfree-plugins/' },
      'hebijunge.github.io': {
        repo: 'hebijunge/musicfree-plugins',
        prefix: '/musicfree-plugins/'
      }
    };
    const githubPages = githubPageMirrors[source.hostname.toLowerCase()];

    if (githubPages && source.pathname.startsWith(githubPages.prefix)) {
      const path = source.pathname.slice(githubPages.prefix.length);
      mirrors.push(
        `https://cdn.jsdelivr.net/gh/${githubPages.repo}@main/${path}${source.search}`,
        `https://raw.githubusercontent.com/${githubPages.repo}/main/${path}${source.search}`
      );
    }

    const jsdelivr = source.pathname.match(/^\/gh\/([^/@]+\/[^/@]+)@([^/]+)\/(.+)$/);
    if (source.hostname === 'cdn.jsdelivr.net' && jsdelivr) {
      mirrors.push(
        `https://raw.githubusercontent.com/${jsdelivr[1]}/${jsdelivr[2]}/${jsdelivr[3]}${source.search}`
      );
    }

    const rawGithub = source.pathname.match(/^\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/);
    if (source.hostname === 'raw.githubusercontent.com' && rawGithub) {
      mirrors.push(
        `https://cdn.jsdelivr.net/gh/${rawGithub[1]}@${rawGithub[2]}/${rawGithub[3]}${source.search}`
      );
    }

    return [...new Set(mirrors.filter((mirror) => mirror !== sourceUrl))];
  } catch {
    return [];
  }
};

export const resolveUnblockMusic = async (
  id: number | string,
  song: unknown,
  sources: string[]
): Promise<unknown> => {
  if (isElectron) return window.api.unblockMusic(Number(id), song, sources);
  if (!isAndroidApp) return null;
  const baseUrl = await getAndroidEmbeddedApiBaseUrl();
  const response = await fetch(`${baseUrl}/__unblock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, song, sources })
  });
  if (!response.ok) throw new Error(`音源解析失败（${response.status}）`);
  return response.json();
};

export const buildAndroidMediaProxyUrl = (
  rawUrl: string,
  headers?: Record<string, string>
): string => {
  try {
    const existing = new URL(rawUrl);
    if (existing.origin === 'http://127.0.0.1:30488' && existing.pathname === '/__media')
      return rawUrl;
  } catch {
    // Validation happens before reaching this function.
  }
  const data = encodeURIComponent(JSON.stringify({ url: rawUrl, headers: headers || {} }));
  return `http://127.0.0.1:30488/__media?d=${data}`;
};
