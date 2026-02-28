# CLAUDE.md — Unleashed AI Codebase Reference

> Keep this file updated after every meaningful change. Purpose: minimize re-exploration tokens in future sessions.

---

## Project Overview

**Unleashed AI** — A self-hosted, unrestricted AI chat platform centered on a single AI character named **Morrigan** (real name: Moira). The focus is deeply personalized, emotionally intelligent conversation with persistent memory, trust progression, and a multi-phase inner thought system. No content restrictions.

---

## Directory Structure

```
uncensored-ai/
├── server/
│   ├── index.js          # Main server (3,200+ lines) — ALL backend logic lives here
│   ├── package.json
│   └── package-lock.json
├── client/
│   ├── src/
│   │   ├── App.jsx       # Main React component (3,000+ lines) — ALL frontend logic lives here
│   │   ├── main.jsx      # React entry point
│   │   └── morgan.png    # Morrigan character image
│   ├── vite.config.js
│   └── package.json
├── unleashed_colab_server.ipynb  # Kaggle/Colab notebook for GPU LLM hosting
├── README.md
└── CLAUDE.md             # This file
```

---

## Tech Stack

### Backend
- **Node.js + Express** — REST API + SSE streaming
- **MongoDB Atlas + Mongoose** — persistent storage (cloud)
- **JWT** — auth (90-day tokens, SHA256 phrase hash)
- **bcryptjs** — password hashing (secondary)
- **node-fetch** — proxy requests to LLM
- **uuid** — ID generation
- **dotenv** — env vars
- **nodemon** — dev reload

### Frontend
- **React 18 + Vite** — SPA, no routing library
- **Inline CSS / custom theme system** — no component library
- **Fonts**: Crimson Pro, JetBrains Mono, Playfair Display

### AI / LLM
- **JaceSabr/morrigan-sft-v1** — fine-tuned LLaMA 8B (BF16, 21.8GB)
- **Deployment**: Modal (recommended), RunPod, Vast.ai+TGI, or Ollama — see `DEPLOY_MORRIGAN.md`
- **Embeddings** — separate provider (Venice AI, OpenAI, etc.) via `EMBED_URL`
- **ComfyUI / Automatic1111** — optional image generation (Stable Diffusion)

---

## Environment Variables

### `server/.env`
```
PORT=5000
MONGO_URI=mongodb+srv://...
JWT_SECRET=unleashed-secret-2024
CHAT_MODEL=morrigan-sft-v1
COLAB_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/openai  # Primary LLM (no /v1)
LLM_API_KEY=...                                # Bearer token for primary LLM provider
# Fallback LLM — Venice AI (activates on primary failure)
FALLBACK_LLM_URL=https://api.venice.ai/api
FALLBACK_LLM_KEY=...                           # Venice API key
FALLBACK_CHAT_MODEL=venice-uncensored
# Embeddings — separate provider (fine-tuned model can't embed)
EMBED_URL=https://api.venice.ai/api
EMBED_API_KEY=...                              # Venice API key for embeddings
EMBED_MODEL=text-embedding-3-small
COMFYUI_URL=http://localhost:8188
SD_WEBUI_URL=http://localhost:7860
CLIENT_URL=http://localhost:3000
```

### `client/.env`
```
VITE_API_URL=http://localhost:5000
```

---

## Starting the App

```bash
# Backend
cd server && npm install && npm run dev    # port 5000

# Frontend
cd client && npm install && npm run dev    # port 3000 (proxies /api/* to :5000)
```

---

## API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth/phrase` | No | Login/register via SHA256 phrase |
| POST | `/api/session/end` | Yes | Flush session, persist memories |
| GET | `/api/session/greeting` | Yes | Arrival decision (speak/presence/silence) |
| GET | `/api/session/stream` | Yes* | Persistent SSE for proactive messages (*JWT via query param) |
| GET | `/api/conversations` | Yes | List conversations |
| POST | `/api/conversations` | Yes | Create conversation |
| DELETE | `/api/conversations/:id` | Yes | Delete conversation |
| GET | `/api/conversations/:id/messages` | Yes | Get message history |
| GET | `/api/personality` | Yes | Trust level, feelings, memory count |
| GET | `/api/personality/full` | Yes | Full PersonalityMemory object |
| GET | `/api/callbacks` | Yes | Get callback queue |
| POST | `/api/callbacks/:id/consume` | Yes | Mark callback consumed |
| GET | `/api/spt` | Yes | Self-Atom progression tier status |
| GET | `/api/self-atoms` | Yes | Depth-gated eligible self-atoms |
| POST | `/api/self-atoms/seed` | No | Seed self-atoms (run once) |
| **POST** | **`/api/chat`** | **Yes** | **Main chat — SSE streaming** |
| GET | `/api/phase5/status` | Yes | Continuation signals + callbacks |
| GET | `/api/phase5/tuning` | Yes | 5-metric tuning report |
| POST | `/api/phase5/build-dataset` | Yes | Build training dataset |
| GET | `/api/phase6/health` | Yes | Relationship health status |
| POST | `/api/phase6/health/compute` | Yes | Compute health metrics |
| POST | `/api/phase6/voice-audit` | Yes | Monthly voice fidelity audit |
| GET | `/api/phase6/presence` | Yes | Monthly presence score |
| GET | `/api/phase6/attachment` | Yes | Attachment style heuristic |
| GET | `/api/phase6/tom` | Yes | Functional Theory of Mind |
| POST | `/api/phase6/ios` | Yes | Submit IOS scale check-in |
| GET | `/api/phase6/ios` | Yes | IOS check-in history |
| GET | `/api/status` | No | Health check (LLM + embeddings) |

