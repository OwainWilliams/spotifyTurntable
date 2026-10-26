import { useEffect, useState } from 'react'

export interface AlbumColours {
  /** Darkened average, for the room-light background. */
  background: string
  /** The cover's most vivid hue at full neon brightness, for the jukebox. */
  neon: string
}

/** Used until a cover loads, and for covers with no real colour in them. */
const DEFAULT_NEON = '#ff4f8b'

/**
 * Samples the album art on a tiny canvas. The average colour tints the
 * background; the single most vivid pixel picks the neon. (Averaging for the
 * neon would turn most covers to mud.) Good enough without a library.
 */
export function useAlbumColour(url: string | null): AlbumColours {
  const [colours, setColours] = useState<AlbumColours>({ background: 'rgb(40, 34, 30)', neon: DEFAULT_NEON })

  useEffect(() => {
    if (!url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 8
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      let data: Uint8ClampedArray
      try {
        ctx.drawImage(img, 0, 0, 8, 8)
        data = ctx.getImageData(0, 0, 8, 8).data
      } catch {
        return // CORS-tainted canvas; keep the previous colours.
      }
      let r = 0, g = 0, b = 0
      let best = { score: 0, hue: 0, sat: 0 }
      for (let i = 0; i < data.length; i += 4) {
        const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]]
        r += pr; g += pg; b += pb
        // Vivid = saturated AND bright (HSV), so a dark navy loses to a red.
        const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb)
        const sat = max ? (max - min) / max : 0
        const score = sat * (max / 255)
        if (score > best.score) best = { score, hue: hueOf(pr, pg, pb), sat }
      }
      const n = data.length / 4
      setColours({
        // Darken so text stays readable on top.
        background: `rgb(${(r / n) * 0.35 | 0}, ${(g / n) * 0.35 | 0}, ${(b / n) * 0.35 | 0})`,
        // Black-and-white covers have no hue worth lighting up; keep the pink.
        neon: best.sat < 0.25 ? DEFAULT_NEON : `hsl(${best.hue} 90% 62%)`,
      })
    }
    img.onerror = () => { /* keep previous colours */ }
    img.src = url
  }, [url])

  return colours
}

/** Hue in degrees (0-359) of an RGB colour. */
export function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return Math.round(h * 60 + 360) % 360
}
