// Unit tests for the small pure functions that are easy to get subtly wrong.
// Run with `npm test`. .NET analogy: an xUnit project, with describe/it as
// the test class and [Fact]s, and expect() as Assert.
import { describe, expect, it } from 'vitest'
import { clock } from './clock'
import { contextLabel } from './contextLabel'
import { codeFor, PER_PAGE } from '../components/Jukebox'
import { hueOf } from '../hooks/useAlbumColour'
import { tempoFor } from '../components/VuMeter'
import { calendarWindow } from '../components/CdPlayer'
import { nextTheme, parseTheme } from '../hooks/useTheme'

describe('codeFor (jukebox strip codes)', () => {
  it('runs down each column, then across', () => {
    expect([0, 5, 6, 11, 12, 17].map(codeFor)).toEqual(['A1', 'A6', 'B1', 'B6', 'C1', 'C6'])
  })
  it('gives each page its own letters', () => {
    expect(codeFor(PER_PAGE)).toBe('D1')
    expect(codeFor(2 * PER_PAGE - 1)).toBe('F6')
  })
  it('skips I and O, as real jukeboxes did', () => {
    expect(codeFor(2 * PER_PAGE + 12)).toBe('J1') // G, H, then J
    const all = Array.from({ length: 8 * PER_PAGE }, (_, i) => codeFor(i))
    expect(all.some((c) => /^[IO]/.test(c))).toBe(false)
  })
  it('ends at Z6 on the last of 8 pages', () => {
    expect(codeFor(8 * PER_PAGE - 1)).toBe('Z6')
  })
})

describe('hueOf', () => {
  it.each([
    [[255, 0, 0], 0],
    [[255, 255, 0], 60],
    [[0, 255, 0], 120],
    [[0, 0, 255], 240],
    [[255, 0, 255], 300],
  ] as const)('%j is %i degrees', ([r, g, b], hue) => {
    expect(hueOf(r, g, b)).toBe(hue)
  })
  it('treats greys as hue 0 rather than NaN', () => {
    expect(hueOf(90, 90, 90)).toBe(0)
  })
})

describe('clock', () => {
  it.each([
    [0, '0:00'],
    [59_999, '0:59'],
    [213_000, '3:33'],
    [3_600_000, '60:00'],
    [-500, '0:00'],
  ])('%i ms -> %s', (ms, text) => {
    expect(clock(ms)).toBe(text)
  })
})

describe('contextLabel', () => {
  it.each([
    ['spotify:playlist:abc', 'Playlist'],
    ['spotify:album:abc', 'Album'],
    ['spotify:artist:abc', 'Artist'],
    ['spotify:user:someone:collection', 'Liked Songs'],
    [null, 'Up next'],
  ])('%s -> %s', (uri, label) => {
    expect(contextLabel(uri)).toBe(label)
  })
})

describe('tempoFor (simulated VU tempo)', () => {
  it('is stable for a track and within a believable range', () => {
    expect(tempoFor('Song|Artist')).toBe(tempoFor('Song|Artist'))
    for (const key of ['a', 'The Unforgiven II|Metallica', 'x'.repeat(500)]) {
      expect(tempoFor(key)).toBeGreaterThanOrEqual(88)
      expect(tempoFor(key)).toBeLessThanOrEqual(130)
    }
  })
})

describe('nextTheme / parseTheme', () => {
  it('cycles turntable -> jukebox -> cd and back round', () => {
    expect(nextTheme('turntable')).toBe('jukebox')
    expect(nextTheme('jukebox')).toBe('cd')
    expect(nextTheme('cd')).toBe('turntable')
  })
  it('reads back a stored theme, and treats anything else as the turntable', () => {
    expect(parseTheme('cd')).toBe('cd')
    expect(parseTheme('jukebox')).toBe('jukebox')
    expect(parseTheme(null)).toBe('turntable')
    expect(parseTheme('cassette')).toBe('turntable')
  })
})

describe('calendarWindow (CD track calendar)', () => {
  it('shows the first 20 of a long disc, with OVER lit', () => {
    expect(calendarWindow(3, 45)).toEqual({ first: 0, shown: 20, over: true })
  })
  it('moves to the block holding the playing track', () => {
    expect(calendarWindow(20, 45)).toEqual({ first: 20, shown: 20, over: true })
    expect(calendarWindow(44, 45)).toEqual({ first: 40, shown: 5, over: false })
  })
  it('shows the first block when nothing in the list is playing', () => {
    expect(calendarWindow(-1, 12)).toEqual({ first: 0, shown: 12, over: false })
    expect(calendarWindow(-1, 0)).toEqual({ first: 0, shown: 0, over: false })
  })
})
