import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merges conditional classNames (clsx) and resolves conflicting Tailwind
// utilities so the last one wins (twMerge) — used everywhere a component
// accepts a caller-supplied className override on top of its own defaults.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
