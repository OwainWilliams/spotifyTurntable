/**
 * Inline SVG icons (24x24, stroke-based, after Lucide). Inline rather than a
 * package: eight icons don't justify a dependency, and they inherit
 * currentColor so CSS controls their colour.
 */
import type { ReactNode } from 'react'

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      {children}
    </svg>
  )
}

type P = { size?: number }

export const PlayIcon = (p: P) => <Icon {...p}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none" /></Icon>
export const PauseIcon = (p: P) => <Icon {...p}><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /></Icon>
export const PrevIcon = (p: P) => <Icon {...p}><path d="M19 20 9 12l10-8v16Z" fill="currentColor" /><path d="M5 19V5" /></Icon>
export const NextIcon = (p: P) => <Icon {...p}><path d="m5 4 10 8-10 8V4Z" fill="currentColor" /><path d="M19 5v14" /></Icon>
export const VolumeIcon = (p: P) => <Icon {...p}><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></Icon>
export const CrateIcon = (p: P) => <Icon {...p}><path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></Icon>
export const ExpandIcon = (p: P) => <Icon {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></Icon>
export const ShrinkIcon = (p: P) => <Icon {...p}><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></Icon>
