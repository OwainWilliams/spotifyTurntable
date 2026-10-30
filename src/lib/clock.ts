/** 213000 -> "3:33" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Playlist totals, which run past an hour: 3723000 -> "1:02:03", 213000 -> "3:33" */
export function longClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 3600) return clock(ms)
  const m = Math.floor(s / 60) % 60
  return `${Math.floor(s / 3600)}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** A two-digit-minutes LCD, as on Winamp: 213000 -> "03:33". Caps at 99:59. */
export function lcd(ms: number): string {
  const s = Math.min(Math.max(0, Math.floor(ms / 1000)), 99 * 60 + 59)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