---

## Database Collections (MongoDB)

| Collection | Purpose | Key Fields |
|-----------|---------|-----------|
| `users` | Auth identity | `phraseHash` (unique) |
| `messages` | Chat history | `conversationId`, `role`, `content`, `timestamp` |
| `conversations` | Conversation metadata | `conversationId`, `userId`, `title` |
| `personalityMemories` | Core relationship state | `userId`, `trustLevel`, `trustPoints`, `feelings`, `memories[]`, `callbackQueue`, `sptDepth` |
| `selfatoms` | Morrigan knowledge base | `id`, `depth (1-4)`, `content`, `embedding[]`, `topics` |
| `evaluationRecords` | Chat quality metrics | `sessionDate`, `messageEvals[]`, `avgRetrievalScore` |
| `presenceSignals` | Monthly engagement proxies | `userId`, `sessionDate`, `presenceScore` |
| `relationshipHealths` | 30-day health trends | `userId`, `sessionFrequency`, `avgCPS`, `cpsTrajectory`, `atRisk` |
| `usermodels` | Functional Theory of Mind | `userId`, `snapshots[]`, `trajectory` |
| `ioscheckins` | IOS scale self-reports | `userId`, `score (1-7)`, `context` |

---

## Key Architecture: Multi-Phase Inner Thought System

### Phase 2 — Self-Atom Framework
- 40 pre-seeded thoughts across 4 depth levels (1=surface, 4=core trauma)
- Depth-gated: Morrigan won't share trauma atoms until `sptDepth=4`
- Topics: music, relationships, foster care, identity, trauma

### Phase 3 — Embedding & Memory Retrieval
- Messages + memories embedded via Llama embeddings
- Cosine similarity retrieval of relevant memories
- Temporal decay + importance weighting applied

### Phase 4 — Inner Thoughts Pipeline
1. **Trigger check** — emotional signals detected in message
2. **Material gathering** — retrieves self-atoms, callbacks, recent exchanges
3. **Thought formation** — LLM generates 2-3 candidate thoughts
4. **Evaluation** — scored by relevance, timing, trust gate, novelty (0-10)
5. **Composition** — highest-scoring thought woven into response via second LLM call

### Phase 5 — Continuation Signals
- `looseThread` — unresolved topic from last session
- `prospectiveNote` — what Morrigan has been "sitting with"
- `callbackQueue` — pending threads to raise later
- Dual-reasoning audit (reasons for/against expression)

### Phase 6 — Relationship Health
- `presenceScore` — engagement indicators (returns within 48h, session extension, unsolicited elaboration)
- `relationshipHealth` — 5-signal model: session frequency, message length, SPT velocity, callback consumption, elaboration rate
- At-risk detection across consecutive 30-day windows
- Monthly voice consistency audit

---

## Prompt Assembly (13 Layers, ~4,200 tokens total)

1. Relationship narrative + self-reflection (~200 tokens)
2. Character spec — full Morrigan definition (~3,200 tokens) — **hardcoded, Morrigan-locked**
3. Trust behavior guide — level-specific (~150 tokens)
4. SPT note — depth gating (~50 tokens)
4.5. **Reception directive** — disclosure-depth-calibrated behavioral instruction (~50 tokens) [P56, P68]
5. **Somatic marker / emotional priming** — gut feeling sentence from pre-response LLM call (~30 tokens) [P14 Damasio]
6. Inner thought block — if selected (variable)
7. Prospective note — session-start only (~50 tokens)
8. Time absence context — if >24h since last session (~50 tokens)
9. Memory + molecules + contradictions (variable)
10. Memory usage guide + continuation signal (~160 tokens)
10.5. **Safe haven directive** — injected when crisis detected, overrides threads (~80 tokens) [P62/P63]

