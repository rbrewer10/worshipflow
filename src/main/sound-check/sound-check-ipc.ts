import { ipcMain } from 'electron'
import type { SoundCheckState } from './sound-check-state'
import type { AutomationRule } from '../types/sound-check-types'

/**
 * Register all `wf:sound-check:*` IPC handlers against a single shared
 * SoundCheckState instance. Errors thrown by the underlying engines
 * (YamahaController, SoundCheckState) are intentionally left to propagate —
 * ipcMain.handle turns a thrown error into a rejected promise on the
 * renderer side, matching the rest of this codebase's IPC handlers.
 */
export function registerSoundCheckHandlers(state: SoundCheckState): void {
  ipcMain.handle('wf:sound-check:init', async (_e, manualIp?: string) => {
    await state.yamaha.autoDiscover(manualIp)
    return await state.yamaha.fetchChannels()
  })

  ipcMain.handle('wf:sound-check:getChannels', () => {
    return state.yamaha.getChannels()
  })

  ipcMain.handle(
    'wf:sound-check:setChannelClassification',
    (_e, channelId: number, property: 'isMic' | 'isBackingTrack', value: boolean) => {
      // getLoadedChannel returns the same object reference stored in
      // YamahaController's internal channel Map, not a copy — mutating it
      // here is what makes the change visible everywhere else that reads
      // channel state, without this class keeping a second, driftable
      // channel map. It also distinguishes "channels never loaded" from
      // "bad channel id" with a clearer error than a plain .find() would.
      const channel = state.yamaha.getLoadedChannel(channelId)
      channel[property] = value
    }
  )

  ipcMain.handle('wf:sound-check:muteChannel', async (_e, channelId: number, mute: boolean) => {
    await state.yamaha.muteChannel(channelId, mute)
  })

  ipcMain.handle('wf:sound-check:setFader', async (_e, channelId: number, db: number) => {
    await state.yamaha.setFader(channelId, db)
  })

  ipcMain.handle('wf:sound-check:recallScene', async (_e, sceneName: string) => {
    await state.yamaha.recallScene(sceneName)
  })

  ipcMain.handle(
    'wf:sound-check:recordReferenceMix',
    (_e, durationSeconds: number, notes: string) => {
      const profile = state.analyzer.computeSpectralProfile()
      return state.saveReferenceMix(profile, durationSeconds, notes)
    }
  )

  ipcMain.handle('wf:sound-check:saveAutomationRule', (_e, rule: AutomationRule) => {
    state.saveAutomationRule(rule)
    return rule
  })

  ipcMain.handle('wf:sound-check:getAutomationRules', () => {
    return state.automationRules
  })
}
