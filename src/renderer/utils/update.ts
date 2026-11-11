import { Capacitor } from '@capacitor/core';
import { useDateFormat } from '@vueuse/core';
import axios from 'axios';

export type UpdateChannel = 'nightly' | 'acceptance' | 'stable';

export const UPDATE_CHANNEL_STORAGE_KEY = 'harumusic.update.channel';
export const UPDATE_CHANNEL_OPTIONS: Array<{ label: string; value: UpdateChannel }> = [
  { label: 'Nightly', value: 'nightly' },
  { label: 'Acceptance', value: 'acceptance' },
  { label: 'Stable', value: 'stable' }
];

export interface GithubReleaseAsset {
  browser_download_url: string;
  name: string;
  size?: number;
}

export interface GithubReleaseInfo {
  tag_name: string;
  name?: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease?: boolean;
  draft?: boolean;
  assets: GithubReleaseAsset[];
  version?: string;
}

export interface UpdateResult {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  channel: UpdateChannel;
  error?: string;
  releaseInfo: {
    tag_name: string;
    body: string;
    html_url: string;
    assets: GithubReleaseAsset[];
  } | null;
}

interface UpdateManifest {
  channels?: Partial<
    Record<
      UpdateChannel,
      Partial<GithubReleaseInfo> & { version: string; assets?: GithubReleaseAsset[] }
    >
  >;
}

