# Unleashed AI — Morrigan

A self-hosted AI chat platform built around a single character: **Morrigan** (real name: Moira), a 28-year-old who runs a small record store. No content restrictions. Deeply personalized emotional AI with persistent memory, trust progression, and inner thought simulation.

**Stack:** MongoDB Atlas · Express · React (Vite) · Node.js · Venice AI (LLM + embeddings)

---

## What This Is

This is not a generic chatbot shell. It's a complete relationship simulation system:

- **Persistent memory** — remembers facts, feelings, and relationship history across sessions
- **Trust progression** — Morrigan behaves differently at trust levels 0–6; she opens up slowly and authentically
- **Inner thought pipeline** — generates an internal monologue before responding, then optionally weaves it in
- **Self-disclosure system** — 99 depth-gated "self-atoms" unlock as trust deepens
- **Proactive messaging** — Morrigan can initiate conversation when something is on her mind
- **Crisis detection** — activates safe haven mode for distress signals
- **Emotional memory** — memories are embedded, weighted by importance and recency, and decay over time

The fine-tuned model (`JaceSabr/morrigan-sft-v1`) is trained on ~3,000 hand-written conversations specifically for this character.

---

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Venice AI account — [venice.ai](https://venice.ai) (for LLM + embeddings)

### 1. Backend

```bash
cd server
cp .env.example .env   # fill in your keys (see Environment Variables below)
npm install
npm run dev            # runs on port 5000
```

### 2. Frontend

```bash
cd client
npm install
npm run dev            # runs on port 3000, proxies /api/* → :5000
```

### 3. Seed Morrigan's Self-Atoms (run once)

```bash
curl -X POST http://localhost:5000/api/self-atoms/seed
```

### 4. Open http://localhost:3000

Create an account with any passphrase and start chatting.

---

## Environment Variables

### `server/.env`

```env
PORT=5000
MONGO_URI=mongodb+srv://...           # MongoDB Atlas connection string
JWT_SECRET=your-secret-here

# Primary LLM — Venice AI (or any OpenAI-compatible endpoint)
COLAB_URL=https://api.venice.ai/api
CHAT_MODEL=venice-uncensored
VENICE_API_KEY=your-venice-key

# Embeddings (separate from chat — Venice provides both)
EMBED_URL=https://api.venice.ai/api
EMBED_API_KEY=your-venice-key
EMBED_MODEL=text-embedding-3-small

# Optional: Fine-tuned model comparison (dual-bubble UI)
# Set FT_URL to your serving endpoint (see morrigan_sft_server.ipynb)
FT_URL=
FT_API_KEY=

CLIENT_URL=http://localhost:3000
```

---

## Fine-Tuned Model

### Dataset

`finetuned_files/golden_sft_final.jsonl` — **2,977 training records** across 19 phases:

| Phase | Content | Records |
|-------|---------|---------|
| 00 (×5 batches) | Base record rewrites with full character voice | 1,614 |
| 01–10 | New conversations: record store, music, emotional depth, inner thoughts, crisis, edge cases | 500 |
| 11–14 | Romantic arc expansion: physical presence, attraction, intimacy, texture | 707 |

All records are hand-crafted with Morrigan's specific voice: rings-as-tempo markers (`*rings clicking*`, `*rings slow*`, `*rings stop*`), fragment sentences, deflect-then-soften pattern, and full character canon (Percy the cat, Ray, Hollow Vinyl, the STILL tattoo, Dr. Yun, fire escape drawings).

### Fine-Tuning on Colab

**[`finetune_morrigan.ipynb`](finetune_morrigan.ipynb)** — complete QLoRA fine-tuning notebook. Open in Colab and run top to bottom.

What it does:
1. Installs transformers / peft / trl / bitsandbytes
2. Loads and formats the dataset in LLaMA 3.1 chat format
3. Loads `meta-llama/Meta-Llama-3.1-8B-Instruct` with 4-bit NF4 quantization
4. Applies LoRA (rank 32, all attention + MLP layers)
5. Trains with `SFTTrainer` — completion-only loss (user turns not penalized)
6. Merges LoRA adapter into full model
7. Converts to Q5_K_M GGUF for serving

**Required GPU:** A100 40GB (~2-3h) or L4 24GB (~4-5h). Set `BATCH_SIZE=1` on L4.

**Required:** HuggingFace account with Llama 3.1 access approved at `meta-llama/Meta-Llama-3.1-8B-Instruct`.

### Serving the Fine-Tuned Model

**[`morrigan_sft_server.ipynb`](morrigan_sft_server.ipynb)** — serves the GGUF file as an API via FastAPI + ngrok.

Once running, set `FT_URL` in `server/.env` to the ngrok URL to enable the dual-model comparison UI.

### Testing Quality

**[`test_morrigan_colab.ipynb`](test_morrigan_colab.ipynb)** — runs Morrigan-specific quality checks against the GGUF model: voice consistency, character knowledge, full production system prompt simulation.

---

## Deployment (Cloud)

### Venice AI (current default)

No setup needed — just add `VENICE_API_KEY` to `.env`. Venice provides uncensored LLM + embeddings.

### RunPod Serverless

```bash
python deploy_runpod.py   # creates a serverless endpoint from morrigan-sft-v1
```

Set `COLAB_URL` to the RunPod endpoint URL and `CHAT_MODEL=morrigan-sft-v1`.

### Modal (vLLM on A10G)

```bash
python deploy_modal.py   # deploys vLLM serving the fine-tuned model
```

See [`DEPLOY_MORRIGAN.md`](DEPLOY_MORRIGAN.md) for full multi-provider deployment guide.

### Railway (recommended for the web app itself)

Connect this repo to Railway. It auto-deploys on push to `main`. Set environment variables in the Railway dashboard.

---

## Project Structure

```
uncensored-ai/
├── server/index.js             — All backend logic (3,200+ lines)
├── client/src/App.jsx          — All frontend logic (3,000+ lines)
├── finetune_morrigan.ipynb     — QLoRA fine-tuning guide (run on Colab)
├── morrigan_sft_server.ipynb   — Serve GGUF model via FastAPI + ngrok
├── test_morrigan_colab.ipynb   — Quality test suite for fine-tuned model
├── deploy_modal.py             — Modal serverless deployment
├── deploy_runpod.py            — RunPod serverless deployment
├── DEPLOY_MORRIGAN.md          — Full deployment guide
├── CLAUDE.md                   — Codebase reference for AI-assisted development
└── finetuned_files/
    ├── golden_sft_final.jsonl  — Final training dataset (2,977 records)
    ├── golden_sft.jsonl        — Source base records (1,615)
    ├── build_dataset.js        — Rebuilds golden_sft_final.jsonl from phases
    ├── PROGRESS.md             — Dataset build log and phase descriptions
    └── phases/                 — 19 individual phase JSONL files
```

---

## License

Do whatever you want with it.
