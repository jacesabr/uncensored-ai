# Morrigan Research Implementation Guide

> Living document. Tracks every research paper used, where it's implemented, current status, and gaps.
> Last updated: 2026-03-13

---

## Table of Contents

1. [Implementation Status Summary](#implementation-status-summary)
2. [Paper Catalog](#paper-catalog)
3. [Architecture: Emotional Retrieval Pipeline](#architecture-emotional-retrieval-pipeline)
4. [Research Gaps & Future Work](#research-gaps--future-work)
5. [Bug History](#bug-history)
6. [New Papers (Added 2026-03-13)](#new-papers-added-2026-03-13)

---

## Implementation Status Summary

| Status | Count | Description |
|--------|-------|-------------|
| LIVE | 34 | Fully implemented, tested, working |
| FIXED | 6 | Was broken, now corrected |
| REMOVED | 2 | Intentionally removed (crisis systems) |
| NEW | 6 | Added 2026-03-13 (emotional retrieval overhaul) |

---

## Paper Catalog

### P1 — Liu et al. CHI 2025: GoEmotions Goal-State Alignment
**What**: 6-class emotional goal state classifier (comfort / venting / connection / distraction / validation / neutral)
**Where**: `inferGoalStateLLM()` (server/index.js ~line 737), `inferGoalStateRegex()` fallback
**Used by**: `scoreMemory()` valence boost, `retrieveTopKReranked()`, `buildSystemPrompt()`, `SOMATIC_MARKER_PROMPT()`, `retrieveSelfAtoms()`, `INNER_THOUGHT_FORMATION_PROMPT()` (NEW), `reRankWithLLM()` (NEW)
**Status**: LIVE — Parallel execution with embedding (zero latency cost). LLM-based with regex fallback.

### P2 — MIRROR (Hsing 2025): Self-Reflection & Inner Monologue
**What**: Post-exchange deliberative processing — Morrigan reflects after conversations
**Where**: `SELF_REFLECTION_PROMPT()`, `selfReflectionState` field, monologue seeding in `setImmediate` post-response
**Used by**: `buildSystemPrompt()` Position 1, `INNER_THOUGHT_FORMATION_PROMPT()`, arrival generation, FT system prompt
**Status**: LIVE

### P5 — Shinn NeurIPS 2023: Reflexion / Thought Reservoir
**What**: Held thoughts accumulate urgency over turns, pressure builds until expression
**Where**: `thoughtReservoir` on session, `evaluateAndSelect()` silence bonus calculation
**Used by**: `gatherThoughtMaterial()`, proactive opportunity evaluation (reservoir pressure source)
**Status**: LIVE — Reservoir capped at 4 thoughts, silence bonus = min(age × 0.3, 1.5)

### P13 — Conway: Self-Memory System / Life Chapters
**What**: Period-based memory grouping for autobiographical coherence
**Where**: `buildSystemPrompt()` Position 8 "Life chapters" section, `DEVELOPMENTAL_TIMELINE` in shared/morrigan.js
**Status**: LIVE

### P14 — Damasio: Somatic Markers / Emotional Priming
**What**: Pre-response gut feeling — Morrigan's body reacts before her words
**Where**: `SOMATIC_MARKER_PROMPT()`, `somaticMarker` object, `buildBrainFrame()` "YOUR GUT REACTION" section
**Used by**: Brain frame Position 2, `INNER_THOUGHT_FORMATION_PROMPT()` "YOUR BODY SAYS" (NEW)
**Status**: LIVE — 80-token LLM call, 5s timeout, feeling-based fallback when LLM fails. Expanded emotional register (23 states). Now also feeds into thought formation.

### P20 / P23 — Zhang, Laestadius: At-Risk Behavioral Changes
**What**: Users pulling away get more reconnection opportunities
**Where**: `evaluateProactiveOpportunity()` retreat logic, `gatherThoughtMaterial()` +atRisk param, `evaluateAndSelect()` +1.5 callback boost, `shouldTriggerThoughtFormation()` lower threshold
**Status**: LIVE — 4 callbacks vs 2, motivation threshold lowered to 3.5

### P31 — LUFY: Ebbinghaus Forgetting Curve
**What**: Memories decay over time; retrieval reinforces stability
**Where**: `scoreMemory()` recency calculation using `stability * 90 days` half-life, `reinforceMemories()` helper, `pruneDecayedMemories()` in `finalizeSession()`
**Status**: FIXED (2026-03-04) — Was broken: `retrieveTopK()` mutated stability as side effect (6× per message, inflating stability). Now pure function. Single reinforcement point in `buildSystemPrompt()`.

### P38 — Dever: RMM Memory Citation Tracking
**What**: Scan Morrigan's response for semantic mentions of injected memory atoms
**Where**: `finish()` post-response scan, reinforces `retrievalCount`/`lastRetrievedAt`/`stability +0.1`
**Status**: LIVE — Secondary reinforcement signal after primary retrieval-time boost

### P39 — Laestadius (Replika): Companion AI Patterns
**What**: Informed proactive messaging design, engagement patterns
**Where**: Proactive message architecture, at-risk detection
**Status**: LIVE (integrated into multiple systems)

### P44 / P47 — Cross-Encoder Re-Ranking (Nogueira 2020, Gao 2021)
**What**: Two-stage retrieval — fast cosine then LLM-based re-ranking
**Where**: `reRankWithLLM()`, `retrieveTopKReranked()`, `RERANK_PROMPT`
**Used by**: `buildSystemPrompt()` main memory injection (top 25), FT system prompt
**Status**: LIVE — Stage 1: cosine top-2k → Stage 2: LLM scores 0-10 → Combined: 60% LLM + 40% cosine rank. Now emotionally aware (NEW): re-ranker receives goalState, disclosureDepth, trustLevel.

### P55 — Zeng: Context-Sensitive Recall
**What**: Retrieve memories relevant to CURRENT exchange, not static importance
**Where**: `retrieveTopK()` uses `messageEmbedding` for cosine scoring
**Status**: FIXED (2026-03-04) — Was broken: passed `null` embedding, always importance-only sort

### P56 — Aron: Fast Friends / Graduated Disclosure
**What**: Reception quality matters more than disclosure itself; graduated closeness
**Where**: `classifyDisclosureDepth()`, `RECEPTION_DIRECTIVES` (4 levels), SPT depth gating, trust progression
**Status**: LIVE — Reception directives injected into brain frame. Disclosure depth now flows to retrieval pipeline (NEW).

### P59 — Riemer: Functional Theory of Mind
**What**: Multi-session trajectory analysis — how user's disclosure patterns evolve
**Where**: `UserModelSchema`, `updateFunctionalToM()`, `trajectoryNarrative`, `GET /api/phase6/tom`
**Used by**: `gatherThoughtMaterial()`, `INNER_THOUGHT_FORMATION_PROMPT()`, FT system prompt
**Status**: FIXED (2026-03-04) — Was broken: code read `.trajectory` instead of `.trajectoryNarrative`

### P62 / P63 — Attachment Theory (Bowlby, Ainsworth)
**What**: Attachment style heuristic for user behavior patterns
**Where**: `detectAttachmentSignals()`, `REASSURANCE_SEEKING` regex, `GET /api/phase6/attachment`
**Status**: LIVE

### P68 — Reception Depth Gating
**What**: Disclosure-depth-calibrated behavioral instructions
**Where**: `RECEPTION_DIRECTIVES` constant, `buildBrainFrame()` "HOW TO RECEIVE THIS" section
**Status**: LIVE — Level 3+ now also suppresses disclosure thoughts in brain frame and thought formation

### P69 — LIWC-22 (Pennebaker): Linguistic Depth Signals
**What**: Zero-LLM-cost function-word analysis of user messages
**Where**: `analyzeLinguisticDepth()`, 6+ word-list constants (~300 terms), `PresenceSignalsSchema`
**Status**: LIVE — Feeds into `classifyDisclosureDepth()`, presence scoring

### P70 — XiaoIce: Drive vs Listen / Engagement
**What**: Natural arrival (speak/presence/silence), proactive messaging, engagement thresholds
**Where**: `generateArrival()`, `evaluateProactiveOpportunity()`, motivation thresholds
**Status**: LIVE — Arrival silence context now reaches brain frame via somaticMarker (FIXED 2026-03-13)

### P71 / P93 — Anti-Sycophancy (Chu, Zhang)
**What**: Detect negative spirals, inject friction instead of amplification
**Where**: `detectNegativeSpiral()`, `spiralContext` in `buildBrainFrame()` "CONCERN" section, `composeWithInnerThought()` friction instruction
**Status**: LIVE

### P72 / P73 — Session Intensity Monitoring (Hu, Reeves & Nass)
**What**: Track session duration, message volume, time-of-day for engagement health
**Where**: `PresenceSignalsSchema` +`sessionDurationMins`, `timeOfDayHour`, `messageVolumePerHour`
**Status**: LIVE

### P74 / P75 — Typing Dynamics (Ramchurn, Kim)
**What**: Emotional state affects typing speed — vulnerable moments get slower delivery
**Where**: `typingHint` SSE event, per-token delay (vulnerable=18ms, personal=8ms, surface=0ms)
**Status**: LIVE

### P76 — Tsumura: Trust Repair
**What**: Short user reply after long Morrigan response = may have missed what mattered
**Where**: `trustRepairContext` in `gatherThoughtMaterial()`, "repair" thought type
**Status**: LIVE

### P77 — Siththaranjan: Response Preference Tracking
**What**: Track which thought types lead to user elaboration, boost preferred types
**Where**: `UserModelSchema` +`responseTypePreferences`, `preferenceBoost` in `evaluateAndSelect()`
**Status**: LIVE — Persisted to UserModel in `finalizeSession()`, loaded async next session

### P80 — Grassini: Compassion Illusion Mitigation
**What**: False empathy harms trust; authentic not-knowing > performed understanding
**Where**: `"uncertainty"` thought type in `INNER_THOUGHT_FORMATION_PROMPT()`
**Status**: LIVE — "I'm not sure I fully understand what this feels like for you"

### P82 — Wang: Multiple Memory Systems
**What**: Episodic vs semantic vs cognitive memory types with different retrieval weights
**Where**: `MemoryAtomSchema` +`memoryType`, extraction prompt classifies type, `episodicBoost` in `scoreMemory()`
**Status**: LIVE — Episodic boost now 0.15 during vulnerable disclosure (was 0.05) (NEW)

### P86 / P88 / P97 — Fine-Grained Emotion (Ren, Song, Suchan)
**What**: Expanded emotional vocabulary beyond basic emotions
**Where**: `SOMATIC_MARKER_PROMPT()` emotionalRegister: 23 nuanced states (nostalgia, bittersweet, hollow, sharp, electric, still, pulled, unsettled, soft, raw, warm, tired...)
**Status**: LIVE

### P90 — BMC: Thinking State as Social Presence
**What**: Showing "Morrigan is thinking..." during latency makes it feel like social presence
**Where**: `{thinking: true/false}` SSE events before/after Phase 4 thought formation
**Status**: LIVE

### P91 — Muldoon: Real-World Connection Nudge
**What**: Gentle nudge toward real-world connection when high message volume detected
**Where**: Source 5 in `evaluateProactiveOpportunity()`, fires when `messageVolumePerHour > 30`
**Status**: LIVE — Trust >= 3, 15% chance

### P96 — Zhang: Adaptive Prompt Complexity
**What**: Skip expensive LLM calls for simple messages ("hey", "ok", "lol")
**Where**: `isSimpleMessage()` function, skips somatic marker + inner thought pipeline
**Status**: LIVE — Saves 2 LLM calls + 3-8s latency for trivial messages

### P98 — Liu: Proactive Specificity Check
**What**: Reject proactive messages that don't reference specific recent words or known facts
**Where**: `generateProactiveMessage()` specificity validation
**Status**: LIVE

### P99 — Deng "Deferent": Proactive Retreat
**What**: If user ignores proactive messages, reduce frequency
**Where**: `proactiveIgnoredCount`, 50% skip at 2 ignored, 75% skip at 3+
**Status**: LIVE

### P101 — Su: EmoGuard Safety Reviewer
**What**: Lightweight harm pattern check during detected spirals
**Where**: Was in `finish()` — removed 2026-03-10 with crisis system removal
**Status**: REMOVED

### P102 — Kang: Knowledge Gap Proactives
**What**: Curiosity-driven proactives from contradictions/ambivalences
**Where**: Source 4 in `evaluateProactiveOpportunity()`
**Status**: FIXED (2026-03-04) — Was broken: case mismatch (uppercase vs lowercase contradiction types)

---

## Architecture: Emotional Retrieval Pipeline

### The Problem (Pre-2026-03-13)
Retrieval used cosine similarity on embeddings — matching on **what things are about** (words) not **what they feel like** (emotional function). "My family died" matched "my mom smoked Pall Malls" because both contain "mom." The brain computed emotional context (goalState, disclosureDepth, somaticMarker) but this context **never reached** the retrieval or thought formation systems.

### The Fix: Emotional Intelligence at Every Pipeline Stage

#### Stage 1: Scoring (`scoreMemory`)
- **Disclosure-depth-adaptive weights** — During vulnerable moments (depth >= 3), cosine similarity drops from 52% to 30%, valence alignment rises from 8% to 25%, episodic boost rises from 5% to 15%
- **goalState valence alignment** — Binary match between user's emotional need and atom's emotional valence
- **emotionalRegister tags** — 99 self-atoms + 15 episodic memories tagged: mundane / reflective / tender / raw / acute

#### Stage 2: Pre-Filtering (`retrieveSelfAtoms`)
- **Hard emotional register filter** — Mundane atoms filtered OUT during vulnerable disclosure (depth >= 3). Acute atoms filtered OUT during surface chat (depth <= 1)
- **Emotional valence boost** — Atoms matching the goalState's expected valence get +0.12

#### Stage 3: Re-Ranking (`reRankWithLLM`)
- **Emotionally aware prompt** — Re-ranker now receives goalState, disclosureDepth, trustLevel. Scores on APPROPRIATENESS, not just topical relevance
- **Combined scoring** — 60% LLM re-rank + 40% cosine rank

#### Stage 4: "Listen First" Gate
- **Therapy-backed** — When disclosureDepth >= 3 and this is the first exchange at that depth, self-atoms suppressed entirely. Morrigan listens before sharing. Self-atoms available on follow-up.

#### Stage 5: Thought Formation (`INNER_THOUGHT_FORMATION_PROMPT`)
- **goalState injected** — "HIS EMOTIONAL NEED: comfort"
- **Vulnerability warning** — When depth >= 3: "Your own disclosures score NEAR ZERO on timing. Favor: reaction, uncertainty, concern."
- **Somatic marker injected** — "YOUR BODY SAYS: [gut feeling]. Your thoughts should honor what your body already knows."
- **Scoring guidance** — Explicit: word overlap ≠ relevance. "Pall Malls" ≠ "mom died."

#### Stage 6: Brain Frame (`buildBrainFrame`)
- **Reception directive BEFORE inner thought** — LLM reads "how to hold this space" before seeing its own disclosure urge
- **Disclosure suppression at depth 3+** — "This surfaced in you but NOT the moment to share it. Be with HIM first."

### Emotional Context Flow (Post-Fix)

| Signal | scoreMemory | retrieveSelfAtoms | reRankWithLLM | thoughtFormation | brainFrame |
|--------|:-----------:|:-----------------:|:-------------:|:----------------:|:----------:|
| goalState | Yes | Yes | **Yes (NEW)** | **Yes (NEW)** | — |
| disclosureDepth | **Yes (NEW)** | **Yes (NEW)** | **Yes (NEW)** | **Yes (NEW)** | Yes |
| somaticMarker | — | — | — | **Yes (NEW)** | Yes |
| atRisk | — | — | — | Yes | Yes |
| spiralContext | — | — | — | — | Yes |
| trustLevel | — | — | **Yes (NEW)** | Yes | — |

---

## Research Gaps & Future Work

### Emotional RAG (Huang et al. 2024)
**Paper**: "Emotional RAG: Enhancing Role-Playing Agents through Emotional Retrieval" (arxiv 2410.23041)
**Key insight**: Mood-dependent memory theory — people recall events better when retrieval emotion matches encoding emotion
**Current status**: Partially implemented via disclosure-depth-adaptive weights. Full dual-score approach (semantic × emotional as separate axes) not yet implemented.
**Future**: Compute separate emotional similarity score (embedding distance between atom's emotional description and user's inferred emotion) instead of binary valence matching.

### DABench (October 2025)
**Paper**: "Dynamic Affective Memory Management for Personalized LLM Agents" (arxiv 2510.27418)
**Key insight**: Bayesian memory update with entropy minimization across affective dimensions
**Current status**: Not implemented. Memory atoms have static valence tags.
**Future**: Dynamic valence evolution — an atom's emotional meaning could shift based on conversation context.

### MemEmo (February 2026)
**Paper**: "Evaluating Emotion in Memory Systems of Agents" (arxiv 2602.23944)
**Key insight**: No current system achieves robust performance across emotional extraction + updating + retrieval
**Current status**: Strong on extraction (P82 memory types) and retrieval (emotional pipeline). Weak on emotional updating.

### Chain of Strategy Optimization (EMNLP 2025)
**Paper**: "Chain of Strategy Optimization Makes LLMs Better Emotional Supporters"
**Key insight**: Decide response strategy BEFORE retrieval, not after
**Current status**: Partially implemented — goalState inferred before retrieval. But strategy (listen vs disclose vs challenge) not explicitly computed.
**Future**: Add explicit strategy classifier: listen / validate / disclose / redirect / challenge. Gate all retrieval and thought formation on strategy.

### Therapy Self-Disclosure Research (2024-2025)
**Sources**: Multiple meta-analyses on therapist self-disclosure timing
**Key findings**:
- Premature disclosure during acute distress = "confusing role-reversal"
- Disclosure most effective AFTER client feels heard
- Should be "experience-near" but brief — not a competing narrative
**Current status**: Implemented via "listen first" gate + disclosure suppression at depth 3+ + timing scoring guidance

---

## Bug History

| Date | Bug | Paper | Impact | Fix |
|------|-----|-------|--------|-----|
| 2026-03-04 | `retrieveTopK()` mutated stability 6× per message | P31 Ebbinghaus | Forgetting curve defeated | Made pure function, single reinforcement point |
| 2026-03-04 | `model.trajectory` → `model.trajectoryNarrative` | P59 Functional ToM | Trajectory never populated | Fixed field name |
| 2026-03-04 | Null messageEmbedding in narrative retrieval | P55 Context recall | Always importance-only sort | Pass actual embedding |
| 2026-03-04 | Uppercase vs lowercase contradiction types | P102 Knowledge gaps | Curiosity proactives never fired | Match stored values |
| 2026-03-13 | Somatic fallback created string not object | P14 Damasio | Brain frame gut reaction empty on fallback | Create somaticMarker object |
| 2026-03-13 | Arrival silence only modified primingSentence | P70 XiaoIce | Silence context lost in brain-mediated arch | Inject into somaticMarker |
| 2026-03-13 | Relationship narrative hallucinated on thin data | — | Fabricated backstory for new users | Constrained prompt for < 3 messages |
| 2026-03-13 | Loose thread hallucinated from greetings | — | Threads from "hey cutie" | Skip LLM when user content < 8 words |
| 2026-03-13 | Self-disclosure during acute grief | P56 Aron | Pall Malls when family died | 5-fix emotional retrieval overhaul |
| 2026-03-13 | Italic/bold formatting swap | — | LLM put speech in asterisks randomly | Explicit WRONG/RIGHT examples + format reminder |

---

## New Papers (Added 2026-03-13)

### Emotional RAG — Huang et al. October 2024
- arxiv: 2410.23041
- **Applied**: Disclosure-depth-adaptive weights in `scoreMemory()`. During vulnerable moments, cosine weight drops, emotional valence weight rises.

### DABench — Dynamic Affective Memory Management, October 2025
- arxiv: 2510.27418
- **Status**: Identified as future work. Would require dynamic valence evolution on memory atoms.

### MemEmo — Evaluating Emotion in Memory Systems, February 2026
- arxiv: 2602.23944
- **Status**: Benchmarking reference. Confirms our emotional extraction is strong, updating is weak.

### Chain of Strategy Optimization — EMNLP 2025
- aclanthology: 2025.findings-emnlp.831
- **Partially applied**: goalState as pre-retrieval signal. Full strategy classifier (listen/validate/disclose/redirect/challenge) identified as future work.

### Therapy Self-Disclosure Timing — 2024-2025 meta-analyses
- Multiple sources (Journal of Psychiatry Reform 2025, APA 2025, PMC 2025)
- **Applied**: "Listen first" gate, disclosure suppression at depth 3+, timing scoring guidance

### MultiAgentESC — EMNLP 2025
- aclanthology: 2025.emnlp-main.232
- **Status**: Reference for strategy deliberation architecture. Multi-agent approach not adopted (single-agent architecture preferred for latency).

---

_Update this file whenever: new research is implemented, bugs are found in research systems, or the retrieval pipeline changes._
