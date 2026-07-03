# Yamaha TF-Rack Sound Check Assistant — Design Spec

> Integrated sound management module for WorshipFlow. Help volunteers set up, test, and automatically manage the Yamaha TF-Rack during Sunday services with AI-powered audio recommendations.

**Goal:** A built-in Sound Check Assistant that connects to the existing Yamaha TF-Rack setup, guides pre-service audio checks, and automates mixer management during live service based on the service flow.

---

## Architecture

The Sound Check Assistant is a new module within WorshipFlow (not a separate app), living as a tab in the operator window alongside Song Library, Services, and Live.

### Components

**1. Yamaha Controller**
- Communicates with TF-Rack via WiFi using OSC (Open Sound Control) protocol
- Auto-discovers the Yamaha device on the local network
- Reads current channel names, fader positions, mute states
- Sends commands: mute/unmute channels, recall scenes, adjust faders
- Receives real-time state updates from the mixer

**2. Audio Analyzer**
- Captures input from two audience mics (USB audio interface or Yamaha direct feed)
- Real-time heuristic detection:
  - Feedback detection (sustained frequency spike + high volume)
  - Clipping detection (audio peaks near maximum)
  - Overall volume monitoring (is it in the "good" range?)
  - Dropout detection (unexpected silence)
- Calculates audio fingerprints (spectral profile, dynamic range, presence peaks) for comparison to reference mix

**3. Recommendation Engine**
- Compares current audio to the stored "good reference mix" (spectral fingerprint)
- Generates actionable suggestions: "Feedback on channel 4 — lower fader 3dB" or "Vocals are 15% quieter than reference — raise by +2dB"
- Prioritizes heuristic alerts (feedback/clipping) over reference comparisons
- Returns recommendations as a list with suggested actions

**4. WorshipFlow Integration**
- Reads live service state: which item is currently live, its type (song/scripture/announcement), duration
- Applies automation rules: when item type changes, adjust the mixer (e.g., "during announcements, mute backing track")
- Syncs scene recalls: if the service item has a saved mixer scene, recall it automatically
- Maintains manual override: engineer can adjust at any time; automation doesn't fight them

### Data Flow

```
Service Item Changes (live)
    ↓
Sound Check Auto Mode reads item type
    ↓
Applies automation rules (mute, scene recall, fader adjustments)
    ↓
Yamaha Controller sends commands to mixer

Audience Mics → Audio Analyzer
    ↓
Calculates fingerprint, runs heuristics
    ↓
Recommendation Engine compares to reference
    ↓
UI shows real-time suggestions & waveforms
```

---

## Workflows

### Setup (One-time Configuration)

1. **Connect to Yamaha:** Module auto-discovers TF-Rack on WiFi, imports all channel names from existing iPad app setup
2. **Classify channels:** Quick checkboxes: "Which channels are mics? Which are backing tracks?"
3. **Define automation rules:** 
   - Map service item types (song/announcement/prayer/scripture) → mixer scenes or fader adjustments
   - Example: "During worship songs → recall 'Worship' scene, mute click track, raise vocal mics +2dB"
4. **Record reference mix:** Capture 5–10 minutes from a good Sunday morning (when everything sounded right)
5. **Done:** Configuration is saved; reused every week

### Sound Check (Pre-Service, ~15 min)

1. **Operator clicks "Start Sound Check"**
2. **Step-by-step guide** with checkboxes:
   - "Test worship leader mic: have them sing a few bars. Does it sound good?"
   - "Test backing track: play a sample. Volume OK?"
   - "Test pastor mic: have them speak. Clear and loud enough?"
   - etc. (one per channel type)
3. **Live feedback** as engineer adjusts:
   - Waveform display (what the audience mics hear in real time)
   - Heuristic alerts: "⚠️ Feedback on channel 3" or "🔴 Clipping detected"
   - AI recommendations: "Vocals are 8dB quieter than your reference—try raising by +5dB"
4. **Engineer adjusts mixer** (manually or via suggested changes)
5. **"Pass" or "Fail"** at the end; if fail, repeat steps for that channel

### During Service (Auto Mode)

1. **Service is live** (operator has pressed "Go Live")
2. **Automation engine runs:**
   - As each service item starts, recalls its saved scene or applies fader adjustments
   - Example: worship song starts → recall "Worship" scene, mute backing track for first verse
3. **Continuous monitoring:**
   - Heuristic alerts still fire: "Feedback on channel 4—check the wireless mic battery"
   - Reference comparison runs silently (no distracting pop-ups during service)
4. **Manual override always works:** engineer can adjust anything live; automation doesn't fight
5. **All adjustments logged:** what was changed, when, and by whom (for post-service review)

---

## Data Model

