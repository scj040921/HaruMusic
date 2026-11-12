import { ref } from 'vue';
export type PlaybackReport = {
  id: string;
  track: string;
  status: 'preparing' | 'buffering' | 'playing' | 'failed' | 'cancelled';
  startedAt: number;
  resolveMs: number;
  bufferMs: number;
  totalMs: number;
  attempts: number;
  providers: Array<{ name: string; ok: boolean; costMs: number }>;
  error?: string;
};
export const playbackReports = ref<PlaybackReport[]>([]);
export function beginPlaybackReport(id: string, track: string) {
  for (const report of playbackReports.value)
    if (['preparing', 'buffering'].includes(report.status)) report.status = 'cancelled';
  playbackReports.value = [
    {
      id,
      track,
      status: 'preparing' as const,
      startedAt: Date.now(),
      resolveMs: 0,
      bufferMs: 0,
      totalMs: 0,
      attempts: 0,
      providers: []
    },
    ...playbackReports.value
  ].slice(0, 5);
}
export function updatePlaybackReport(id: string, update: Partial<PlaybackReport>) {
  const report = playbackReports.value.find((r) => r.id === id);
  if (report) Object.assign(report, update, { totalMs: Date.now() - report.startedAt });
}
export function reportSources(
  id: string | undefined,
  attempts: Array<{ providerKey: string; costMs?: number; ok: boolean }>,
  names: Map<string, string>
) {
  if (!id) return;
  const report = playbackReports.value.find((r) => r.id === id);
  if (report)
    report.providers.push(
      ...attempts.map((a) => ({
        name: names.get(a.providerKey) || a.providerKey,
        ok: a.ok,
        costMs: a.costMs || 0
      }))
    );
}
export function playbackReportText() {
  return JSON.stringify(
    {
      version: 1,
      reports: playbackReports.value.map(({ id: _id, ...report }) => ({
        ...report,
        totalMs: ['preparing', 'buffering'].includes(report.status)
          ? Date.now() - report.startedAt
          : report.totalMs
      }))
    },
    null,
    2
  );
}