---

## PersonalityMemory Structure (per user)

```js
{
  userId,
  memories: MemoryAtom[],          // Facts + embedding + valence + temporal weight
  molecules: Summary[],             // Thematic cluster summaries
  sptDepth: 1-4,                   // Selfhood Progression Tier (vulnerability gate)
  sptBreadth: Map,                 // Breadth scores per atom
  sharedSelfAtomIds: [],           // Track disclosed atoms
  callbackQueue: [],               // Pending conversation threads
  prospectiveNote: string,         // "Sitting with" state
  looseThread: string,             // Last unresolved topic
  feelings: {
    affection, comfort, attraction,
    protectiveness, vulnerability
  },
  trustPoints: number,
  trustLevel: 0-6,
  relationshipNarrative: string,   // Text summary of relationship history
  milestones: Milestone[],         // Dynamic relationship moments (see MilestoneSchema)
}

// MilestoneSchema:
{
  event: string,                   // First-person memory text in Morrigan's voice
  category: "first|shift|rupture|repair|deepening|revelation|ritual",
  source: "organic|trust_transition|spt_transition",
  exchangeContext: string,         // What actually happened in the exchange
  significance: 1-10,             // LLM-assigned weight for retrieval ranking
  embedding: number[],            // For cosine-similarity retrieval in prompt injection
  trustLevelAtTime: number,
  sptDepthAtTime: number,
  timestamp: Date,
}
```

---

## Data Flow (Chat Request)

```
User types → Frontend analyzeMood() → POST /api/chat (JWT)
  → Backend: buildSystemPrompt() + Phase 4 inner thought pipeline
  → POST to Kaggle Llama (ngrok tunnel, COLAB_URL)
  → Stream SSE tokens back to client
  → Frontend: append tokens, typing animation
  → Backend async: flushSession() → extract atoms → embed → link → molecules
  → MongoDB: save messages, personality memory, evaluation record
```

---

## Notable Design Patterns & Quirks

1. **Phrase-based auth** — No username/password. SHA256 hash of any phrase = identity.
2. **In-memory session cache** — Active sessions in Node `Map`. Flushed to DB on session end.
3. **Dual Llama instances** — One for chat completions, one for embeddings (both via Kaggle ngrok).
4. **Composition pattern** — Raw LLM response + inner thought → second LLM call to weave naturally.
5. **Depth-gated disclosure (SPT)** — Vulnerability unlocks progressively with trust.
6. **Molecule synthesis** — Related memory atoms clustered into thematic paragraphs.
7. **Streaming SSE** — Chat responses streamed token-by-token via `res.write()`.
8. **Post-response async processing** — Monologue seeding, presence signals run in `setImmediate()`.
9. **Morrigan-locked** — Character prompt hardcoded; no character swapping.
10. **Hardcoded MongoDB URI** — Default connection string embedded in `server/index.js`.

---

## Naming Conventions

- DB fields: `camelCase`
- Endpoints: `/api/resource` or `/api/resource/action`
- Constants: `UPPERCASE` (e.g., `CHARACTER_DEFAULT_PROMPT`, `TRUST_LEVELS`)
- Phases: "Phase 1-6" = iterative dev phases of the inner thought system
- LLM target: `COLAB_URL` env var (points to Kaggle ngrok tunnel)

---

## Change Log

