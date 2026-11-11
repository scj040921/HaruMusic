import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash, sign } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const channel = process.env.CHANNEL;
const version = process.env.VERSION;
const tag = process.env.TAG;
const buildType = process.env.BUILD_TYPE || 'release';
const signingKey = process.env.ANDROID_UPDATE_SIGNING_KEY;
if (!['nightly', 'acceptance', 'stable'].includes(channel || '') || !version || !tag) {
  throw new Error('CHANNEL, VERSION, and TAG are required to write the update manifest.');
}
if (!signingKey) throw new Error('ANDROID_UPDATE_SIGNING_KEY is required to sign the update manifest.');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const outputDir = fileURLToPath(new URL('../artifacts/android/', import.meta.url));
mkdirSync(outputDir, { recursive: true });
const apkName = `HaruMusic-${version}-android-${buildType}.apk`;
const repository = process.env.RELEASE_REPOSITORY || 'scj040921/haruapps';
const releaseUrl = `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`;
const apkUrl = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(apkName)}`;
const apkPath = join(outputDir, apkName);
const sha256 = createHash('sha256').update(readFileSync(apkPath)).digest('hex');
const manifest = {
  appId: pkg.build.appId,
  sourceCommit: process.env.SOURCE_COMMIT || '',
  generatedAt: new Date().toISOString(),
  channels: {
    [channel]: {
      version,
      tag_name: tag,
      name: `HaruMusic ${version}`,
      body: process.env.NOTES || '',
      published_at: new Date().toISOString(),
      html_url: releaseUrl,
      assets: [{ name: apkName, browser_download_url: apkUrl, size: statSync(apkPath).size, sha256 }]
    }
  }
};

const payload = Buffer.from(JSON.stringify(manifest), 'utf8');
const envelope = { format: 'harumusic-update-v1', data: payload.toString('base64'), signature: sign('RSA-SHA256', payload, signingKey).toString('base64') };
writeFileSync(join(outputDir, `android-${channel}.json`), `${JSON.stringify(envelope, null, 2)}\n`);
console.log(`Wrote Android update manifest for ${channel} ${version}`);
