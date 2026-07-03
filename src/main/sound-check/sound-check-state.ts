import { YamahaController } from '../yamaha/yamaha-controller'
import { AudioAnalyzer } from '../yamaha/audio-analyzer'
import { RecommendationEngine } from '../yamaha/recommendation-engine'
import type { AutomationRule, ReferenceMix, SpectralProfile } from '../types/sound-check-types'

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

  automationRules: AutomationRule[] = []
  referenceMixes: ReferenceMix[] = []
  currentReferenceMixId: string | null = null

  constructor() {
    this.yamaha = new YamahaController()
    this.analyzer = new AudioAnalyzer()
    this.engine = new RecommendationEngine()
  }

  /**
   * Reserved for future persistence loading (automation rules / reference
   * mixes from SQLite). No persistence exists yet, so this is currently a
   * no-op — kept as an async hook so callers don't need to change when
   * loading is added.
   */
  async initialize(): Promise<void> {
    // Intentionally empty: see doc comment above.
  }

  /**
   * Save an automation rule for later playback during a service.
   * TODO: persist to SQLite — rules are in-memory only for now and are lost
   * on app restart.
   */
  saveAutomationRule(rule: AutomationRule): void {
    this.automationRules.push(rule)
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
   * TODO: persist to SQLite — reference mixes are in-memory only for now and
   * are lost on app restart.
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

    return referenceMix
  }
}
