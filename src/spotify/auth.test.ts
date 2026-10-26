import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// auth.ts (and the logger it imports) touch window and localStorage when they
// load, and tests run in Node. Minimal stand-ins, installed before importing.
const store = new Map<string, string>()
const location = { search: '', origin: 'https://example.test' }
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
})
vi.stubGlobal('window', { location, addEventListener: () => {}, setTimeout, clearTimeout })

let auth: typeof import('./auth')
beforeAll(async () => { auth = await import('./auth') })
beforeEach(() => { store.clear(); location.search = '' })

describe('isCallback', () => {
  it.each([
    ['?code=abc&state=xyz', true],
    ['?error=access_denied&state=xyz', true],
    ['?code=abc', false], // no state: not ours
    ['?state=xyz', false],
    ['', false],
  ])('%s -> %s', (search, expected) => {
    location.search = search
    expect(auth.isCallback()).toBe(expected)
  })
})

describe('isValidClientId', () => {
  it('accepts 32 hex characters, either case', () => {
    expect(auth.isValidClientId('0123456789abcdef0123456789ABCDEF')).toBe(true)
  })
  it.each(['', 'abc', '0123456789abcdef0123456789abcde', '0123456789abcdef0123456789abcdeg'])('rejects %j', (id) => {
    expect(auth.isValidClientId(id)).toBe(false)
  })
})

describe('client ID storage', () => {
  it('prefers the ID saved in the browser, and forgets tokens when it changes', () => {
    store.set('turntable.tokens', '{"accessToken":"a","refreshToken":"r","expiresAt":0}')
    auth.setClientId('  0123456789abcdef0123456789abcdef  ')
    expect(auth.getClientId()).toBe('0123456789abcdef0123456789abcdef')
    expect(auth.isLoggedIn()).toBe(false)
  })
})

describe('stored tokens', () => {
  it('treats corrupt storage as logged out instead of crashing', () => {
    store.set('turntable.tokens', '{not json')
    expect(auth.isLoggedIn()).toBe(false)
    expect(store.has('turntable.tokens')).toBe(false)
  })
})
