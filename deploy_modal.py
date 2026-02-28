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
Cost: ~$0.58/hr per active A10G GPU, first $30/month free.
"""

import modal

MODEL_REPO = "JaceSabr/morrigan-sft-v1"
GGUF_FILE = "morrigan-Q5_K_M.gguf"
MODEL_DIR = "/model"

app = modal.App("morrigan-sft")

# Persistent volume caches the GGUF file (avoids re-downloading on cold start)
model_cache = modal.Volume.from_name("morrigan-gguf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "llama-cpp-python",
        "huggingface_hub",
        "hf_transfer",
        "fastapi",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        # Build llama-cpp-python with CUDA support
        "CMAKE_ARGS": "-DGGML_CUDA=on",
    })
)


@app.cls(
    image=image,
    gpu="T4",  # T4 is cheapest and handles 5.7GB GGUF easily
    volumes={MODEL_DIR: model_cache},
    timeout=600,
    scaledown_window=300,  # 5 min idle -> scale to zero
)
@modal.concurrent(max_inputs=4)
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
            n_ctx=4096,
            n_gpu_layers=-1,  # offload everything to GPU
            verbose=False,
        )
        self._stats = {"requests": 0, "tokens": 0}
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

            if stream:
                def generate():
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

                return StreamingResponse(
                    generate(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )
            else:
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
