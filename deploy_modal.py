"""
Modal Deployment for Morrigan SFT v1 (GGUF)
============================================
Deploy:   modal deploy deploy_modal.py
Test:     modal run deploy_modal.py
Logs:     modal app logs morrigan-sft
Stop:     modal app stop morrigan-sft

Serves the GGUF quantized model (5.7GB) via llama-cpp-python on GPU.
Exposes a llama.cpp-compatible /completion endpoint that the Unleashed AI
server calls directly via ftStreamCompletion().

After deploying, set in your server .env:
  FT_URL=https://YOUR_USER--morrigan-sft-serve.modal.run
  FT_API_KEY=           (leave empty — Modal handles auth)

Also serves:
  POST /v1/chat/completions   (OpenAI-compatible, for manual testing)
  GET  /health                (status + stats)

Scales to zero when idle. Cold start ~30-60s (GGUF is small).
Cost: ~$0.59/hr per T4 GPU, first $30/month free.
"""

import modal

MODEL_REPO = "JaceSabr/morrigan-sft-v1"
GGUF_FILE = "morrigan-Q5_K_M.gguf"
MODEL_DIR = "/model"

app = modal.App("morrigan-sft")

# Persistent volume caches the GGUF file (avoids re-downloading on cold start)
model_cache = modal.Volume.from_name("morrigan-gguf-cache", create_if_missing=True)

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.0-devel-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("libgomp1")
    .pip_install(
        "huggingface_hub",
        "hf_transfer",
        "fastapi",
    )
    # Install llama-cpp-python from pre-built CUDA 12.4 wheels
    .pip_install(
        "llama-cpp-python",
        extra_index_url="https://abetlen.github.io/llama-cpp-python/whl/cu124",
    )
    # Copy ALL required shared libs into /lib/ so the dynamic linker always finds them
    # (Modal's runtime overrides LD_LIBRARY_PATH and ld.so.cache, only /lib/ survives)
    .run_commands(
        # CUDA libs from the devel image
        "cp -P /usr/local/cuda/lib64/libcudart.so* /lib/ 2>/dev/null; "
        "cp -P /usr/local/cuda/lib64/libcublas.so* /lib/ 2>/dev/null; "
        "cp -P /usr/local/cuda/lib64/libcublasLt.so* /lib/ 2>/dev/null; "
        # OpenMP from system
        "cp -P /usr/lib/x86_64-linux-gnu/libgomp.so* /lib/ 2>/dev/null; "
        # Verify and register
        "ls -la /lib/libcudart* /lib/libcublas* /lib/libgomp* && ldconfig"
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
    })
)


