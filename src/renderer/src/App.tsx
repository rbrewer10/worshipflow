import Output from './Output'
import Stage from './Stage'
import AppShell from './AppShell'
import SongEditor from './editor/SongEditor'
import ServiceEditor from './ServiceEditor'

// Operator-UI color theme (still referenced by LiveView's theme switcher). The flat shell
// is the default look; the projector slide themes are separate (see shared/themes.ts).
export type ThemeType = 'modern-church' | 'minimalist' | 'vibrant' | 'dark-premium'

function App(): JSX.Element {
  const hash = window.location.hash
  if (hash.startsWith('#/output')) return <Output />
  if (hash.startsWith('#/stage')) return <Stage />
  if (hash.startsWith('#/editor')) {
    const songId = parseInt(new URLSearchParams(window.location.search).get('songId') ?? '0', 10)
    return (
      <div className="flex h-screen flex-col bg-[#0b0b0f] p-4 text-white">
        <SongEditor songId={songId} />
      </div>
    )
  }
  if (hash.startsWith('#/service')) {
    const serviceId = parseInt(new URLSearchParams(window.location.search).get('serviceId') ?? '0', 10)
    return (
      <div className="flex h-screen flex-col bg-[#0b0b0f] p-3 text-white">
        <ServiceEditor serviceId={serviceId} />
      </div>
    )
  }
  return <AppShell />
}

export default App
