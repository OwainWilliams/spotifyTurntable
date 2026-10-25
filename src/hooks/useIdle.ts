import { useEffect, useState } from 'react'

/** True after `ms` with no mouse/keyboard activity. Used to hide the cursor and controls. */
export function useIdle(ms = 3000): boolean {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), ms)
    const reset = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart']
    events.forEach((e) => window.addEventListener(e, reset))
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [ms])

  return idle
}
