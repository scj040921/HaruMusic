import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const npxCommand = isWindows ? 'npx.cmd' : 'npx';
const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';

function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env,
    shell: isWindows
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function androidVersionCode(version, buildNumber = 1) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  const [, major, minor, patch] = match.map(Number);
  const code = major * 100_000_000 + minor * 1_000_000 + patch * 10_000 + buildNumber;
  if (code > 2_100_000_000) throw new Error(`Android versionCode exceeds limit: ${code}`);
  return code;
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = process.env.ANDROID_VERSION_NAME || pkg.version;
const buildNumber = Number(process.env.ANDROID_BUILD_NUMBER || '1');
const versionCode = Number(
  process.env.ANDROID_VERSION_CODE || androidVersionCode(version, buildNumber)
);
const buildType = (process.env.ANDROID_BUILD_TYPE || 'debug').toLowerCase();
if (!['debug', 'release'].includes(buildType)) {
  throw new Error(`Unsupported Android build type: ${buildType}`);
}
const supportedAbis = new Set(['arm64-v8a', 'armeabi-v7a', 'x86_64']);
const androidAbis = (process.env.ANDROID_ABI_FILTERS || 'arm64-v8a')
  .split(',')
  .map((abi) => abi.trim())
  .filter(Boolean);
if (androidAbis.length === 0 || androidAbis.some((abi) => !supportedAbis.has(abi))) {
  throw new Error(
    `ANDROID_ABI_FILTERS must contain one or more of: ${[...supportedAbis].join(', ')}.`
  );
}

const apiMode = (process.env.ANDROID_API_MODE || 'embedded').toLowerCase();
if (!['embedded', 'remote'].includes(apiMode)) {
  throw new Error('ANDROID_API_MODE must be embedded or remote.');
}
const apiUrl = apiMode === 'embedded' ? 'http://127.0.0.1:30488' : process.env.VITE_API;
if (!apiUrl) throw new Error('VITE_API is required when ANDROID_API_MODE=remote.');
const parsedApiUrl = new URL(apiUrl);
if (buildType === 'release' && apiMode === 'remote' && parsedApiUrl.protocol !== 'https:') {
  throw new Error('Release APKs with ANDROID_API_MODE=remote require an HTTPS VITE_API endpoint.');
}
const buildEnv = {
  ...process.env,
  CAPACITOR_BUILD: '1',
  CAPACITOR_ALLOW_MIXED_CONTENT:
    apiMode === 'embedded'
      ? '1'
      : buildType === 'debug' && parsedApiUrl.protocol === 'http:'
        ? '1'
        : '0',
  VITE_API: apiUrl,
  VITE_UPDATE_FEED_URL: process.env.VITE_UPDATE_FEED_URL || 'https://github.com/scj040921/haruapps/releases/download/harumusic-update-channels/android-{channel}.json',
  VITE_DEFAULT_UPDATE_CHANNEL: process.env.ANDROID_UPDATE_CHANNEL || 'stable'
};

if (apiMode === 'embedded') {
  const nodeProjectDir = join(root, 'deployment', 'android-node-api');
  run(
    npmCommand,
    ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    nodeProjectDir
  );
}

run(npmCommand, ['run', 'build'], root, buildEnv);

if (apiMode === 'embedded') {
  const rendererDir = resolve(root, 'out', 'renderer');
  const nodeProjectDir = resolve(root, 'deployment', 'android-node-api');
  const nodeProjectOutput = resolve(rendererDir, 'nodejs');
  const outputRelativePath = relative(rendererDir, nodeProjectOutput);
  if (
    !outputRelativePath ||
    outputRelativePath.startsWith(`..${sep}`) ||
    outputRelativePath === '..'
  ) {
    throw new Error('Refusing to stage the Android Node.js project outside the renderer output.');
  }
  rmSync(nodeProjectOutput, { recursive: true, force: true });
  cpSync(nodeProjectDir, nodeProjectOutput, {
    recursive: true,
    filter: (source) => !source.split(sep).includes('.git')
  });
}

run(npxCommand, ['cap', 'sync', 'android'], root, buildEnv);
run(
  gradleCommand,
  [
    buildType === 'release' ? 'assembleRelease' : 'assembleDebug',
    `-PappVersionName=${version}`,
    `-PappVersionCode=${versionCode}`,
    `-PandroidAbiFilters=${androidAbis.join(',')}`,
    '--no-daemon'
  ],
  join(root, 'android')
);

const sourceApk = join(
  root,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  buildType,
  `app-${buildType}.apk`
);
const outputDir = join(root, 'artifacts', 'android');
const outputApk = join(outputDir, `HaruMusic-${version}-android-${buildType}.apk`);
mkdirSync(outputDir, { recursive: true });
cpSync(sourceApk, outputApk);
console.log(`Android APK created: ${outputApk}`);
