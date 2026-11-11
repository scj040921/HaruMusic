/**
 * 统一音源解析器（重构后的唯一解析管线）
 *
 * resolveSong：按注册表顺序逐 provider 尝试，单步预算 + 整链预算，
 * 失败缓存跳过，统一校验与 API 端点二次解析，返回 attempts 归因。
 * 取代旧的「getSongUrl 内联降级链 + MusicParser 策略工厂」双轨编排。
 */
import { SongSourceConfigManager } from '@/services/SongSourceConfigManager';
import { isUnplayableMedia } from '@/services/unplayableMedia';
import { useSettingsStore } from '@/store';
import type { SongResult } from '@/types/music';
import { isAndroidApp, isElectron } from '@/utils';

import { buildPluginMediaUrl, validatePluginMediaSource } from '../../../shared/musicSourcePlugin';
import { inferPluginAudioFormat, qualityToBitrate } from '../musicSourcePluginProtocol';
import { MusicResolveCache } from './cache';
import { useMusicSourceRegistry } from './registry';
import { buildAndroidMediaProxyUrl, requestMusicSourceHttp } from './transport';
import type { ResolveAttempt, ResolveSongResult } from './types';
import { SourceAccessRejected } from './types';

const accessCooldowns = new Map<string, { until: number; code: number }>();
const failures = new Map<string, string>();
const failureKey = (song: Pick<SongResult, 'source' | 'id'>) => `${song.source}:${song.id}`;
export const getMusicResolveFailure = (song: Pick<SongResult, 'source' | 'id'>): string =>
  failures.get(failureKey(song)) || '已启用音源均未返回可播放音轨，请检查音源配置和访问权限。';

const STAGE_BUDGET_MS = 6_000;
const CHAIN_BUDGET_MS = 12_000;

export type ResolveSongOptions = {
  /** 歌曲级音源覆盖（缺省取全局启用集合） */
  sourceKeys?: string[];
  quality?: string;
  /** 下载场景（netease provider 切换 VIP 下载口，跳过磁盘播放缓存） */
  isDownload?: boolean;
  /** 命中 URL 缓存时仍强制重新解析 */
  force?: boolean;
};

// ─── 命中 URL 轻量验证（生态实测：LX 源近半返回端点/外链/失效链） ─────────

/**
 * 验证 provider 命中的 URL 真的可播，再允许它进入缓存与播放链路。
 *
 * 99 份真实语料实测的命中形态：audio 直链（多数）、PHP/JSON 端点（需二次
 * 请求提取）、163 outer 外链（可能 302 到音频或返回 HTML）、失效端点
 * （403/404）。不验证的话坏 URL 会进缓存，到播放时才炸、且该源被误判成功。
 *
 * 判定（Range 0-8191 轻量探测，经主进程绕过 CORS）：
 *  - 2xx/206 + audio|octet-stream|video|mpeg → 直链可用
 *  - 2xx + JSON → 提取内层 url 字段再验一层（限深 2，防循环）
 *  - 其余（HTML 错误页 / 403 / 404 / 5xx）→ 该源判失败，自动降级
 * Android 使用嵌入式 Node HTTP 桥走同一验证规则；纯 Web 端没有宿主 HTTP 桥，乐观放行。
 */
