# Deploy JaceSabr/morrigan-sft-v1 — Complete Guide

## Model Info
- **Model**: `JaceSabr/morrigan-sft-v1`
- **Architecture**: LLaMA 8B, BF16, Safetensors (21.8GB repo)
- **Repo**: Public on HuggingFace
- **Goal**: Production API endpoint for app/website, must auto-scale

## CRITICAL: Chat Template Fix
The model uses a Jinja2 chat template. Messages MUST be a list of dicts, never a string.

**WRONG (causes the UndefinedError):**
```python
messages = "No input example has been defined for this model task."
```

**CORRECT:**
```python
messages = [{"role": "user", "content": "Hello! Who are you?"}]
```

This applies to ALL deployment methods below.

---

## Option 1: Modal (Recommended — easiest, auto-scales, free $30/month)

### Setup
```bash
pip install modal
modal setup        # opens browser to sign up/log in
```

### Deploy
```bash
modal deploy deploy_modal.py
```

### Test
```bash
curl -X POST https://YOUR_USERNAME--morrigan-api-model-chat.modal.run \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}], "max_tokens": 200}'
```

### Scaling
```python
# Edit in deploy_modal.py, then redeploy:
scaler=modal.Scaler(min_containers=0, max_containers=20)  # more GPUs
gpu=modal.gpu.A100(size="40GB")  # faster GPU
container_idle_timeout=300  # keep warm longer
```

### Commands
```bash
modal deploy deploy_modal.py     # deploy / update
modal app logs morrigan-api      # view logs
modal app stop morrigan-api      # stop
modal serve deploy_modal.py      # local test without deploying
```

### Cost: ~$0.36/hr per active GPU, scales to zero when idle. First $30/month free.

---

## Option 2: RunPod Serverless

### Setup
```bash
pip install runpod requests
```
Get API key: https://www.runpod.io/console/user/settings → API Keys

### Deploy
```bash
# Windows
set RUNPOD_API_KEY=your_key_here
python deploy_runpod.py

# Mac/Linux
export RUNPOD_API_KEY=your_key_here
python deploy_runpod.py
```

### Env Variables (if using web UI instead)
```
MODEL_NAME=JaceSabr/morrigan-sft-v1
MAX_MODEL_LEN=4096
DTYPE=bfloat16
GPU_MEMORY_UTILIZATION=0.90
DISABLE_LOG_STATS=true
```

### Troubleshooting
- Workers idle → try `MODEL_ID` instead of `MODEL_NAME`
- OOM → use A40 (48GB)
- First request slow → cold start downloads 21.8GB, takes 5-10 min

---

## Option 3: HuggingFace TGI on any GPU VM (Vast.ai, Lambda, AWS)

### One command after SSH into a GPU VM:
```bash
docker run --gpus all -p 8000:80 -v /data:/data \
  ghcr.io/huggingface/text-generation-inference:latest \
  --model-id JaceSabr/morrigan-sft-v1 \
  --dtype bfloat16 \
  --max-input-tokens 2048 \
  --max-total-tokens 4096
```

### Test
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "JaceSabr/morrigan-sft-v1", "messages": [{"role": "user", "content": "Hello!"}], "max_tokens": 200}'
```

### Cheap GPU VMs: Vast.ai ~$0.30/hr, Lambda ~$0.75/hr, AWS g5.xlarge ~$1.00/hr

---

## Option 4: Ollama + ngrok (Quick from your own PC)

```bash
# Install Ollama from https://ollama.com
ollama run hf.co/JaceSabr/morrigan-sft-v1:Q5_K_M

# API auto-starts at localhost:11434
curl http://localhost:11434/api/chat -d '{
  "model": "hf.co/JaceSabr/morrigan-sft-v1:Q5_K_M",
  "messages": [{"role": "user", "content": "Hello!"}]
}'

# Expose to internet:
# Install ngrok from https://ngrok.com
ngrok http 11434
```

---

## Cost Comparison

| Provider | GPU | $/hr | Scale to zero | Setup |
|----------|-----|------|---------------|-------|
| Modal | A10G | ~$0.36 | Yes | Very Easy |
| RunPod | A40 | ~$0.40 | Yes | Medium |
| Vast.ai + TGI | A40 | ~$0.30 | No | Medium |
| Lambda Labs | A10 | ~$0.75 | No | Easy |
| HF Endpoints | L40S | ~$1.80 | Yes | Easy |
| Ollama + ngrok | Yours | Free | No | Very Easy |

---

## App Integration

See `server/index.js` — the server auto-detects the provider based on `COLAB_URL`:
- **Modal**: Set `COLAB_URL=https://YOUR_USERNAME--morrigan-api-model-chat.modal.run`
- **RunPod**: Set `COLAB_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID`
- **TGI/vLLM**: Set `COLAB_URL=http://YOUR_VM_IP:8000/v1`
- **OpenRouter**: Set `COLAB_URL=https://openrouter.ai/api/v1`

The server handles format differences (RunPod's `input` wrapper, OpenRouter's auth headers, etc.) automatically.

---

## Recommendation
1. **Try Modal first** — `pip install modal && modal setup && modal deploy deploy_modal.py`
2. If Modal doesn't work → RunPod script or web UI
3. If neither works → Vast.ai + TGI Docker (one command)
4. For quick local testing → Ollama
