import Operator from './Operator'
import Output from './Output'

// Role by route: the same bundle renders the operator control surface or a
// "dumb" fullscreen output, decided by the window's hash (#/output).
function App(): JSX.Element {
  const isOutput = window.location.hash.startsWith('#/output')
  return isOutput ? <Output /> : <Operator />
}

export default App
