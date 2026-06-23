import Output from './Output'
import Stage from './Stage'
import AppShell from './AppShell'

// Operator-UI color theme (still referenced by LiveView's theme switcher). The flat shell
// is the default look; the projector slide themes are separate (see shared/themes.ts).
export type ThemeType = 'modern-church' | 'minimalist' | 'vibrant' | 'dark-premium'

function App(): JSX.Element {
  const hash = window.location.hash
  if (hash.startsWith('#/output')) return <Output />
  if (hash.startsWith('#/stage')) return <Stage />
  return <AppShell />
}

export default App
