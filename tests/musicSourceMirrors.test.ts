import { describe, expect, it } from 'vitest';

import { getMusicSourceMirrorUrls } from '../src/renderer/services/musicSource/transport';

describe('MusicFree GitHub content mirrors', () => {
  it('maps the qwerwhr GitHub Pages catalog to jsDelivr and raw GitHub', () => {
    expect(
      getMusicSourceMirrorUrls('https://qwerwhr.github.io/musicfree-plugins/plugins.json')
    ).toEqual([
      'https://cdn.jsdelivr.net/gh/qwerwhr/musicfree-plugins@main/plugins.json',
      'https://raw.githubusercontent.com/qwerwhr/musicfree-plugins/main/plugins.json'
    ]);
  });

  it('maps Hebi plugin files to the same repository paths on both mirrors', () => {
    expect(
      getMusicSourceMirrorUrls(
        'https://hebijunge.github.io/musicfree-plugins/plugins/qq-source.plugin.v1.9.26.js'
      )
    ).toEqual([
      'https://cdn.jsdelivr.net/gh/hebijunge/musicfree-plugins@main/plugins/qq-source.plugin.v1.9.26.js',
      'https://raw.githubusercontent.com/hebijunge/musicfree-plugins/main/plugins/qq-source.plugin.v1.9.26.js'
    ]);
  });

  it('keeps the selected branch when converting jsDelivr plugin URLs', () => {
    expect(
      getMusicSourceMirrorUrls(
        'https://cdn.jsdelivr.net/gh/qwerwhr/musicfree-plugins@main/5sing.js'
      )
    ).toEqual(['https://raw.githubusercontent.com/qwerwhr/musicfree-plugins/main/5sing.js']);
  });
});