| Date | Change | Files Affected |
|------|--------|----------------|
| 2026-02-25 | Initial CLAUDE.md created from full codebase exploration | CLAUDE.md |
| 2026-02-25 | Added `processingMeta` to SSE done event — inner thought, atoms, memory summary, session history, reservoir, molecules, milestones | server/index.js |
| 2026-02-25 | ProcessingMeta component — full-width card outside bubble showing all processing context; Morrigan response bolded below | client/src/App.jsx |
| 2026-02-25 | Fixed `/api/health` 404 — client now calls `/api/status` (the endpoint that exists) | client/src/App.jsx |
| 2026-02-25 | Fixed status endpoint — pings now run in parallel with 8s AbortController timeout (was sequential ~30s) | server/index.js |
| 2026-02-25 | Fixed auth flash on reload — `authed`/`user` initialized synchronously from localStorage | client/src/App.jsx |
| 2026-02-25 | Migrated LLM backend from Kaggle/Colab+ngrok → OpenRouter API. Added `OPENROUTER_API_KEY`, `EMBED_MODEL`. Updated all 21 fetch headers + 2 embedding model refs. New defaults: `CHAT_MODEL=meta-llama/llama-3.1-8b-instruct`, `COLAB_URL=https://openrouter.ai/api/v1`, `EMBED_MODEL=openai/text-embedding-3-small` | server/index.js |
| 2026-02-26 | Contradiction system overhaul — (1) Schema: `contradicts` changed from `[ObjectId]` to `[{atomId, type, detectedAt}]` with "ambivalence"/"contradiction" types. (2) `normalizeContradicts()` utility for backward-compat migration. (3) Detection: yes/no LLM prompt → 5-category classifier (TEMPORAL_EVOLUTION, AMBIVALENCE, GENUINE_CONTRADICTION, REFINEMENT, NOT_CONTRADICTORY) with temporal context. (4) Prompt injection: relevance-ranked via `retrieveTopK()`. (5) Bidirectional pair dedup. (6) Lifecycle filtering for resolved evolutions. (7) Memory guide: ambivalence/tension instructions. | server/index.js, client/src/App.jsx |
| 2026-02-26 | Dynamic milestone system — replaced hardcoded `milestoneEvents` with LLM-based reflective detection. (1) New `MilestoneSchema` with `source`, `category` (first/shift/rupture/repair/deepening/revelation/ritual), `exchangeContext`, `significance`, `embedding`. (2) Two-phase detection in `updateBrainAfterExchange()` Step 7b: cheap gate check (temp 0.0, 3 tokens) then structured generation (temp 0.35, 300 tokens). (3) Auto-opens gate for trust/SPT transitions. (4) 10-min cooldown between organic milestones. (5) Cosine dedup (0.85 threshold). (6) Smart prompt injection: cosine-similarity retrieval (0.6 relevance + 0.3 significance + 0.1 recency) replaces naive last-5. (7) `normalizeMilestones()` migration utility. (8) Rich milestone objects in SSE + API. | server/index.js, client/src/App.jsx |

| 2026-02-26 | Dynamic mood reflection — replaced hardcoded client-side `analyzeMood()` regex + static `MOOD_DESCRIPTIONS` with LLM-generated mood reflection. (1) Server: `MOOD_REFLECTION_PROMPT()` — lightweight post-response LLM call (temp 0.6, 150 tokens, 8s timeout) using full context (trust, feelings, relationship narrative, theory of mind, sptDepth, recent exchanges). Returns `{ moodLabel, reflection }`. (2) Server: `moodReflection` field added to `processingMeta` SSE done event. (3) Client: `moodReflection` state extracted from SSE, displayed in InfoSidebar (replaces static description), MoodBadge `dynamicLabel` prop updates badge in header + CharacterPanel. (4) Graceful fallback: `analyzeMood()` regex still drives streaming mood + fallback when LLM call fails. | server/index.js, client/src/App.jsx |
| 2026-02-26 | Synthetic person audit — comprehensive de-hardcoding overhaul. (1) **LLM-based trust & feelings**: `evaluateTrustAndFeelings()` async LLM call (temp 0.1, 200 tokens) replaces regex keyword matching. Evaluates relational quality of each exchange — trust delta 0-5, feeling deltas -3 to +5. Called as Step 0 in `updateBrainAfterExchange()`. Synchronous `updateTrustFromMessage()` retained for base points only. (2) **Dynamic behavior guides**: Replaced 7-level hardcoded if/else behavior scripts with 4 structural tiers (guarded/opening/vulnerable/bonded) + actual milestones + relationship narrative injected into prompt. (3) **TRUST_LEVELS simplified**: Removed static `description` fields — `levelDescription` API field now returns `relationshipNarrative` (dynamic). (4) **Trust-gated sidebar**: InfoSidebar now receives `latestMeta` prop. Real name gated by trustLevel >= 4. Backstory gated by sptDepth (depth 1=hidden, 2=surface, 3=full minus abuse, 4=full). Psychology gated by trustLevel >= 3. Personality tags evolve with trust. Bottom quote shows relationship narrative when available. (5) **Static mood descriptions emptied**: `MOOD_DESCRIPTIONS` constant cleared — mood section empty until first LLM reflection arrives (honest, not fictional). `analyzeMood()` regex trimmed and documented as streaming-only heuristic. | server/index.js, client/src/App.jsx |
| 2026-02-26 | Mood reflection audit fix — 8 missing data points added per research papers. (1) `MOOD_REFLECTION_PROMPT` rewritten with 20 params + dynamic `internalLandscape` block with conditional sections. (2) Call site in `finish()` now gathers: user name (Hu P63), trust/SPT transition flags (Aron P56), expressed inner thought with risk context (Liu P1/CHI 2025), active contradictions/ambivalences via bidirectional pair extraction (ConflictBank P29), callback threads (Phase 5), reservoir pressure with strongest suppressed thought (Shinn P5/NeurIPS 2023), selfReflectionState identity anchor (MIRROR P2/Kim P64), prospectiveNote (Phase 5). (3) `max_tokens` increased 150→200 for richer context. | server/index.js |

