import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Content Security Policy, as a <meta> tag because GitHub Pages can't send
 * headers. It limits what a stray script could do with the tokens in
 * localStorage: only our own code and Spotify's SDK may run, and data can
 * only go to Spotify.
 *
 * Build only: the dev server relies on inline scripts and a websocket for
 * hot reload. Inline scripts in the built page are allowed by hash, worked
 * out here so editing one can't leave a stale hash behind.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const marker = /<!-- csp:.*?-->/
      if (!marker.test(html)) throw new Error('index.html is missing its <!-- csp: --> marker')
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
        // Browsers hash the script after turning CRLF into LF, so do the same.
        .map(([, body]) => body.replace(/\r\n?/g, '\n'))
        .map((body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`)
      const policy = [
        "default-src 'self'",
        `script-src 'self' https://sdk.scdn.co ${hashes.join(' ')}`,
        // The SDK plays audio inside its own iframe from this host.
        'frame-src https://sdk.scdn.co',
        'connect-src https://api.spotify.com https://accounts.spotify.com',
        // Album art; data: for small assets Vite inlines.
        "img-src 'self' data: https://i.scdn.co https://*.spotifycdn.com https://mosaic.scdn.co",
        // React's style={{ }} props are inline styles.
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      // Right after <meta charset>, and before any script, since a CSP only
      // governs what comes after it.
      return html.replace(marker, `<meta http-equiv="Content-Security-Policy" content="${policy}" />`)
    },
  }
}

// BASE_PATH is set by the GitHub Pages build, which serves the app from
// /<repo>/ rather than the root. Locally it stays '/'.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), contentSecurityPolicy()],
})
