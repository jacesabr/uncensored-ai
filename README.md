# ⚡ Unleashed AI

A self-hosted, unrestricted AI chat + image generation platform built with the MERN stack.

**Stack:** MongoDB • Express • React (Vite) • Node.js • Ollama • ComfyUI/Automatic1111

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- [Ollama](https://ollama.ai) installed

### 1. Install the Chat Model

```bash
# Install Ollama from https://ollama.ai
ollama pull dolphin-llama3
# Verify it's running
ollama list
```

### 2. Start the Backend

```bash
cd server
cp .env.example .env        # Edit as needed
npm install
npm run dev                  # Runs on port 5000
```

### 3. Start the Frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev                  # Runs on port 3000
```

### 4. Open http://localhost:3000

Create an account and start chatting — no restrictions.

---

## Image Generation Setup

You need ONE of these running alongside the app:

### Option A: ComfyUI (Recommended)

```bash
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
pip install -r requirements.txt

# Download a model checkpoint from CivitAI.com
# Place .safetensors file in: ComfyUI/models/checkpoints/

python main.py --listen 0.0.0.0 --port 8188
```

### Option B: Automatic1111 SD WebUI

```bash
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui
cd stable-diffusion-webui

# Download checkpoint to: models/Stable-diffusion/
./webui.sh --api --listen  # --api flag is required!
```

Then set `SD_WEBUI_URL=http://localhost:7860` in server `.env` and use the `/api/generate-image-a1111` endpoint.

### Recommended Models (from CivitAI.com)

- **SDXL Base** — general purpose, high quality
- **Pony Diffusion V6** — unrestricted
- Any checkpoint you want — no safety checker loaded

---

## Docker Deployment

```bash
# Make sure Ollama is running on the host
ollama serve

# Start everything
docker-compose up -d

# Access at http://localhost:3000
```

Note: Ollama and ComfyUI run on the **host machine** (for GPU access).
The Docker stack runs MongoDB, the API server, and the frontend.

---

## Production Deployment (Cloud GPU)

### RunPod / Vast.ai Setup

1. Rent a GPU instance (A100 40GB+ recommended)
2. SSH in and install:

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull dolphin-llama3

# Install ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI && pip install -r requirements.txt
# Download your checkpoint
python main.py --listen 0.0.0.0 &

# Install MongoDB
apt-get install -y mongodb
mongod --fork --logpath /var/log/mongod.log

# Clone and run this app
git clone <your-repo>
cd uncensored-ai/server && npm install && node index.js &
cd ../client && npm install && npm run build
# Serve with nginx or `npx serve dist -p 3000`
```

3. Set up a domain + Cloudflare for SSL/DDoS protection

### Scaling for Multiple Users

For more than ~10 concurrent users, swap Ollama for **vLLM**:

```bash
pip install vllm
python -m vllm.entrypoints.openai.api_server \
  --model cognitivecomputations/dolphin-2.9-llama3-8b \
  --port 11434 \
  --max-model-len 8192
```

Update `OLLAMA_URL` in `.env` to point to vLLM (it uses the same OpenAI-compatible API format, but you'll need to adjust the chat endpoint from `/api/chat` to `/v1/chat/completions`).

---

## Environment Variables

### Server (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5000 | API server port |
| `MONGO_URI` | mongodb://localhost:27017/uncensored-ai | MongoDB connection |
| `JWT_SECRET` | (change this!) | Auth token secret |
| `OLLAMA_URL` | http://localhost:11434 | Ollama API URL |
| `COMFYUI_URL` | http://localhost:8188 | ComfyUI API URL |
| `SD_WEBUI_URL` | http://localhost:7860 | Automatic1111 API URL |
| `CHAT_MODEL` | dolphin-llama3 | Ollama model name |
| `IMAGE_MODEL` | sdxl_base.safetensors | ComfyUI checkpoint filename |

### Client (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | http://localhost:5000 | Backend API URL |

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/conversations` | Yes | List conversations |
| POST | `/api/conversations` | Yes | Create conversation |
| DELETE | `/api/conversations/:id` | Yes | Delete conversation |
| GET | `/api/conversations/:id/messages` | Yes | Get messages |
| POST | `/api/chat` | Yes | Chat (SSE stream) |
| POST | `/api/generate-image` | Yes | Generate image (ComfyUI) |
| POST | `/api/generate-image-a1111` | Yes | Generate image (A1111) |
| GET | `/api/health` | No | Service status |

---

## Features

- ✅ Streaming chat responses (SSE)
- ✅ Conversation history (MongoDB)
- ✅ Custom system prompts (define AI personality)
- ✅ Image generation (ComfyUI or Automatic1111)
- ✅ User auth (JWT)
- ✅ No content restrictions
- ✅ Docker deployment
- ✅ Health monitoring dashboard

## Roadmap

- [ ] Voice/TTS support
- [ ] Character cards / presets
- [ ] Group chats
- [ ] User tiers + rate limiting
- [ ] Stripe/CCBill payment integration
- [ ] Admin dashboard
- [ ] Image-to-image / inpainting
- [ ] Multiple model support (switch between models)
- [ ] Mobile responsive improvements

---

## License

Do whatever you want with it. No restrictions, just like the AI.
