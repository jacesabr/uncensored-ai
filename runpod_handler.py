"""
RunPod Serverless Handler for Morrigan SFT v1 (GGUF)
This file runs inside the Docker container on RunPod workers.

Accepts the same input format as llama.cpp /completion:
  { "prompt": "...", "temperature": 0.8, "n_predict": 500, "stop": [...] }

Supports both sync (handler) and streaming (generator_handler) modes.
"""

import runpod
from llama_cpp import Llama
from huggingface_hub import hf_hub_download
import os

MODEL_REPO = "JaceSabr/morrigan-sft-v1"
GGUF_FILE = "morrigan-Q5_K_M.gguf"
MODEL_DIR = "/model"

# ── Download + Load Model (runs once on worker start) ──
model_path = os.path.join(MODEL_DIR, GGUF_FILE)
if not os.path.exists(model_path):
    print(f"Downloading {GGUF_FILE} from {MODEL_REPO}...")
    os.makedirs(MODEL_DIR, exist_ok=True)
    hf_hub_download(repo_id=MODEL_REPO, filename=GGUF_FILE, local_dir=MODEL_DIR)

print(f"Loading {GGUF_FILE}...")
llm = Llama(model_path=model_path, n_ctx=4096, n_gpu_layers=-1, verbose=False)
print(f"Model loaded: {GGUF_FILE} ({llm.n_ctx()} ctx)")


def handler(job):
    """Sync handler — returns full response."""
    inp = job["input"]
    prompt = inp.get("prompt", "")
    temperature = inp.get("temperature", 0.8)
    n_predict = inp.get("n_predict", 500)
    top_p = inp.get("top_p", 0.9)
    stop = inp.get("stop", ["<|eot_id|>", "<|end_of_text|>"])

    output = llm(
        prompt,
        max_tokens=n_predict,
        temperature=temperature,
        top_p=top_p,
        stop=stop,
        echo=False,
    )

    return {"content": output["choices"][0]["text"], "stop": True}


def generator_handler(job):
    """Streaming handler — yields tokens for /run + /stream endpoints."""
    inp = job["input"]
    prompt = inp.get("prompt", "")
    temperature = inp.get("temperature", 0.8)
    n_predict = inp.get("n_predict", 500)
    top_p = inp.get("top_p", 0.9)
    stop = inp.get("stop", ["<|eot_id|>", "<|end_of_text|>"])

    for output in llm(
        prompt,
        max_tokens=n_predict,
        temperature=temperature,
        top_p=top_p,
        stop=stop,
        stream=True,
        echo=False,
    ):
        text = output["choices"][0]["text"]
        if text:
            yield {"content": text, "stop": False}

    yield {"content": "", "stop": True}


runpod.serverless.start({"handler": handler, "generator_handler": generator_handler})