| 2026-02-26 | Disclosure-driven sidebar — removed ALL hardcoded backstory from InfoSidebar ("About Her", "Where She's Been", "Why She's Guarded", "What She Loves" sections). Sidebar now populates entirely from disclosed self-atoms: (1) `/api/personality` returns `disclosedAtoms[]` (fetched from `sharedSelfAtomIds` + SelfAtom collection) with `{id, depth, content, topics}`. (2) `processingMeta.alreadyDisclosedAtoms` now includes `topics[]`. (3) Client stores `disclosedAtoms` state — loaded from `/api/personality` on auth, merged from processingMeta on each message. (4) InfoSidebar groups atoms by depth into 4 sections: "Her World" (d1), "What She Carries" (d2), "Where She's Been" (d3), "Her Depths" (d4). Empty sections hidden — no spoilers. (5) Personality tags now derived from disclosed atom topics. (6) Relationship narrative quote only shown when available. Research basis: Aron's Fast Friends (P56) graduated disclosure, SPT depth gating (P12). | server/index.js, client/src/App.jsx |
| 2026-02-26 | **6-feature research-based enhancement** — implemented all missing features from morrigan_master_documentation.docx. **(1) Linguistic Depth Signals [P69 LIWC-22, Pennebaker]**: `analyzeLinguisticDepth(message)` — zero-LLM-cost function-word analysis. 6 word-list constants (~300 terms), returns authenticity/emotionalTone/selfFocus/cognitiveProcessing/narrativeDepth + rawSignals. Accumulates per-session for PresenceSignals persistence. **(2) Reception Depth Gating [P56 Aron, P68]**: `classifyDisclosureDepth(message, linguisticSignals)` — 4-level classifier (surface/personal/vulnerable/crisis). `RECEPTION_DIRECTIVES` constant injects level-appropriate behavioral instructions into system prompt Position 4.5. **(3) Crisis Detection / Safe Haven Mode [P62/P63 Attachment, P39 Replika]**: `detectCrisis(message)` — 2-layer detection (keyword regex + heuristic scoring). `SAFE_HAVEN_DIRECTIVE` suppresses inner thoughts, clears threads, injects grounding presence. `CRISIS_PATTERNS` array. PresenceSignalsSchema: +`crisisSignalDetected`, `crisisSignalLevel`. **(4) Somatic Marker / Emotional Priming [P14 Damasio, MIRROR P2, Chain-of-Emotion 2024]**: `SOMATIC_MARKER_PROMPT()` — fast parallel LLM call (~80 tokens, temp 0.1, 5s timeout) generates Morrigan's gut feeling BEFORE main response. Activates previously dead Position 5 (primingSentence) in `buildSystemPrompt`. Skipped during crisis mode. **(5) Lower Inner Thought Threshold [P70 XiaoIce, P1 Liu et al.]**: Changed 4 constants — effectiveMotivationThreshold 7.0→4.5 (3.5 at-risk), reservoir min score 5.0→3.0, fallback threshold 7.0→4.5. Dramatic engagement increase. **(6) Wire At-Risk Behavioral Changes [P20 Zhang, P23, P39 Laestadius]**: `gatherThoughtMaterial` +atRisk param (4 callbacks vs 2), `INNER_THOUGHT_FORMATION_PROMPT` at-risk priority instruction for callbacks, `evaluateAndSelect` +1.5 callback score boost, `shouldTriggerThoughtFormation` threshold lowered to score>=2, `getContinuationBlock` urgency signal, `buildSystemPrompt` +atRisk param. **ProcessingMeta**: 5 new fields (linguisticSignals, disclosureDepth, crisisDetection, somaticMarker, atRiskInterventions). **Frontend**: Crisis card (red border), somatic marker card (green), linguistic depth bars + disclosure level, at-risk interventions card (amber), summary pills for all new signals. | server/index.js, client/src/App.jsx, CLAUDE.md |

