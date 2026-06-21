import type { WorshipFlowApi } from './index'

declare global {
  interface Window {
    wf: WorshipFlowApi
  }
}
