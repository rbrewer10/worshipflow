import type { Transition, Variants } from 'framer-motion'

// Used for the "going live" confirmation and other state-flip moments —
// confident but not bouncy. Consumed by later stages (e.g. the Live tab's
// zone-armed indicator).
export const liveConfirmTransition: Transition = { type: 'spring', stiffness: 400, damping: 30 }

// Crossfade + slight rise, used for slide-advance and panel/tab switches.
export const fadeSlideVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12, ease: 'easeIn' } },
}