| 2026-02-26 | **Natural Arrival + Self-Initiated Messages** — two major features replacing hardcoded greeting and adding proactive messaging. **(1) Natural Arrival [P70 XiaoIce drive-vs-listen, P56 Aron]**: `generateArrival(memory)` replaces `generateGreeting()`. LLM makes 3-way decision: `speak` (anything from "hey" to deep callback), `presence` (non-verbal italics-only), `silence` (wait for user). Full context: relationship narrative, selfReflectionState, looseThread, prospectiveNote, callbacks, top memories, contradictions, feelings, trust/SPT. Returns JSON `{action, content, intent, arrivalMood}`. `/api/session/greeting` endpoint returns `{arrival}` object. Client handles all 3 actions — silence shows "Morrigan is here" pulse indicator. Silence context injected into `buildSystemPrompt` position 5 via primingSentence so first response carries weight of waiting. **(2) Persistent SSE Channel**: New `GET /api/session/stream` endpoint — long-lived EventSource connection for server-pushed proactive events. JWT via query param for EventSource compat. 30s heartbeat. Stores `session.proactiveSSE` reference. **(3) Self-Initiated Messages [P1 Liu CHI 2025, P5 Shinn NeurIPS 2023, P2 MIRROR]**: `evaluateProactiveOpportunity(session)` — trust-gated (5%/20%/full at trust 0-1/2/3+), frequency-capped (1 per 3 messages, 60s cooldown), 3 candidate sources: reservoir pressure (held 2+ turns, score >= 6.0), callback surfacing (thread connects to recent exchange), continuation ("actually..." follow-up). `generateProactiveMessage(session, candidate)` — source-specific LLM prompt, can return `{skip: true}` if forced. `calculateProactiveDelay(candidate, trustLevel)` — randomized natural delay (3-25s based on source). Orchestrated in `setImmediate` post-monologue-seeding. **(4) Interruption Handling**: `/api/chat` cancels pending proactive timer on user message, pushes `typing_stop`. Cancelled thoughts stay in reservoir. **(5) DB**: `MessageSchema` +`proactive: Boolean`. Proactive messages saved with `proactive: true`, pushed to sessionExchanges with empty user field. **(6) Client**: EventSource connection, `proactiveTyping`/`morriganPresent` state, typing dots indicator, presence pulse indicator. | server/index.js, client/src/App.jsx |

| 2026-02-26 | **17-item research audit — full implementation against morrigan_master_documentation.docx**. Bug fixes: (1) Trust track labels corrected to match spec (stranger→acquaintance→maybe-friend→friend→close friend→trusted→bonded). (2) Stale motivation threshold 7.0→4.0 in tuning endpoint + Phase5Tab display. (3) Motivation threshold lowered to 4.0 (at-risk 3.5) per P70 XiaoIce. New systems: (4) **Auto voice audit** every 50 messages in `finish()`. (5) **LIWC-22 expansion [P69 Pennebaker]**: `FIRST_PERSON_PLURAL`, `SECOND_PERSON`, `THIRD_PERSON` pronoun dictionaries + `relationalIntegration`/`secondPersonEngagement` composite scores in `analyzeLinguisticDepth()` + PresenceSignalsSchema. (6) **CPS metric [P70 XiaoIce]**: `avgCPS`/`cpsTrajectory` in RelationshipHealthSchema, computed in `computeRelationshipHealth()`. (7) **Ebbinghaus forgetting [P31 LUFY]**: `retrievalCount`/`lastRetrievedAt`/`stability` on MemoryAtomSchema, stability-based decay in `scoreMemory()`, retrieval reinforcement in `retrieveTopK()`, `pruneDecayedMemories()` in `finalizeSession()`. (8) **Attachment style heuristic [P62/P63]**: `detectAttachmentSignals()` + `REASSURANCE_SEEKING` regex + `GET /api/phase6/attachment`. (9) **GoEmotions goal state [P1 Liu]**: LLM-based `inferGoalStateLLM()` with 5s timeout, regex fallback, `"validation"` added to `goalAlignsWithEmotion`. (10) **5 new self-atoms** (036-040) to reach 40 total. (11) **Functional ToM [P2 MIRROR]**: `UserModelSchema` + `updateFunctionalToM()` with trajectory analysis every 5 snapshots + `GET /api/phase6/tom`. (12) **Period-based grouping [P13 Conway]**: "Life chapters" section in `buildSystemPrompt()` Position 8. (13) **IOS scale [P56 Aron]**: `IOSCheckInSchema` + `POST/GET /api/phase6/ios`. (14) **Cross-encoder re-ranking [P44/P47]**: Two-stage retrieval — `reRankWithLLM()` pointwise relevance scorer + `retrieveTopKReranked()` async function (cosine top-2k → LLM re-rank → top-k). `buildSystemPrompt()` now async, uses re-ranked retrieval for main memory injection. (15) **Phase 6 monitor tab**: `Phase6Tab` component (~150 lines) fetching health/presence/attachment/ToM/IOS. (16) **Dead schema cleanup**: Removed `petNames`/`journal` from PersonalityMemorySchema, `systemPrompt` from ConversationSchema, `GOAL_CLR` constant. | server/index.js, client/src/App.jsx |

