import { useEffect } from 'react'
import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'

// The Live tab: the click-a-slide grid + the right-hand tools panel.
// (The loaded service + output preview live in the shell's left rail.)
function LiveView(): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Don't intercept while typing in a field.
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); window.wf.sendIntent('next') }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); window.wf.sendIntent('prev') }
      else if (e.key.toLowerCase() === 'b') window.wf.sendIntent('black')
      else if (e.key.toLowerCase() === 'l') window.wf.sendIntent('logo')
      else if (e.key.toLowerCase() === 's') window.wf.sendIntent('lyrics')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full min-h-0">
      <SlideGrid />
      <LiveTools />
    </div>
  )
}

export default LiveView
