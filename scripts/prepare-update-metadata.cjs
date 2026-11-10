const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');

const outputDir = process.argv[2] || 'dist';
const version = require('../package.json').version;
const notesPath = path.join('.github', 'release-notes', `v${version}.md`);
const metadataPath = path.join(outputDir, 'latest.yml');
const metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
if (metadata.version !== version || !Array.isArray(metadata.files) || metadata.files.length !== 1) {
  throw new Error('Update metadata does not match the package version or expected file count');
}
const item = metadata.files[0];
if (typeof item.url !== 'string' || path.basename(item.url) !== item.url || !item.url.endsWith('-win-x64.exe')) {
  throw new Error('Unexpected Windows installer name in update metadata');
}
const installer = fs.readFileSync(path.join(outputDir, item.url));
const hash = crypto.createHash('sha512').update(installer).digest('base64');
if (hash !== item.sha512 || item.size !== installer.length || metadata.sha512 !== hash || metadata.path !== item.url) {
  throw new Error('Installer does not match the update metadata');
}
metadata.releaseNotes = fs.readFileSync(notesPath, 'utf8').trim();
fs.writeFileSync(metadataPath, yaml.dump(metadata, { lineWidth: -1, noRefs: true }));
console.log(`Verified update metadata and release notes for ${version}`);
