import './lib/log'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
// Bundled fonts, so kiosk mode looks right offline. Each subset only loads
// when a character in its unicode-range is on screen.
import '@fontsource/instrument-serif/400.css'
import '@fontsource-variable/inter'
// Jukebox theme: neon marquee and typewritten title strips.
import '@fontsource/monoton/400.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'
// CD theme: dot-matrix lettering on the fluorescent display.
import '@fontsource/doto/700.css'
import '@fontsource/doto/900.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
