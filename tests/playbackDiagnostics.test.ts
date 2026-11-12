import { describe, expect, it } from 'vitest';

import {
  beginPlaybackReport,
  playbackReportText,
  reportSources,
  updatePlaybackReport
} from '../src/renderer/services/playbackDiagnostics';
describe('playback diagnostics', () => {
  it('exports timing and source outcomes without raw URLs, headers or internal request IDs', () => {
    beginPlaybackReport('private-request-id', 'Song');
    reportSources(
      'private-request-id',
      [{ providerKey: 'p', ok: true, costMs: 350 }],
      new Map([['p', 'Music source']])
    );
    updatePlaybackReport('private-request-id', {
      status: 'playing',
      resolveMs: 350,
      bufferMs: 400
    });
    const text = playbackReportText();
    expect(text).not.toContain('private-request-id');
    const r = JSON.parse(text).reports[0];
    expect(r.resolveMs).toBe(350);
    expect(r.providers[0].name).toBe('Music source');
    expect(Object.keys(r)).not.toContain('url');
    expect(Object.keys(r)).not.toContain('headers');
  });
});