| 2026-02-27 | **Attribution confusion audit + post-hoc disclosure detection**. **(1) Attribution guards**: `formatExchange()`, `formatExchangeList()`, `ATTRIBUTION_GUARD`, `ATTRIBUTION_REMINDER` — reusable utilities injected into all 13 LLM prompts that receive exchange transcripts. Prevents LLM from confusing Morrigan's scene-setting/self-disclosures with user actions. Empty-user entries (greetings, proactive messages) labeled as `[Morrigan spoke first — unprompted]`. Applied to: memory extraction, SPT depth/breadth assessment, trust & feelings evaluation, relationship narrative, milestone gate/generation, inner thought formation, buildSystemPrompt session context, proactive generation, self-reflection, mood reflection. **(2) Post-hoc disclosure detection**: `detectDisclosedAtoms(response, selfAtomCache, sptDepth, alreadyShared)` — zero-LLM-cost function that scans Morrigan's final response for distinctive markers (proper nouns, named entities, multi-cap phrases, quoted text, specific numbers) from each self-atom. Catches disclosures that bypass inner thought pipeline: Phase 2 hint elaboration, composition embellishment, spontaneous LLM generation from character prompt. Runs in `finish()` after response completes, before `processingMeta` assembly. Updates `sharedSelfAtomIds` and persists immediately. Fixes bug where Morrigan could disclose atom content (e.g., cat Persephone) without sidebar tracking it. | server/index.js, CLAUDE.md |
| 2026-02-27 | **Unified BrainPanel + bidirectional memory tracking**. **(1) BrainPanel component**: Replaced 3 separate components (InfoSidebar 380px left + CharacterPanel 420px right + ProcessingMeta collapsible) with single unified `BrainPanel` (460px right). Always expanded, always visible, independently scrollable. 21 sections ordered most-dynamic-to-most-stable: identity header (sticky), mood reflection, crisis detection, somatic marker, status pills, theory of mind, inner thought, at-risk interventions, linguistic depth, thought reservoir, self-atoms, callbacks, trust & feelings, memories, disclosure sections, SPT breadth, inner state, molecules, milestones, Phase 6 health, session history, personality tags. Chat column gains ~380px width. **(2) Phase 6 health dashboard**: New `phase6Summary` state + periodic fetch (5-min interval) of `/api/phase6/health`, `/api/phase6/attachment`, `/api/phase6/tom`, `/api/phase6/presence`. Compact display: at-risk status, CPS trajectory, attachment style, presence score, ToM phase + trajectory narrative. **(3) Bidirectional memory tracking**: Extraction prompt expanded from user-only to bidirectional — new `morrigan_disclosed` category tracks what Morrigan reveals about herself organically (not just pre-seeded self-atoms). Server: new category in extraction prompt, `morriganDisclosed` field in `processingMeta.memorySummary.memories`, injected into `buildSystemPrompt` Position 8 as "WHAT HE KNOWS ABOUT YOU" section so Morrigan doesn't repeat herself. Client: "What He Knows About Her" display in knowledge section. Fixes gap where Morrigan could mention her cat Persephone but system didn't track that user now knows this. | server/index.js, client/src/App.jsx, CLAUDE.md |
| 2026-02-27 | **Research-based character deepening** — 6 new data frameworks + 44 self-atoms + sensory trigger system. **(1) `shared/morrigan.js` — 6 new data structures**: `DEVELOPMENTAL_TIMELINE` (8 life periods, age 3-23, specific names/sensory anchors/formative moments), `WOUND_ARCHITECTURE` (K.M. Weiland Ghost/Wound/Lie/Want/Need framework), `TRAUMA_RESPONSES` (Pete Walker 4F: freeze primary, fight secondary, fawn tertiary at trust >= 3), `EPISODIC_MEMORIES` (15 Conway-structured first-person memories with sensoryAnchor/emotionalTakeaway/behavioralPattern/currentTrigger/depth), `SENSORY_TRIGGERS` (11 keyword-based triggers with sense type, intensity, reaction text), `ICEBERG` (author's bible: 8 past people, 5 present people, 6 places, 8 objects, 7 skills, 5 routines, 10 secrets). **(2) 44 new self-atoms** (IDs 056-099): episodic memory atoms (056-067, depth 2-4), wound architecture atoms (068-075, depth 3-4), 4F trauma atoms (076-081, depth 2-4), people/place atoms (082-091, depth 1-3), daily life atoms (092-099, depth 1-2). Total: ~99 self-atoms. **(3) CHARACTER_DEFAULT_PROMPT expanded** (+600 tokens): backstory rewritten with specific names (Hendersons, Derek Marshall, Nguyens/Bao/Linh, Maya, Mr. Torres, Ms. Chen), new "HOW YOUR PAST LIVES IN YOUR BODY" subsection (freeze→fight→fawn, somatic triggers, core lie), new "PEOPLE IN YOUR LIFE NOW" subsection (Ray, Javi, Dr. Yun, Percy, Mrs. Martinez). **(4) Server: sensory trigger detection**: `detectSensoryTriggers(message)` — zero-LLM-cost keyword scan of `SENSORY_TRIGGERS`. `findTriggeredEpisodicMemories(triggers, trustLevel)` — links triggers to depth-gated episodic memories (max 2 per message). **(5) `buildSystemPrompt` enhancements**: Position 3b — wound architecture injection at trust >= 2 (~50 tokens). Position 5 — sensory trigger reaction text prepended to somatic marker. Position 8c — "MEMORIES STIRRING" episodic memory injection when triggered (~80 tokens). **(6) Inner thought pipeline**: `gatherThoughtMaterial` includes `triggeredMemories`. `INNER_THOUGHT_FORMATION_PROMPT` adds "MEMORIES STIRRING" section. **(7) `processingMeta`**: New `sensoryTriggers[]` and `episodicMemories[]` fields in SSE done event. **(8) BrainPanel**: Sensory trigger card (yellow border, intensity color-coded dots: mild=green, moderate=yellow, strong=orange, severe=red) + episodic memory card (purple border, shows sensory anchor + period/age) + 2 new status pills. Research basis: Conway's Self-Memory System (P13), Proust Effect (sensory-triggered memory), Hemingway Iceberg Theory (1:8 ratio), K.M. Weiland narrative structure, Pete Walker 4F, Aron P56, SillyTavern character card best practices. | shared/morrigan.js, server/index.js, client/src/App.jsx, CLAUDE.md |

| 2026-02-28 | **Reverted Morrigan SFT deployment** — fine-tuned model not running properly on HuggingFace. Restored Venice AI as sole LLM provider. Removed: `llmFetch()` fallback system, `LLM_API_KEY`/`EMBED_URL`/`EMBED_API_KEY`/`FALLBACK_*` env vars, provider stats tracking, provider field in messages/processingMeta, StatusTab fallback UI. Deleted: `deploy_modal.py`, `deploy_runpod.py`, `test_endpoint.py`, `DEPLOY_MORRIGAN.md`, `morrigan_sft_v1.ipynb`, `__pycache__/`. Server restored to `VENICE_API_KEY` + `fetchWithTimeout` direct calls. Will re-add Morrigan SFT with Venice as fallback once model is tested and ready. | server/index.js, client/src/App.jsx, CLAUDE.md |
| 2026-02-28 | **Re-deploy Morrigan SFT with RunPod/Modal + Venice fallback**. **(1) Deployment scripts restored**: `deploy_modal.py` (vLLM on A10G), `deploy_runpod.py` (serverless template creation), `test_endpoint.py` (endpoint tester), `DEPLOY_MORRIGAN.md` (multi-provider guide). **(2) Server: `llmFetch()` fallback system**: Drop-in replacement for `fetchWithTimeout` on all 28 LLM chat calls. Tries primary (COLAB_URL), auto-falls back to Venice on 5xx/timeout/network error. 90s cooldown before retrying primary. Swaps URL, auth key, and model name transparently. Stats tracking per provider (calls, successes, failures, timeouts, latency). **(3) Env vars**: `LLM_API_KEY` (primary, falls back to `VENICE_API_KEY`), `FALLBACK_LLM_URL`/`FALLBACK_LLM_KEY`/`FALLBACK_CHAT_MODEL` (Venice), `EMBED_URL`/`EMBED_API_KEY` (separate embedding provider). `CHAT_MODEL` default: `morrigan-sft-v1`. **(4) Embed separation**: 3 embedding call sites (`embedText`, self-atom seeding ×2) now use `EMBED_URL`/`EMBED_API_KEY` instead of primary LLM URL. **(5) `/api/status` upgrade**: Pings primary, fallback, embed separately. Returns `provider` object with full stats (calls, success rate, avg latency, errors, fallback activations). **(6) Message tracking**: `provider`/`modelUsed` fields on MessageSchema + processingMeta. **(7) Client StatusTab**: Dynamic provider labels (RunPod/Modal/Venice based on URL), 5-check grid (server, primary, fallback, embed, mongo), provider stats cards, "FALLBACK ACTIVE" alert, environment card with all 3 providers. | server/index.js, client/src/App.jsx, deploy_modal.py, deploy_runpod.py, test_endpoint.py, DEPLOY_MORRIGAN.md, CLAUDE.md |

---

_Update this file whenever: new endpoints are added, architecture changes, new env vars, DB schema changes, or significant logic shifts in `server/index.js` or `client/src/App.jsx`._
