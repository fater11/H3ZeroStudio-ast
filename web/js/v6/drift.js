// Read-only descriptions of the generator's sampled RGB statistics.
// Numbers describe scene content; they do not constitute a quality verdict.
const finite = (v) => typeof v === "number" && Number.isFinite(v);

export function driftDisplay(drift, segmentIndex) {
  if (!drift || !drift.signature || !Number.isInteger(drift.baseline_segment)
      || drift.baseline_segment < 0 || drift.baseline_segment > segmentIndex) return null;
  const baselineIndex = drift.baseline_segment;
  const isBaseline = baselineIndex === segmentIndex;
  const relative = drift.relative || {};
  const stats = [];
  if (!isBaseline) {
    if (finite(relative.luma_delta)) {
      const n = relative.luma_delta * 100;
      stats.push({ key: "luma", value: `${n > 0 ? "+" : ""}${n.toFixed(1)} п.п.` });
    }
    if (finite(relative.contrast_ratio) && relative.contrast_ratio >= 0) {
      stats.push({ key: "contrast", value: `×${relative.contrast_ratio.toFixed(2)}` });
    }
    if (finite(relative.detail_ratio) && relative.detail_ratio >= 0) {
      stats.push({ key: "detail", value: `×${relative.detail_ratio.toFixed(2)}` });
    }
  }
  return { baselineIndex, isBaseline, stats };
}