const verifyMediaUrl = async (
  url: string,
  headers?: Record<string, string>,
  depth = 0
): Promise<string | null> => {
  if (!isElectron && !isAndroidApp) return url;
  if (isElectron && typeof window.api?.lxMusicHttpRequest !== 'function') return url;
  if (depth > 2) return url;

  try {
    const requestId = `verify_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const options = {
      method: 'GET',
      headers: { ...(headers || {}), Range: 'bytes=0-8191' },
      timeout: 10000,
      ...(isAndroidApp ? { responseType: 'media-probe' as const } : {})
    };
    const response = isElectron
      ? await window.api.lxMusicHttpRequest({ url, options, requestId })
      : await requestMusicSourceHttp(url, options, requestId);

    const status = response?.statusCode ?? 0;
    if (status < 200 || status >= 400) return null;

    const contentType = String(
      Object.entries(response?.headers || {}).find(
        ([name]) => name.toLowerCase() === 'content-type'
      )?.[1] || ''
    );
    if (/audio\/|octet-stream|video\/|mpeg/i.test(contentType)) {
      return url;
    }

    // JSON 端点：提取内层真实 URL 再验一层
    let body = response?.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // Non-JSON responses are rejected below.
      }
    }
    if (body && typeof body === 'object') {
      const raw = body as Record<string, any>;
      const inner = raw.url || raw.data?.url || raw.audio_url || raw.link || raw.src;
      if (typeof inner === 'string' && /^https?:\/\//i.test(inner) && inner !== url) {
        return verifyMediaUrl(inner, headers, depth + 1);
      }
    }
    // 2xx 但既不是音频也提取不到 URL（HTML 跳转页/错误页）
    return null;
  } catch {
    return null;
  }
};

// ─── 主入口 ──────────────────────────────────────────────────────────────

/** 参与键：歌曲级覆盖优先，否则全局启用集合 */
const effectiveSourceKeys = (songId: number): string[] | undefined => {
  const songConfig = SongSourceConfigManager.getConfig(songId);
  if (songConfig && songConfig.sources.length > 0) return songConfig.sources;
  return undefined;
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * 统一解析入口。返回 null = 全部音源未命中。
 * 成功结果的 url 已按需包装 pluginmedia://（带请求头的直链走主进程代理）。
 */
export const resolveSong = async (
  song: SongResult,
  options: ResolveSongOptions = {}
): Promise<ResolveSongResult | null> => {
  const settingsStore = useSettingsStore();
  const { orderedProviders, findProvider } = useMusicSourceRegistry();

  const sourceKeys = options.sourceKeys ?? effectiveSourceKeys(song.id as number);
  const quality = options.isDownload ? options.quality || 'auto' : options.quality || 'auto';
  const globalKeys: string[] = settingsStore.setData?.enabledMusicSources || [];

  const songId = Number(song.id);

  // URL 缓存（键含参与音源集合，配置变化自动失效）
  if (!options.force && !options.isDownload) {
    const cached = await MusicResolveCache.getCachedMusicUrl(
      songId,
      sourceKeys ?? globalKeys,
      quality
    );
    if (cached && cached.headers === undefined) {
      // Older builds cached only the URL and dropped provider request headers.
      await MusicResolveCache.clearMusicCache(songId);
    } else if (cached && !isUnplayableMedia(cached.url)) {
      return {
        media: validatePluginMediaSource({
          url: isAndroidApp
            ? buildAndroidMediaProxyUrl(cached.url, cached.headers)
            : cached.headers
              ? buildPluginMediaUrl(cached.url, cached.headers, true)
              : cached.url,
          format: cached.format,
          br: cached.br,
          headers: cached.headers
        })!,
        providerKey: cached.providerKey,
        providerName: cached.providerName,
        attempts: [
          { providerKey: cached.providerKey, ok: true, reason: 'no-source', detail: 'cache-hit' }
        ]
      };
    }
  }

  // Web 端没有主进程桥：插件沙箱、unblock 代理、Range 校验、pluginmedia:// 包装
  // 都依赖 Electron。原先这里是非 Electron 直接 return null，导致 Web/PWA 解析不出
  // 任何播放地址（整个播放链路失效）。Web 只能走纯 HTTP 的内置网易云源。
  let candidates = orderedProviders(sourceKeys);
  if (!isElectron && !isAndroidApp) {
    const netease = findProvider('netease');
    candidates = netease && netease.available !== false ? [netease] : [];
  }
  const attempts: ResolveAttempt[] = [];
  const chainStart = Date.now();
  const chainDeadline = chainStart + CHAIN_BUDGET_MS;

  for (const provider of candidates) {
    const stageStart = Date.now();
    if (stageStart >= chainDeadline) {
      attempts.push({
        providerKey: provider.key,
        ok: false,
        reason: 'timeout',
        detail: 'chain-budget'
      });
      continue;
    }

    if (!options.isDownload && MusicResolveCache.isInFailedCache(songId, provider.key, quality)) {
      attempts.push({ providerKey: provider.key, ok: false, reason: 'skipped' });
      continue;
    }
    const cooldown = accessCooldowns.get(provider.key);
    if (
      !options.force &&
      !options.isDownload &&
      !sourceKeys &&
      cooldown &&
      cooldown.until > Date.now()
    ) {
      attempts.push({
        providerKey: provider.key,
        ok: false,
        reason: 'skipped',
        detail: `source-access-rejected:${cooldown.code}`
      });
      continue;
    }

    try {
      const stageDeadline = Math.min(chainDeadline, stageStart + STAGE_BUDGET_MS);
      let verifiedUrl: string | null = null;
      const raw = await withTimeout(
        (async () => {
          const levels =
            quality === 'auto' && (provider.plugin || provider.key === 'customApi')
              ? ['auto', 'hires', 'lossless', 'exhigh', 'higher', 'standard']
              : [quality];
          const seen = new Set<string>();
          for (const level of levels) {
            if (Date.now() >= stageDeadline) break;
            try {
              const candidate = await provider.resolve(song, level, {
                isDownload: options.isDownload,
                deadline: stageDeadline - 1000,
                verifyMedia:
                  provider.key === 'netease' || !!provider.plugin
                    ? async (url, headers) => {
                        verifiedUrl = isUnplayableMedia(url)
                          ? null
                          : await withTimeout(
                              verifyMediaUrl(url, headers),
                              Math.max(1, Math.min(4000, stageDeadline - Date.now() - 500))
                            );
                        return verifiedUrl;
                      }
                    : undefined
              });
              if (
                !candidate &&
                level === 'auto' &&
                (provider.plugin || provider.key === 'customApi')
              )
                break;
              if (!candidate || seen.has(candidate.url) || isUnplayableMedia(candidate.url))
                continue;
              seen.add(candidate.url);
              const url =
                verifiedUrl === candidate.url
                  ? verifiedUrl
                  : await withTimeout(verifyMediaUrl(candidate.url, candidate.headers), 4000);
              if (url) {
                verifiedUrl = url;
                return { ...candidate, url };
              }
            } catch (error) {
              if (error instanceof SourceAccessRejected) throw error;
              /* A lower supported tier may still work. */
            }
          }
          return null;
        })(),
        Math.max(1, stageDeadline - Date.now())
      );
      if (!raw) {
        attempts.push({
          providerKey: provider.key,
          ok: false,
          reason: 'no-source',
          costMs: Date.now() - stageStart
        });
        if (!options.isDownload) MusicResolveCache.addFailedCache(songId, provider.key, quality);
        continue;
      }

      // 验证也纳入单步预算：失效端点/HTML 页当场判失败降级，不进缓存
      const resolvedUrl =
        verifiedUrl === raw.url
          ? verifiedUrl
          : await withTimeout(verifyMediaUrl(raw.url, raw.headers), STAGE_BUDGET_MS);
      const media = resolvedUrl ? validatePluginMediaSource({ ...raw, url: resolvedUrl }) : null;
      if (!media) {
        attempts.push({
          providerKey: provider.key,
          ok: false,
          reason: 'no-source',
          detail: 'invalid-url',
          costMs: Date.now() - stageStart
        });
        if (!options.isDownload) MusicResolveCache.addFailedCache(songId, provider.key, quality);
        continue;
      }

      attempts.push({ providerKey: provider.key, ok: true, costMs: Date.now() - stageStart });
      const result: ResolveSongResult = {
        media: {
          url: isAndroidApp
            ? buildAndroidMediaProxyUrl(media.url, media.headers)
            : buildPluginMediaUrl(media.url, media.headers, !options.isDownload),
          format: media.format || inferPluginAudioFormat(media.url, media.br),
          br: media.br ?? (quality === 'auto' ? undefined : qualityToBitrate(quality)),
          headers: media.headers
        },
        providerKey: provider.key,
        providerName: provider.name,
        attempts
      };
      if (!options.isDownload)
        await MusicResolveCache.setCachedMusicUrl(
          songId,
          {
            url: media.url,
            format: result.media.format,
            br: result.media.br,
            headers: media.headers || {},
            providerKey: provider.key,
            providerName: provider.name
          },
          sourceKeys ?? globalKeys,
          quality
        );
      return result;
    } catch (error) {
      if (error instanceof SourceAccessRejected)
        accessCooldowns.set(provider.key, { until: Date.now() + 30_000, code: error.code });
      const isTimeout = (error as Error).message === 'timeout';
      attempts.push({
        providerKey: provider.key,
        ok: false,
        reason: isTimeout ? 'timeout' : 'error',
        detail: (error as Error).message?.slice(0, 120),
        costMs: Date.now() - stageStart
      });
      if (!options.isDownload) MusicResolveCache.addFailedCache(songId, provider.key, quality);
    }
  }

  if (attempts.length) {
    console.warn(
      `[resolver] 全部音源未命中: ${song.name}(${songId})`,
      attempts.map((a) => `${a.providerKey}:${a.reason}`).join(', ')
    );
  }
  const reasons = attempts
    .filter(
      (attempt) =>
        attempt.reason !== 'skipped' || attempt.detail?.startsWith('source-access-rejected:')
    )
    .slice(0, 3)
    .map((attempt) => {
      const name =
        candidates.find((provider) => provider.key === attempt.providerKey)?.name ||
        attempt.providerKey;
      const rejected = attempt.detail?.match(/source-access-rejected:(-?\d+)/);
      return `${name}：${rejected ? `接口拒绝访问（${rejected[1]}）` : attempt.reason === 'timeout' ? '响应超时' : '未匹配到有效音轨'}`;
    });
  failures.set(
    failureKey(song),
    reasons.length
      ? `取源失败。${reasons.join('；')}`
      : attempts.length
        ? failures.get(failureKey(song)) || '音源暂时不可用，请稍后重试或切换音源。'
        : '没有启用可用的音乐源，请检查音源配置。'
  );
  if (failures.size > 64) failures.delete(failures.keys().next().value!);
  return null;
};

export { MusicResolveCache };
