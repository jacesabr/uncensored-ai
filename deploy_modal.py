"""
Modal Deployment for JaceSabr/morrigan-sft-v1
==============================================
Deploy:   modal deploy deploy_modal.py
Test:     modal run deploy_modal.py
Logs:     modal app logs morrigan-api
Stop:     modal app stop morrigan-api

Exposes an OpenAI-compatible API with SSE streaming at:
  POST /v1/chat/completions   (streaming + non-streaming)
  GET  /v1/models
  GET  /health

After deploying, set in your server .env:
  COLAB_URL=https://YOUR_USER--morrigan-api-inference-serve.modal.run
  LLM_API_KEY=           (leave empty — Modal handles auth)
  CHAT_MODEL=morrigan-sft-v1

Scales to zero when idle. Cold start ~3-5 min (model cached after first run).
Cost: ~$0.36/hr per active A10G GPU, first $30/month free.
"""

import modal

MODEL_NAME = "JaceSabr/morrigan-sft-v1"
MODEL_DIR = "/model"

app = modal.App("morrigan-api")

# Persistent volume caches the HF model (avoids re-downloading on cold start)
model_cache = modal.Volume.from_name("morrigan-model-cache", create_if_missing=True)

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm==0.7.3",
        "huggingface_hub",
        "hf_transfer",
        "fastapi",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)


@app.cls(
    image=vllm_image,
    gpu="A10G",
    volumes={MODEL_DIR: model_cache},
    timeout=600,
    scaledown_window=300,  # 5 min idle -> scale to zero
)
@modal.concurrent(max_inputs=10)
class Inference:
    @modal.enter()
    def load_model(self):
        """Download + load model on container start (cached after first run)."""
        from huggingface_hub import snapshot_download
        from vllm import LLM
        from transformers import AutoTokenizer
        import os

        if not os.path.exists(f"{MODEL_DIR}/config.json"):
            print(f"Downloading {MODEL_NAME}...")
            snapshot_download(MODEL_NAME, local_dir=MODEL_DIR)
            model_cache.commit()

        print(f"Loading {MODEL_NAME}...")
        self.llm = LLM(
            model=MODEL_DIR,
            dtype="bfloat16",
            max_model_len=4096,
            gpu_memory_utilization=0.90,
            trust_remote_code=True,
        )
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
        print("Model loaded!")

    @modal.asgi_app()
    def serve(self):
        """OpenAI-compatible API server with streaming support."""
        import json
        import uuid
        import time
        from fastapi import FastAPI, Request
        from fastapi.responses import StreamingResponse, JSONResponse

        web_app = FastAPI(title="Morrigan API")

        @web_app.post("/v1/chat/completions")
        async def chat_completions(request: Request):
            body = await request.json()
            messages = body.get("messages", [])
            if not messages:
                return JSONResponse({"error": "messages is required"}, status_code=400)

            max_tokens = body.get("max_tokens", 512)
            temperature = body.get("temperature", 0.7)
            top_p = body.get("top_p", 0.9)
            stream = body.get("stream", False)

            # Chat template requires list of dicts
            if isinstance(messages, str):
                messages = [{"role": "user", "content": messages}]

            prompt = self.tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True,
            )

            from vllm import SamplingParams
            params = SamplingParams(
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stop=body.get("stop") or [],
            )

            outputs = self.llm.generate([prompt], params)
            output = outputs[0]
            text = output.outputs[0].text
            finish = output.outputs[0].finish_reason or "stop"
            p_tokens = len(output.prompt_token_ids)
            c_tokens = len(output.outputs[0].token_ids)
            rid = f"chatcmpl-{uuid.uuid4().hex[:12]}"
            ts = int(time.time())

            if stream:
                async def sse_stream():
                    # Chunk generated text into ~4-token pieces for streaming UX
                    tokens = self.tokenizer.encode(text)
                    chunk_size = 4
                    for i in range(0, len(tokens), chunk_size):
                        chunk = self.tokenizer.decode(tokens[i:i + chunk_size])
                        yield f"data: {json.dumps({'id': rid, 'object': 'chat.completion.chunk', 'created': ts, 'model': MODEL_NAME, 'choices': [{'index': 0, 'delta': {'content': chunk}, 'finish_reason': None}]})}\n\n"

                    yield f"data: {json.dumps({'id': rid, 'object': 'chat.completion.chunk', 'created': ts, 'model': MODEL_NAME, 'choices': [{'index': 0, 'delta': {}, 'finish_reason': finish}]})}\n\n"
                    yield "data: [DONE]\n\n"

                return StreamingResponse(
                    sse_stream(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )

            return {
                "id": rid, "object": "chat.completion", "created": ts,
                "model": MODEL_NAME,
                "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": finish}],
                "usage": {"prompt_tokens": p_tokens, "completion_tokens": c_tokens, "total_tokens": p_tokens + c_tokens},
            }

        @web_app.get("/v1/models")
        def list_models():
            return {"object": "list", "data": [{"id": MODEL_NAME, "object": "model"}]}

        @web_app.get("/health")
        def health():
            return {"status": "ok", "model": MODEL_NAME}

        return web_app

    @modal.method()
    def generate(self, messages: list[dict], max_tokens: int = 512,
                 temperature: float = 0.7, top_p: float = 0.9) -> dict:
        """Direct method for testing via modal run."""
        from vllm import SamplingParams

        prompt = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True,
        )
        params = SamplingParams(max_tokens=max_tokens, temperature=temperature, top_p=top_p)
        outputs = self.llm.generate([prompt], params)
        return {
            "choices": [{"message": {"role": "assistant", "content": outputs[0].outputs[0].text}}],
            "usage": {"prompt_tokens": len(outputs[0].prompt_token_ids), "completion_tokens": len(outputs[0].outputs[0].token_ids)},
        }


@app.local_entrypoint()
def main():
    """Quick test: modal run deploy_modal.py"""
    model = Inference()
    print("Testing Morrigan on Modal...")
    result = model.generate.remote(
        messages=[{"role": "user", "content": "Hello! Who are you?"}],
        max_tokens=200,
    )
    print(f"\nResponse: {result['choices'][0]['message']['content']}")
    print(f"Tokens: {result['usage']}")