interface SignedUpdateManifest {
  format: string;
  data: string;
  signature: string;
}
const ANDROID_UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAtmEX4tNGQGgGQzRCe9ef
XkXRBcRsxShUJbGYrSqWICy8fm135y+jLvCBzjgEidJ9l7MuOYSuHut/rPn3XrcL
2h5pxyBJ/o7nq3Ni41utJW0GIQ3FwCvWRdtKjOTcsYXAZqRQ3seylHQF2oTFv1hk
Jj1YmSOTj4sF71urO2nKqUj38lY/1bdG7torpHcHsSiGgfMsZ38bnZC6kfe2stVh
D6yLd4bQk9x4Wf+msD72E30jrg7jL+AoA6gRGRD17+b71a6uaabu+wHL/nZwTtN5
cgdZaT1oeIpqUki+ZgCaw/0Bal+cwu9YXSsf/Wx1V4mpqQmqRoUhAEAIq8vaWCXd
AmnSuNA8Oh1sYKz1bbEBXV0VJ0olktxaluC0PXdQjspvte1UWbyUZrNQ9zUlA6JT
FKWfODnWNLrX+IK2rv8IpQLgHOL6aVcrkMf4InofTKeolJU9uPFQFgE2fpwXJ0bp
8VQXVxaH7GHMcs6tllG3xIL0rWZv0pd6haZ80tzLI16NAgMBAAE=
-----END PUBLIC KEY-----`;
const decodeBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export const verifySignedUpdateManifest = async (
  envelope: SignedUpdateManifest,
  publicKey = ANDROID_UPDATE_PUBLIC_KEY
): Promise<UpdateManifest> => {
  if (
    envelope?.format !== 'harumusic-update-v1' ||
    typeof envelope.data !== 'string' ||
    typeof envelope.signature !== 'string'
  ) {
    throw new Error('更新清单缺少有效签名。');
  }
  const keyBytes = decodeBase64(publicKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''));
  const key = await crypto.subtle.importKey(
    'spki',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = decodeBase64(envelope.data);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64(envelope.signature),
    data
  );
  if (!valid) throw new Error('更新清单签名验证失败。');
  return JSON.parse(new TextDecoder().decode(data)) as UpdateManifest;
};

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/scj040921/HaruMusic/releases?per_page=100';
const UPDATE_FEED_URL = (import.meta.env as ImportMetaEnv & { VITE_UPDATE_FEED_URL?: string })
  .VITE_UPDATE_FEED_URL;
const REQUEST_TIMEOUT = 8_000;

export const getUpdateChannel = (): UpdateChannel => {
  const saved = localStorage.getItem(UPDATE_CHANNEL_STORAGE_KEY);
  const defaultChannel = (
    import.meta.env as ImportMetaEnv & { VITE_DEFAULT_UPDATE_CHANNEL?: string }
  ).VITE_DEFAULT_UPDATE_CHANNEL;
  return UPDATE_CHANNEL_OPTIONS.some((option) => option.value === saved)
    ? (saved as UpdateChannel)
    : UPDATE_CHANNEL_OPTIONS.some((option) => option.value === defaultChannel)
      ? (defaultChannel as UpdateChannel)
      : 'stable';
};

export const setUpdateChannel = (channel: UpdateChannel): void => {
  localStorage.setItem(UPDATE_CHANNEL_STORAGE_KEY, channel);
  window.dispatchEvent(new CustomEvent('harumusic:update-channel', { detail: channel }));
};

/** Compare semver versions, including prereleases such as 0.2.0-nightly.12. */
export const compareVersions = (left: string, right: string): number => {
  const parse = (version: string) => {
    const normalized = version.trim().replace(/^v/i, '');
    const match = normalized.match(
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
    );
    if (!match) return null;
    return {
      core: match.slice(1, 4).map(Number),
      prerelease: match[4]?.split('.') ?? []
    };
  };

  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return 0;

  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }

  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }

  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined || bPart === undefined) {
      if (aPart === bPart) return 0;
      return aPart === undefined ? -1 : 1;
    }

    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) {
      const difference = Number(aPart) - Number(bPart);
      if (difference !== 0) return difference > 0 ? 1 : -1;
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (aPart !== bPart) {
      return aPart > bPart ? 1 : -1;
    }
  }

  return 0;
};

const releaseVersion = (release: GithubReleaseInfo, channel: UpdateChannel): string | null => {
  if (release.version) return release.version.replace(/^v/i, '');
  const tag = release.tag_name.replace(/^v/i, '');
  const match =
    channel === 'stable'
      ? tag.match(/^(\d+\.\d+\.\d+)$/)
      : channel === 'acceptance'
        ? tag.match(/^acceptance[-/]v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/i)
        : tag.match(/^nightly[-/]v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/i);
  return match?.[1] ?? null;
};

const belongsToChannel = (release: GithubReleaseInfo, channel: UpdateChannel): boolean => {
  if (release.draft) return false;
  if (channel === 'stable') return !release.prerelease && Boolean(releaseVersion(release, channel));
  return release.prerelease === true && Boolean(releaseVersion(release, channel));
};

const normalizeManifestEntry = (
  entry: Partial<GithubReleaseInfo> & { version: string },
  channel: UpdateChannel
): GithubReleaseInfo => ({
  tag_name: entry.tag_name || `${channel}-${entry.version}`,
  name: entry.name || `HaruMusic ${entry.version}`,
  body: entry.body || '',
  published_at: entry.published_at || new Date(0).toISOString(),
  html_url: entry.html_url || 'https://github.com/scj040921/HaruMusic/releases',
  prerelease: channel !== 'stable',
  assets: entry.assets || [],
  version: entry.version.replace(/^v/i, '')
});

export const getLatestReleaseInfo = async (
  channel: UpdateChannel = getUpdateChannel()
): Promise<GithubReleaseInfo | null> => {
  if (UPDATE_FEED_URL) {
    const feedUrl = UPDATE_FEED_URL.replace('{channel}', encodeURIComponent(channel));
    let envelope: SignedUpdateManifest;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const { requestMusicSourceHttp } = await import('@/services/musicSource/transport');
      const response = await requestMusicSourceHttp(feedUrl, {
        timeout: REQUEST_TIMEOUT,
        params: { t: Math.floor(Date.now() / 60000) }
      });
      if (response.statusCode < 200 || response.statusCode >= 300)
        throw new Error(`更新清单请求失败（${response.statusCode}）。`);
      envelope = response.body as SignedUpdateManifest;
    } else {
      const response = await axios.get<SignedUpdateManifest>(feedUrl, {
        params: { channel, t: Math.floor(Date.now() / 60000) },
        timeout: REQUEST_TIMEOUT,
        headers: { Accept: 'application/json' }
      });
      envelope = response.data;
    }
    const data = await verifySignedUpdateManifest(envelope);
    const entry = data?.channels?.[channel];
    return entry?.version ? normalizeManifestEntry(entry, channel) : null;
  }

  try {
    const { data } = await axios.get<GithubReleaseInfo[]>(GITHUB_RELEASES_URL, {
      timeout: REQUEST_TIMEOUT,
      headers: { Accept: 'application/vnd.github+json' }
    });
    return (
      data
        .filter((release) => belongsToChannel(release, channel))
        .sort((a, b) => {
          const versionOrder = compareVersions(
            releaseVersion(b, channel) || '0.0.0',
            releaseVersion(a, channel) || '0.0.0'
          );
          return versionOrder || Date.parse(b.published_at) - Date.parse(a.published_at);
        })[0] ?? null
    );
  } catch (error: any) {
    if (error?.response?.status === 404 && !UPDATE_FEED_URL) {
      throw new Error(
        'Android 端无法读取当前私有 GitHub 仓库的更新。请为应用配置公开更新清单地址（VITE_UPDATE_FEED_URL）。'
      );
    }
    throw error;
  }
};

export const formatDate = (dateStr: string): string => {
  return useDateFormat(new Date(dateStr), 'YYYY-MM-DD HH:mm').value;
};

export const checkUpdate = async (
  currentVersion: string,
  channel: UpdateChannel = getUpdateChannel()
): Promise<UpdateResult> => {
  try {
    const releaseInfo = await getLatestReleaseInfo(channel);
    if (!releaseInfo) {
      return {
        hasUpdate: false,
        latestVersion: '',
        currentVersion,
        channel,
        releaseInfo: null
      };
    }

    const latestVersion = releaseVersion(releaseInfo, channel) || releaseInfo.version || '';
    return {
      hasUpdate: Boolean(latestVersion) && compareVersions(latestVersion, currentVersion) > 0,
      latestVersion,
      currentVersion,
      channel,
      releaseInfo: {
        tag_name: releaseInfo.tag_name,
        body: releaseInfo.body || '',
        html_url: releaseInfo.html_url,
        assets: releaseInfo.assets || []
      }
    };
  } catch (error: any) {
    return {
      hasUpdate: false,
      latestVersion: '',
      currentVersion,
      channel,
      error: error?.message || '更新源暂时不可用。',
      releaseInfo: null
    };
  }
};
