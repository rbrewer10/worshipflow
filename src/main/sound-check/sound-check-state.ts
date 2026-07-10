import { YamahaController } from '../yamaha/yamaha-controller'
import { AudioAnalyzer } from '../yamaha/audio-analyzer'
import { RecommendationEngine } from '../yamaha/recommendation-engine'
import { AudioCapture } from '../audio-capture'
import type { AutomationRule, ReferenceMix, SpectralProfile, Recommendation } from '../types/sound-check-types'
import {
  loadAutomationRules,
  saveAutomationRule as dbSaveAutomationRule,
  deleteAutomationRule as dbDeleteAutomationRule,
  loadReferenceMixes,
  saveReferenceMix as dbSaveReferenceMix
} from '../db'

/**
 * In-memory session state for the Sound Check Assistant, plus the three
 * engine instances (Yamaha mixer control, live audio analysis, and
 * reference-mix comparison) that IPC handlers operate on.
 *
 * Channel data is intentionally NOT duplicated here: YamahaController is the
 * single source of truth for channels (see state.yamaha.getChannels()).
 * Keeping a second channel map on this class would let the two drift apart.
 */
export class SoundCheckState {
  readonly yamaha: YamahaController
  readonly analyzer: AudioAnalyzer
  readonly engine: RecommendationEngine
  readonly audioCapture: AudioCapture

  automationRules: AutomationRule[] = []
  referenceMixes: ReferenceMix[] = []
  currentReferenceMixId: string | null = null

  // Live heuristics state (updated as audio frames arrive)
  private liveHeuristics: Recommendation[] = []
  private liveHeuristicsListeners: Set<(heuristics: Recommendation[]) => void> = new Set()

  constructor() {
    this.yamaha = new YamahaController()
    this.analyzer = new AudioAnalyzer()
    this.engine = new RecommendationEngine()
    this.audioCapture = new AudioCapture()

    // Wire audio capture → analyzer → recommendations
    this.audioCapture.on('frame', (frame) => {
      this.analyzer.pushAudioFrame(frame)
      const heuristics = this.analyzer.getHeuristics()
      this.updateLiveHeuristics(heuristics)
    })

    this.audioCapture.on('error', (err) => {
      console.error('[AudioCapture error]', err)
    })
  }

  /**
   * Load persisted automation rules and reference mixes from SQLite.
   * This is called once at app startup to restore user-configured rules
   * and reference profiles from the previous session.
   */
  async initialize(): Promise<void> {
    try {
      const storedRules = loadAutomationRules()
      this.automationRules = storedRules.map((r) => ({
        id: r.id,
        serviceItemType: r.service_item_type as AutomationRule['serviceItemType'],
        enabled: r.enabled,
        ...(r.scene_name_to_recall && { sceneNameToRecall: r.scene_name_to_recall }),
        ...(r.fader_adjustments && { faderAdjustments: r.fader_adjustments })
      }))

      const storedMixes = loadReferenceMixes()
      this.referenceMixes = storedMixes.map((m) => ({
        id: m.id,
        spectralProfile: m.spectral_profile,
        recordedAt: new Date(m.recorded_at),
        durationSeconds: m.duration_seconds,
        notes: m.notes || ''
      }))
    } catch (err) {
      console.error('[SoundCheckState] Failed to load persisted data:', err)
      // Silently continue with empty in-memory state if load fails
    }
  }

  /**
   * Upsert an automation rule for later playback during a service. If a rule
   * with the same id already exists it is replaced in place (preserving array
   * order, so the list doesn't reshuffle on edit); otherwise it is appended.
   * Persisted to SQLite for recovery across app restarts.
   */
  saveAutomationRule(rule: AutomationRule): void {
    const index = this.automationRules.findIndex((r) => r.id === rule.id)
    if (index >= 0) this.automationRules[index] = rule
    else this.automationRules.push(rule)

    // Persist to SQLite
    dbSaveAutomationRule({
      id: rule.id,
      serviceItemType: rule.serviceItemType,
      enabled: rule.enabled,
      sceneNameToRecall: rule.sceneNameToRecall,
      faderAdjustments: rule.faderAdjustments
    })
  }

  /**
   * Delete an automation rule by id. Idempotent: an unknown id is a no-op
   * rather than an error — callers (the IPC delete handler) don't need to
   * distinguish "already gone" from "never existed", and treating it as an
   * error would only surface spurious failures on a double-click.
   * Persisted to SQLite for recovery across app restarts.
   */
  deleteAutomationRule(id: string): void {
    const index = this.automationRules.findIndex((r) => r.id === id)
    if (index >= 0) this.automationRules.splice(index, 1)

    // Persist deletion to SQLite
    dbDeleteAutomationRule(id)
  }

  /** Automation rules that apply to a given service item type and are enabled. */
  getAutomationRulesForItemType(
    itemType: AutomationRule['serviceItemType']
  ): AutomationRule[] {
    return this.automationRules.filter(
      (rule) => rule.serviceItemType === itemType && rule.enabled
    )
  }

  /**
   * Record a reference mix from the given spectral profile and sync it into
   * the recommendation engine so subsequent live comparisons use it.
   *
   * durationSeconds and notes are supplied by the caller (the IPC handler)
   * rather than computed here: there is no microphone capture pipeline wired
   * up yet, so this class has no way to measure real elapsed recording time.
   * Real audio-duration tracking is deferred until that capture pipeline
   * exists.
   *
   * Persisted to SQLite for recovery across app restarts.
   */
  saveReferenceMix(
    profile: SpectralProfile,
    durationSeconds: number,
    notes: string
  ): ReferenceMix {
    const referenceMix: ReferenceMix = {
      id: crypto.randomUUID(),
      spectralProfile: profile,
      recordedAt: new Date(),
      durationSeconds,
      notes,
    }

    this.referenceMixes.push(referenceMix)
    this.currentReferenceMixId = referenceMix.id
    this.engine.setReferenceProfile(profile)

    // Persist to SQLite
    dbSaveReferenceMix({
      id: referenceMix.id,
      spectralProfile: profile,
      recordedAt: referenceMix.recordedAt,
      durationSeconds,
      notes
    })

    return referenceMix
  }

  /** Subscribe to live heuristics updates (one-way push from main to renderer). */
  subscribeLiveHeuristics(callback: (heuristics: Recommendation[]) => void): () => void {
    this.liveHeuristicsListeners.add(callback)
    // Return unsubscribe function
    return () => this.liveHeuristicsListeners.delete(callback)
  }

  /** Internal: update live heuristics and notify all listeners. */
  private updateLiveHeuristics(heuristics: Recommendation[]): void {
    this.liveHeuristics = heuristics
    for (const listener of this.liveHeuristicsListeners) {
      listener(heuristics)
    }
  }

  /** Get current live heuristics (snapshot). */
  getLiveHeuristics(): Recommendation[] {
    return this.liveHeuristics
  }
}
