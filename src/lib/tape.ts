/**
 * The cassette theme treats the album or playlist as one tape: the tracks
 * laid end to end, so winding past the end of one runs on into the next.
 */

/** Where `tapeMs` (time from the start of the tape) falls: which track, how far in. */
export function locate(durations: number[], tapeMs: number): { index: number; positionMs: number } {
  let rest = Math.max(tapeMs, 0)
  for (let i = 0; i < durations.length; i++) {
    if (rest < durations[i] || i === durations.length - 1) {
      // Wound right to the end: stop just short, rather than on the last
      // millisecond, so there is still something left to play.
      return { index: i, positionMs: Math.min(rest, Math.max(durations[i] - 1000, 0)) }
    }
    rest -= durations[i]
  }
  return { index: -1, positionMs: 0 }
}

/**
 * A mechanical counter's three drums, as continuous positions (0-10; 10 shows
 * 0 again, on the way round). The ones drum turns smoothly; each drum to its
 * left only moves while the one to its right goes from 9 to 0, as on a real
 * odometer.
 */
export function odometer(value: number): [number, number, number] {
  const v = ((value % 1000) + 1000) % 1000
  const ones = v % 10
  const carry = Math.max(0, ones - 9)
  const tens = Math.floor(v / 10) % 10
  const hundreds = Math.floor(v / 100)
  return [hundreds + (tens === 9 ? carry : 0), tens + carry, ones]
}