**Channels** (synced from Yamaha)
- id, name (e.g., "Worship Leader"), yamaha_channel_number
- is_mic (boolean), is_backing_track (boolean)
- reference_level_db (stored from good mix for comparison)

**Reference Mix**
- audio_fingerprint (spectral profile, dynamic range, presence peaks)
- recorded_at (timestamp)
- duration_seconds
- notes (e.g., "2026-06-30 good Sunday morning")

**Automation Rules**
- service_item_type (song / scripture / announcement / prayer / countdown)
- scene_name_to_recall (optional, e.g., "Worship", "Announcement")
- fader_adjustments (optional list: channel_id → delta_db)
- enabled (boolean)

**Session Log**
- timestamp, service_date
- changes: (channel_id, old_level, new_level, auto_or_manual, reason)
- heuristic_alerts: (timestamp, channel, alert_type, severity)

---

## UI Sections

**Setup Tab (first-time & config):**
- Device connection status + "Import Channels" button
- Channel list with checkboxes (is mic? is backing track?)
- Automation rules editor (drag-and-drop or forms)
- "Record Reference Mix" button (records 5 min clip)

**Sound Check Tab (pre-service):**
- Big "Start Sound Check" button
- Step-by-step checklist (collapsible per channel)
- Live waveform display (stereo, audience mics)
- Real-time recommendations panel (feedback, clipping, reference comparisons)
- "Pass" / "Fail" buttons at the end

**Auto Mode Indicator (during service):**
- Small status badge on main Live tab: "Sound Check Auto Mode: ON"
- Heuristic alerts appear as non-blocking toasts (don't interrupt presentation)
- Manual fader adjustments are logged silently

---

## Integration with WorshipFlow Main App

- Sound Check module reads `state.liveItem` (current service item) from WorshipFlow's canonical state
- When item changes, automation engine checks rules and applies changes
- Both modules share crash recovery: if app crashes, both presentation and sound state restore together
- IPC communication via existing WorshipFlow preload bridge (no new security boundaries)

---

## Audio Analysis & Recommendations

**Real-time Heuristics (always on):**
- **Feedback detection:** sustained frequency spike (narrow peak in FFT) + volume > threshold
- **Clipping detection:** samples consistently at max amplitude
- **Volume monitoring:** overall RMS level tracking (warn if too quiet or too loud)
- **Dropout detection:** sudden silence lasting >500ms

**Reference Mix Comparison:**
- Record a good mix; calculate its spectral fingerprint (energy in key frequency bands: low/mid/high)
- During sound check, compare current mix's fingerprint to reference
- Report differences: "Vocals are 15% quieter in 2kHz presence band—typical of lower gain" → suggest +2dB
- Update reference mix as needed (e.g., after summer when room acoustics change)

**Recommendation Confidence:**
- High confidence: heuristic alerts (feedback/clipping) — always show
- Medium confidence: reference comparisons where delta > 10% — show as suggestions
- Low confidence: everything else — only show on request

---

## Error Handling

- **Yamaha disconnects:** UI shows "Mixer offline—check WiFi" and disables automation until reconnected
- **Audio input fails:** heuristics and recommendations disabled; UI shows warning; operator can still manually adjust
- **Reference mix too old:** warn if reference is >1 month old (room/season changes); offer to re-record
- **Automation rule conflicts:** if two rules apply simultaneously (edge case), log and apply in priority order

---

## Success Criteria

1. ✅ Operator can configure automation in <10 minutes on first setup
2. ✅ Sound checks can run with clear guidance (no audio expertise needed)
3. ✅ Heuristic alerts catch real issues (feedback, clipping, dropouts)
4. ✅ Reference mix recommendations are useful (engineer finds 80% of suggestions actionable)
5. ✅ Auto mode during service works reliably (no surprise mutes, scenes recall correctly)
6. ✅ Manual override always works (automation never locks the engineer out)
7. ✅ Crash recovery works (if app crashes mid-service, mixer state is preserved and restored)

---

## Tech Stack

- **Yamaha communication:** OSC protocol over UDP (open-source libraries available)
- **Audio input:** Node.js `node-portaudio` or similar for USB audio capture
- **Heuristic analysis:** Web Audio API or FFT.js for frequency analysis in the renderer
- **Fingerprinting:** Simple spectral profile (energy bins at 0–100Hz, 100–1kHz, 1–5kHz, 5kHz+)
- **Storage:** WorshipFlow's existing SQLite for rules, fingerprints, session logs

---

## Phase & Schedule

This is a **Phase 4** project for WorshipFlow (after Phase 3: Streaming is complete). Can be built & tested independently as a separate module before integrating into the main app.

**Estimated scope:** 3–4 weeks for full implementation (setup, sound check UI, auto mode, audio analysis, testing).
