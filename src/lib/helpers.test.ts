// Unit tests for the small pure functions that are easy to get subtly wrong.
// Run with `npm test`. .NET analogy: an xUnit project, with describe/it as
// the test class and [Fact]s, and expect() as Assert.
import { describe, expect, it } from 'vitest'
import { clock, lcd, longClock } from './clock'
import { contextLabel } from './contextLabel'
import { codeFor, PER_PAGE } from '../components/Jukebox'
import { hueOf } from '../hooks/useAlbumColour'
import { tempoFor } from '../components/VuMeter'
import { calendarWindow } from '../components/CdPlayer'
import { nextTheme, parseTheme } from '../hooks/useTheme'
import { locate, odometer } from './tape'

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

describe('longClock / lcd', () => {
  it('adds hours only past an hour', () => {
    expect(longClock(213_000)).toBe('3:33')
    expect(longClock(3_723_000)).toBe('1:02:03')
  })
  it('pads the minutes to two digits, and caps at 99:59', () => {
    expect(lcd(213_000)).toBe('03:33')
    expect(lcd(-1)).toBe('00:00')
    expect(lcd(10_000_000)).toBe('99:59')
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
  it('cycles turntable -> jukebox -> cd -> cassette -> winamp and back round', () => {
    expect(nextTheme('turntable')).toBe('jukebox')
    expect(nextTheme('jukebox')).toBe('cd')
    expect(nextTheme('cd')).toBe('cassette')
    expect(nextTheme('cassette')).toBe('winamp')
    expect(nextTheme('winamp')).toBe('turntable')
  })
  it('reads back a stored theme, and treats anything else as the turntable', () => {
    expect(parseTheme('cd')).toBe('cd')
    expect(parseTheme('cassette')).toBe('cassette')
    expect(parseTheme('winamp')).toBe('winamp')
    expect(parseTheme('jukebox')).toBe('jukebox')
    expect(parseTheme(null)).toBe('turntable')
    expect(parseTheme('reel-to-reel')).toBe('turntable')
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

describe('locate (cassette winding across songs)', () => {
  const tape = [180_000, 240_000, 200_000]
  it('finds the song and the place in it', () => {
    expect(locate(tape, 90_000)).toEqual({ index: 0, positionMs: 90_000 })
    expect(locate(tape, 180_000)).toEqual({ index: 1, positionMs: 0 })
    expect(locate(tape, 500_000)).toEqual({ index: 2, positionMs: 80_000 })
  })
  it('stops at the ends of the tape', () => {
    expect(locate(tape, -5_000)).toEqual({ index: 0, positionMs: 0 })
    expect(locate(tape, 999_000)).toEqual({ index: 2, positionMs: 199_000 })
  })
  it('has nowhere to go on an empty tape', () => {
    expect(locate([], 1_000)).toEqual({ index: -1, positionMs: 0 })
  })
})

describe('odometer (cassette tape counter)', () => {
  it('turns the ones drum smoothly and leaves the others still', () => {
    expect(odometer(125.5)).toEqual([1, 2, 5.5])
  })
  it('carries into the next drum only as the ones go from 9 to 0', () => {
    expect(odometer(129.5)).toEqual([1, 2.5, 9.5])
    expect(odometer(199.25)).toEqual([1.25, 9.25, 9.25])
  })
  it('wraps round past 999, and below 000 when rewound past zero', () => {
    expect(odometer(1003)).toEqual([0, 0, 3])
    expect(odometer(-1)).toEqual([9, 9, 9])
  })
})
