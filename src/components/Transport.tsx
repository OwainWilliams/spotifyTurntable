import type { CSSProperties } from 'react'
import { CrateIcon, ExpandIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, ShrinkIcon, VolumeIcon } from './icons'

interface Props {
  paused: boolean
  hasTrack: boolean
  volume: number
  isFullscreen: boolean
  onToggle: () => void
  onPrevious: () => void
  onNext: () => void
  onVolume: (v: number) => void
  onCrate: () => void
  onFullscreen: () => void
}

/** Playback and display controls. Fades out with the cursor when idle. */
export function Transport(p: Props) {
  return (
    <div className="transport">
      <div className="buttons">
        <button className="icon-btn" onClick={p.onPrevious} disabled={!p.hasTrack} aria-label="Previous track"><PrevIcon /></button>
        <button className="play-btn" onClick={p.onToggle} disabled={!p.hasTrack} aria-label={p.paused ? 'Play' : 'Pause'}>
          {p.paused ? <PlayIcon size={26} /> : <PauseIcon size={26} />}
        </button>
        <button className="icon-btn" onClick={p.onNext} disabled={!p.hasTrack} aria-label="Next track"><NextIcon /></button>
      </div>

      <label className="volume" title="Volume (↑ ↓)">
        <VolumeIcon size={18} />
        <input
          type="range" min={0} max={1} step={0.01}
          value={p.volume}
          onChange={(e) => p.onVolume(Number(e.target.value))}
          // Paints the filled part of the track; see .volume input in CSS.
          style={{ '--pct': `${p.volume * 100}%` } as CSSProperties}
          aria-label="Volume"
        />
      </label>

      <div className="secondary">
        <button className="text-btn" onClick={p.onCrate} title="Crate (C)"><CrateIcon size={18} /> Crate</button>
        <button className="icon-btn small" onClick={p.onFullscreen} aria-label={p.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} title="Fullscreen (F)">
          {p.isFullscreen ? <ShrinkIcon size={18} /> : <ExpandIcon size={18} />}
        </button>
      </div>
    </div>
  )
}
