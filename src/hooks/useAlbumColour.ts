import { useEffect, useState } from 'react'

/**
 * Samples the album art on a tiny canvas and returns an average colour.
 * Good enough to tint the background per album without a library.
 */
export function useAlbumColour(url: string | null): string {
  const [colour, setColour] = useState('rgb(40, 34, 30)')

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
        return // CORS-tainted canvas; keep the previous colour.
      }
      let r = 0, g = 0, b = 0
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]
      }
      const n = data.length / 4
      // Darken so text stays readable on top.
      setColour(`rgb(${(r / n) * 0.35 | 0}, ${(g / n) * 0.35 | 0}, ${(b / n) * 0.35 | 0})`)
    }
    img.onerror = () => { /* keep previous colour */ }
    img.src = url
  }, [url])

  return colour
}