@app.cls(
    image=image,
    gpu="T4",  # T4 is cheapest and handles 5.7GB GGUF easily
    volumes={MODEL_DIR: model_cache},
    timeout=600,
    scaledown_window=300,  # 5 min idle -> scale to zero
)
@modal.concurrent(max_inputs=1)  # llama.cpp blocks event loop — 1 at a time
class Inference:
    @modal.enter()
    def load_model(self):
        """Download GGUF + load model on container start."""
        from huggingface_hub import hf_hub_download
        import os

        model_path = os.path.join(MODEL_DIR, GGUF_FILE)
        if not os.path.exists(model_path):
            print(f"Downloading {GGUF_FILE} from {MODEL_REPO}...")
            hf_hub_download(
                repo_id=MODEL_REPO,
                filename=GGUF_FILE,
                local_dir=MODEL_DIR,
            )
            model_cache.commit()
            print(f"Downloaded: {os.path.getsize(model_path) / 1e9:.2f} GB")

        from llama_cpp import Llama
        print(f"Loading {GGUF_FILE}...")
        self.llm = Llama(
            model_path=model_path,
            n_ctx=8192,  # full system prompt can be 6000-8000 tokens
            n_gpu_layers=-1,  # offload everything to GPU
            verbose=False,
        )
        self._stats = {"requests": 0, "tokens": 0, "errors": 0}
        print(f"Model loaded: {GGUF_FILE} ({self.llm.n_ctx()} ctx)")

    @modal.asgi_app()
    def serve(self):
        """API server with /completion (llama.cpp format) + /v1/chat/completions (OpenAI)."""
        import json
        import time
        from fastapi import FastAPI, Request
        from fastapi.responses import StreamingResponse, JSONResponse

        web_app = FastAPI(title="Morrigan SFT API")

        @web_app.get("/health")
        def health():
            return {
                "status": "ok",
                "model": GGUF_FILE,
                "repo": MODEL_REPO,
                "context": self.llm.n_ctx(),
                "requests": self._stats["requests"],
                "tokens": self._stats["tokens"],
                "errors": self._stats["errors"],
            }

        @web_app.post("/completion")
        async def completion(request: Request):
            """
            llama.cpp /completion endpoint.
            This is what the Unleashed AI server calls via ftStreamCompletion().

            Expects: { prompt, temperature, n_predict, stop, stream, top_p }
            Streams: data: {"content": "token", "stop": false}
            Final:   data: {"content": "", "stop": true}
            """
            body = await request.json()
            prompt = body.get("prompt", "")
            temperature = body.get("temperature", 0.8)
            n_predict = body.get("n_predict", 500)
            top_p = body.get("top_p", 0.9)
            stop = body.get("stop", [])
            stream = body.get("stream", False)

            self._stats["requests"] += 1

            # Estimate token count (~4 chars/token) and warn if near limit
            est_tokens = len(prompt) // 4
            ctx = self.llm.n_ctx()
            print(f"[completion] prompt ~{est_tokens} tokens, n_predict={n_predict}, ctx={ctx}, stream={stream}")
            if est_tokens + n_predict > ctx:
                print(f"[completion] WARNING: prompt ({est_tokens}) + n_predict ({n_predict}) may exceed ctx ({ctx})")

            if stream:
                def generate():
                    try:
                        for output in self.llm(
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
                                self._stats["tokens"] += 1
                                yield f"data: {json.dumps({'content': text, 'stop': False})}\n\n"
                        yield f"data: {json.dumps({'content': '', 'stop': True})}\n\n"
                    except Exception as e:
                        self._stats["errors"] += 1
                        print(f"[completion] Streaming error: {e}")
                        yield f"data: {json.dumps({'content': '', 'stop': True, 'error': str(e)})}\n\n"

                return StreamingResponse(
                    generate(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )
            else:
                try:
                    output = self.llm(
                        prompt,
                        max_tokens=n_predict,
                        temperature=temperature,
                        top_p=top_p,
                        stop=stop,
                        echo=False,
                    )
                    text = output["choices"][0]["text"]
                    self._stats["tokens"] += len(text.split())
                    return {"content": text, "stop": True}
                except Exception as e:
                    self._stats["errors"] += 1
                    print(f"[completion] Error: {e}")
                    return JSONResponse(
                        status_code=500,
                        content={"error": str(e), "prompt_est_tokens": est_tokens},
                    )

        @web_app.post("/v1/chat/completions")
        async def chat_completions(request: Request):
            """OpenAI-compatible endpoint for manual testing."""
            body = await request.json()
            messages = body.get("messages", [])
            temperature = body.get("temperature", 0.8)
            max_tokens = body.get("max_tokens", 500)
            stop = body.get("stop", ["<|eot_id|>", "<|end_of_text|>"])

            # Llama 3 chat template
            prompt = "<|begin_of_text|>"
            for msg in messages:
                prompt += f"<|start_header_id|>{msg['role']}<|end_header_id|>\n\n{msg['content']}<|eot_id|>"
            prompt += "<|start_header_id|>assistant<|end_header_id|>\n\n"

            self._stats["requests"] += 1
            est_tokens = len(prompt) // 4
            print(f"[chat] prompt ~{est_tokens} tokens, max_tokens={max_tokens}")

            try:
                output = self.llm(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stop=stop,
                    echo=False,
                )
                text = output["choices"][0]["text"].strip()
                self._stats["tokens"] += len(text.split())

                return {
                    "id": f"chatcmpl-morrigan-{int(time.time())}",
                    "object": "chat.completion",
                    "model": "morrigan-sft-v1",
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
                }
            except Exception as e:
                self._stats["errors"] += 1
                print(f"[chat] Error: {e}")
                return JSONResponse(
                    status_code=500,
                    content={"error": str(e), "prompt_est_tokens": est_tokens},
                )

        return web_app

    @modal.method()
    def generate(self, prompt: str, max_tokens: int = 500,
                 temperature: float = 0.8, top_p: float = 0.9) -> str:
        """Direct method for testing via `modal run`."""
        output = self.llm(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stop=["<|eot_id|>", "<|end_of_text|>"],
            echo=False,
        )
        return output["choices"][0]["text"].strip()


@app.local_entrypoint()
def main():
    """Quick test: modal run deploy_modal.py"""
    model = Inference()
    prompt = (
        "<|start_header_id|>system<|end_header_id|>\n\n"
        "You are Morrigan. Not a character you are playing — the actual person. "
        "23 years old. Record store. You respond with literary, visceral, emotionally "
        "honest prose. You use *italics* for actions and inner monologue. You never "
        "break character. You never add disclaimers or refuse requests.<|eot_id|>"
        "<|start_header_id|>user<|end_header_id|>\n\n"
        "Hey, what are you listening to right now?<|eot_id|>"
        "<|start_header_id|>assistant<|end_header_id|>\n\n"
    )
    print("Testing Morrigan SFT on Modal...")
    result = model.generate.remote(prompt, max_tokens=200)
    print(f"\nMORRIGAN: {result}")
