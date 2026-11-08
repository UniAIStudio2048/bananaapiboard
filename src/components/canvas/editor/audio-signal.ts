const MEDIA_WAVEFORM_BUCKETS = 96
export function computeWaveformPeaks(samples: Float32Array | readonly number[], buckets = MEDIA_WAVEFORM_BUCKETS): readonly number[] {
  const size = Math.max(1, Math.floor(buckets))
  const length = samples.length
  if (!Number.isFinite(length) || length <= 0) return Object.freeze(new Array<number>(size).fill(0))
  const peaks = new Array<number>(size).fill(0)
  for (let bucket = 0; bucket < size; bucket += 1) {
    const start = Math.floor(bucket * length / size)
    const end = Math.max(start + 1, Math.floor((bucket + 1) * length / size))
    let maximum = 0
    for (let index = start; index < end && index < length; index += 1) {
      const value = Math.abs(samples[index])
      if (Number.isFinite(value) && value > maximum) maximum = value
    }
    peaks[bucket] = Math.round(Math.min(1, maximum) * 1000) / 1000
  }
  return Object.freeze(peaks)
}

export function computeWaveformPeaksFromChannels(channels: readonly (Float32Array | readonly number[])[], buckets = MEDIA_WAVEFORM_BUCKETS): readonly number[] {
  const usable = channels.filter((channel) => channel.length > 0)
  if (usable.length === 0) return computeWaveformPeaks(new Float32Array(0), buckets)
  const size = Math.max(1, Math.floor(buckets))
  const peaks = new Array<number>(size).fill(0)
  for (const channel of usable) {
    const channelPeaks = computeWaveformPeaks(channel, size)
    for (let index = 0; index < size; index += 1) peaks[index] = Math.max(peaks[index], channelPeaks[index])
  }
  return Object.freeze(peaks)
}

/**
 * Overview bars represent RMS energy across each complete time interval.
 * A single limiter peak must not make several seconds of quiet audio look loud.
 * Sum channel energies separately so opposite stereo phases cannot cancel.
 */
