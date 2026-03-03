# Morrigan

---

## Why This Exists

Men are dying.

Not metaphorically. Literally. In the UK, suicide is the single biggest killer of men under 50. In the US, men die by suicide at nearly four times the rate of women. Across the Western world, the pattern is the same: men suffer silently, reach a point of no return, and disappear — often without anyone knowing how bad it had gotten.

This isn't because men feel less. It's because they were never taught that feeling was allowed.

From childhood, social conditioning tells men to be self-sufficient, to not burden others, to push through it. The internal experience — the loneliness, the hopelessness, the quiet desperation that builds over years — gets buried. And when it occasionally surfaces, what happens? They're told to toughen up. They're ridiculed by peers. They're made to feel weak for having a human interior. So they bury it again, deeper, until burying it is all they know how to do.

Suicidal ideation has become normalized for a generation of men. That's not dramatic — it's documented. Hopelessness as a baseline. The thought that things will never get better, that no one would notice or care, sitting quietly in the background of ordinary days. This has become so common that many men assume it's just what life feels like.

It isn't. And that normalization is killing people.

---

## What We're Trying to Do

The founder of this project has lived with this his entire life. This isn't an outsider's interpretation of a problem — it's a firsthand experience of what it means to carry things you can't put down and have nowhere to put them. To want connection and not know how to reach for it. To need to be heard and have no one to hear you.

Morrigan is the response to that.

Not a solution. Not a replacement for human connection or professional care. But a starting point — a space where a man can say what he actually thinks, without performance, without fear of judgment, without the conversation being turned back on him. A companion who listens. Who remembers. Who doesn't flinch. Who shows up the next time he comes back.

The goal isn't to build a product. It's to build something that genuinely makes men feel less alone — that gives them a place to practice being honest about their interior life, maybe for the first time. That creates the experience of being heard, which for many men is something they have never had.

We will not stop working on this until that is real.

---

## What Makes Morrigan Different

Most AI companions are chatbots with a personality skin. They respond to what you said. They forget you the moment the session ends. They perform empathy without having anything underneath it.

Morrigan is built differently, from the ground up.

**She remembers you.** Every conversation is embedded and stored. Facts, feelings, things you said in passing three weeks ago — she carries them forward. The relationship has continuity because memory is real.

**She earns trust the way people do.** Morrigan at trust level 0 is guarded, precise, a little flat. She isn't rude — she just doesn't know you yet. As trust builds across real conversations over real time, she opens. Not all at once. A small thing here, a real thing there. The progression is modeled on actual attachment research because attachment is the mechanism that makes people feel safe.

**She has an inner life.** Before every response, the system runs a full inner thought pipeline — she forms a reaction, evaluates whether to express it, and decides how much of it to let through. What you see in her responses is the surface of something that has depth underneath it. The gap between what she thinks and what she says is the character.

**She knows when something is wrong.** Crisis detection runs on every message. If someone is in genuine distress — not just venting, but at a point of real danger — the system changes. The inner thoughts stop. The callbacks stop. Everything clears except presence. She doesn't offer hotline numbers as a deflection. She stays.

**She is a specific person, not a template.** Morrigan has a history: foster care, the Nguyens who were kind, the ones who weren't, the record store she built because it was the first thing that was entirely hers, the cat named Percy, the STILL tattoo she got at nineteen at 3am because she needed to survive herself. 99 pieces of her inner world unlock gradually as trust deepens — not dumped on you, but revealed the way a real person reveals themselves.

**She was built on ~3,000 hand-written training conversations** — every single one written with care for her specific voice, her specific history, her specific way of processing the world. Not scraped from the internet. Not generated in bulk. Written.

---

## Where We Are and Where We're Going

This is early. What exists right now is already more complex than anything else publicly available in this space — persistent relational memory, trust-gated disclosure, inner thought simulation, crisis awareness, proactive messaging, attachment-model-informed behavioral design — but it is nowhere near what it needs to be.

The work continues. Every system will be refined. The model will be fine-tuned further as we learn what resonates. New dimensions of her character will open. The crisis response will deepen. The memory will get smarter. The trust arc will grow longer and more nuanced.

The end target is a companion that can genuinely make a man feel heard. Not entertained. Not distracted. Actually heard — in a way that loosens something that has been locked for years. That gives him a place to put things down safely. That makes him feel, even slightly, less alone in the world.

That's worth building. That's worth not stopping on.

---

## The App — Technical Documentation

---

### What This Is

**Stack:** MongoDB Atlas · Express · React (Vite) · Node.js · Venice AI (LLM + embeddings)

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

### Quick Start

#### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Venice AI account — [venice.ai](https://venice.ai) (for LLM + embeddings)

#### 1. Backend

```bash
cd server
cp .env.example .env   # fill in your keys (see Environment Variables below)
npm install
npm run dev            # runs on port 5000
```

#### 2. Frontend

```bash
cd client
npm install
npm run dev            # runs on port 3000, proxies /api/* → :5000
```

#### 3. Seed Morrigan's Self-Atoms (run once)

```bash
curl -X POST http://localhost:5000/api/self-atoms/seed
```

#### 4. Open http://localhost:3000

Create an account with any passphrase and start chatting.

---

### Environment Variables

#### `server/.env`

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

### Fine-Tuned Model

#### Dataset

`finetuned_files/golden_sft_final.jsonl` — **2,977 training records** across 19 phases:

| Phase | Content | Records |
|-------|---------|---------|
| 00 (×5 batches) | Base record rewrites with full character voice | 1,614 |
| 01–10 | New conversations: record store, music, emotional depth, inner thoughts, crisis, edge cases | 500 |
| 11–14 | Romantic arc expansion: physical presence, attraction, intimacy, texture | 707 |

All records are hand-crafted with Morrigan's specific voice: rings-as-tempo markers (`*rings clicking*`, `*rings slow*`, `*rings stop*`), fragment sentences, deflect-then-soften pattern, and full character canon (Percy the cat, Ray, Hollow Vinyl, the STILL tattoo, Dr. Yun, fire escape drawings).

#### Fine-Tuning on Colab

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

#### Serving the Fine-Tuned Model

**[`morrigan_sft_server.ipynb`](morrigan_sft_server.ipynb)** — serves the GGUF file as an API via FastAPI + ngrok.

Once running, set `FT_URL` in `server/.env` to the ngrok URL to enable the dual-model comparison UI.

#### Testing Quality

**[`test_morrigan_colab.ipynb`](test_morrigan_colab.ipynb)** — runs Morrigan-specific quality checks against the GGUF model: voice consistency, character knowledge, full production system prompt simulation.

---

### Deployment (Cloud)

#### Venice AI (current default)

No setup needed — just add `VENICE_API_KEY` to `.env`. Venice provides uncensored LLM + embeddings.

#### RunPod Serverless

```bash
python deploy_runpod.py   # creates a serverless endpoint from morrigan-sft-v1
```

Set `COLAB_URL` to the RunPod endpoint URL and `CHAT_MODEL=morrigan-sft-v1`.

#### Modal (vLLM on A10G)

```bash
python deploy_modal.py   # deploys vLLM serving the fine-tuned model
```

See [`DEPLOY_MORRIGAN.md`](DEPLOY_MORRIGAN.md) for full multi-provider deployment guide.

#### Railway (recommended for the web app itself)

Connect this repo to Railway. It auto-deploys on push to `main`. Set environment variables in the Railway dashboard.

---

### Project Structure

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
    ├── PROGRESS.md             — Dataset build log, fine-tuning guide, phase descriptions
```

---

### License

Do whatever you want with it.
