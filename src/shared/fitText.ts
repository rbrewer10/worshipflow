// Shrink-to-fit search for the audience output (QA B4 / A-H1).
//
// `fits(scale)` lays the text out at `scale` × the requested size and reports
// whether it fits its box. Returns the largest scale in [min, 1] that fits
// (1 when the requested size already fits; `min` if even that overflows).
// Pure + injected measurement so it's unit-testable without a DOM.
export function fitScale(fits: (scale: number) => boolean, opts: { min?: number; iterations?: number } = {}): number {
  const min = opts.min ?? 0.3
  const iterations = opts.iterations ?? 10
  if (fits(1)) return 1
  if (!fits(min)) return min
  let lo = min // fits
  let hi = 1 // overflows
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}
