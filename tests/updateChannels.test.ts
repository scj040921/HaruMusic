import { generateKeyPairSync, sign } from 'node:crypto';

import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { compareVersions, getLatestReleaseInfo, verifySignedUpdateManifest } from '@/utils/update';

const release = (tag_name: string, prerelease: boolean, published_at = '2026-11-11T00:00:00Z') => ({
  tag_name,
  prerelease,
  draft: false,
  body: tag_name,
  published_at,
  html_url: `https://github.com/scj040921/HaruMusic/releases/tag/${tag_name}`,
  assets: []
});

describe('Android release channels', () => {
  afterEach(() => vi.restoreAllMocks());

  it('compares semantic prerelease versions in the expected order', () => {
    expect(compareVersions('0.2.0-nightly.12', '0.2.0-nightly.9')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0-rc.2', '0.2.0-rc.10')).toBeLessThan(0);
    expect(compareVersions('0.2.0', '0.2.0-rc.99')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0', '0.1.99')).toBeGreaterThan(0);
  });

  it('accepts a signed channel manifest and rejects altered data', async () => {
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const payload = Buffer.from(
      JSON.stringify({ channels: { nightly: { version: '0.2.0-nightly.1' } } })
    );
    const envelope = {
      format: 'harumusic-update-v1',
      data: payload.toString('base64'),
      signature: sign('RSA-SHA256', payload, keys.privateKey).toString('base64')
    };
    await expect(verifySignedUpdateManifest(envelope, keys.publicKey)).resolves.toMatchObject({
      channels: { nightly: { version: '0.2.0-nightly.1' } }
    });
    envelope.data = Buffer.from('{"channels":{}}').toString('base64');
    await expect(verifySignedUpdateManifest(envelope, keys.publicKey)).rejects.toThrow(
      '签名验证失败'
    );
  });

  it('selects the newest stable release and excludes previews', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: [release('v0.3.0', true), release('v0.2.1', false), release('v0.2.0', false)]
    } as any);

    await expect(getLatestReleaseInfo('stable')).resolves.toMatchObject({ tag_name: 'v0.2.1' });
  });

  it('selects the newest acceptance and nightly builds by semantic version', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: [
        release('acceptance-0.3.0-rc.2', true),
        release('acceptance-0.3.0-rc.10', true),
        release('nightly-0.3.1-nightly.4', true),
        release('nightly-0.3.1-nightly.13', true)
      ]
    } as any);

    await expect(getLatestReleaseInfo('acceptance')).resolves.toMatchObject({
      tag_name: 'acceptance-0.3.0-rc.10'
    });
    await expect(getLatestReleaseInfo('nightly')).resolves.toMatchObject({
      tag_name: 'nightly-0.3.1-nightly.13'
    });
  });
});
