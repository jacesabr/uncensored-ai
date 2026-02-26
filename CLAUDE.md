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
- **Ollama / llama.cpp** — uncensored model (`dolphin-llama3` or `uncensored_llama.gguf`)
- **Kaggle Notebooks (T4×2 GPU) + ngrok tunnel** — remote LLM hosting
- **Embeddings** — same Llama instance in embedding mode (512 context)
- **ComfyUI / Automatic1111** — optional image generation (Stable Diffusion)

---

## Environment Variables

### `server/.env`
```
PORT=5000
MONGO_URI=mongodb+srv://...          # MongoDB Atlas (default hardcoded in code)
JWT_SECRET=unleashed-secret-2024
CHAT_MODEL=dolphin-llama3
COLAB_URL=https://YOUR-NGROK-URL.ngrok-free.dev   # Kaggle/Colab tunnel
COMFYUI_URL=http://localhost:8188
SD_WEBUI_URL=http://localhost:7860
CLIENT_URL=http://localhost:3000
PHASE4_ASYNC_THOUGHTS=false
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
| `relationshipHealths` | 30-day health trends | `userId`, `sessionFrequency`, `atRisk` |

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

## Prompt Assembly (10 Layers, ~3,900 tokens total)

1. Relationship narrative + self-reflection (~200 tokens)
2. Character spec — full Morrigan definition (~3,200 tokens) — **hardcoded, Morrigan-locked**
3. Trust behavior guide — level-specific (~150 tokens)
4. SPT note — depth gating (~50 tokens)
5. Self-atom hint — depth-eligible atoms (~80 tokens)
6. Inner thought block — if selected (variable)
7. Prospective note — session-start only (~50 tokens)
8. Time absence context — if >24h since last session (~50 tokens)
9. Memory + molecules + contradictions (variable)
10. Memory usage guide + continuation signal (~160 tokens)

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
  relationshipNarrative: string    // Text summary of relationship history
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

---

_Update this file whenever: new endpoints are added, architecture changes, new env vars, DB schema changes, or significant logic shifts in `server/index.js` or `client/src/App.jsx`._
