import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'

interface Props {
  /** Changes when the track changes; picks the simulated tempo. */
  trackKey: string | null
  playing: boolean
  /** 0..1, so the meter drops when you turn it down. */
  volume: number
}

const SEGMENTS = 12

/**
 * Stereo LED meter. It is SIMULATED: Spotify's audio is DRM-protected, so the
 * page cannot read the samples, and the beat-data API is closed to new apps.
 * Instead each track gets a steady pseudo-tempo (88-130 BPM, derived from its
 * name) and the bars kick on every beat, with VU-style fast attack and slow
 * release.
 *
 * Performance: the animation runs at 60fps, so it doesn't go through React
 * state (that would re-render every frame). The rAF loop writes one CSS
 * variable, --level, per channel straight onto the DOM, and CSS works out
 * which segments are lit. .NET analogy: updating a Canvas directly instead of
 * raising PropertyChanged 60 times a second.
 */
export function VuMeter({ trackKey, playing, volume }: Props) {
  /** The two bar elements (L, R), filled in by callback refs. */
  const channels = useRef<(HTMLDivElement | null)[]>([null, null])
  // The loop reads the latest props from here, so it never has to restart.
  const live = useRef({ playing, volume, bpm: 110 })
  useLayoutEffect(() => {
    live.current = { playing, volume, bpm: trackKey ? tempoFor(trackKey) : 110 }
  })

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let beats = 0                // beats elapsed, fractional
    const level = [0, 0]
    const wobble = [0, 0]        // slow random drift so L and R differ

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const { playing, volume, bpm } = live.current
      beats += (dt * bpm) / 60

      const t = beats % 1                              // 0 at each beat
      const accent = Math.floor(beats) % 4 === 0 ? 1 : 0.8
      const kick = Math.exp(-t * 3) * accent           // sharp hit, decays over the beat
      const hat = 0.35 * Math.exp(-((t + 0.5) % 1) * 10) // smaller off-beat

      channels.current.forEach((el, c) => {
        wobble[c] = Math.min(Math.max(wobble[c] * 0.98 + (Math.random() - 0.5) * dt * 3, -0.15), 0.15)
        // sqrt: loudness isn't linear in the slider, and this keeps the meter
        // lively at moderate volume. At 80% beats reach amber, accents red.
        const target = playing ? Math.sqrt(volume) * (0.35 + 0.6 * kick + 0.15 * hat + wobble[c]) : 0
        // Real meters jump up fast and fall back slowly.
        const rate = target > level[c] ? 60 : 6
        level[c] += (target - level[c]) * Math.min(1, dt * rate)
        el?.style.setProperty('--level', level[c].toFixed(3))
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="vu" aria-hidden="true">
      {['L', 'R'].map((label, c) => (
        <div className="vu-channel" key={c}>
          <div className="vu-bars" ref={(el) => { channels.current[c] = el }}>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <span
                key={i}
                className={`vu-seg ${i >= SEGMENTS - 2 ? 'red' : i >= SEGMENTS - 4 ? 'amber' : ''}`}
                style={{ '--i': i } as CSSProperties}
              />
            ))}
          </div>
          <small>{label}</small>
        </div>
      ))}
    </div>
  )
}

/** Stable pseudo-tempo per track: a string hash mapped to 88-130 BPM. */
export function tempoFor(key: string): number {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  return 88 + (h % 43)
}
