"""
RunPod Serverless Deployment for Morrigan SFT v1 (GGUF)
========================================================

Two deployment options:

OPTION A — Serverless (recommended, pay-per-use):
  1. Build Docker image:
       docker build -f Dockerfile.runpod -t YOUR_DOCKERHUB/morrigan-sft .
       docker push YOUR_DOCKERHUB/morrigan-sft
  2. Create endpoint:
       python deploy_runpod.py
  3. Set in server .env:
       FT_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID
       FT_API_KEY=rpa_YOUR_KEY

OPTION B — GPU Pod (always-on, simpler):
  1. Create T4 pod at runpod.io
  2. SSH in and run:
       pip install llama-cpp-python huggingface_hub fastapi uvicorn
       python -c "from huggingface_hub import hf_hub_download; hf_hub_download('JaceSabr/morrigan-sft-v1', 'morrigan-Q5_K_M.gguf', local_dir='/model')"
       Copy the FastAPI server code from morrigan_sft_server.ipynb cell 5
       uvicorn app:app --host 0.0.0.0 --port 8080
  3. Set FT_URL to pod's public URL
"""

import os
import time
import json

try:
    import requests
except ImportError:
    print("pip install requests")
    exit(1)

RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "")
RUNPOD_API_URL = "https://api.runpod.io/graphql"
DOCKER_IMAGE = os.environ.get("DOCKER_IMAGE", "YOUR_DOCKERHUB/morrigan-sft:latest")


def graphql(query, variables=None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    resp = requests.post(
        f"{RUNPOD_API_URL}?api_key={RUNPOD_API_KEY}",
        headers={"Content-Type": "application/json"},
        json=payload,
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        print(f"API Error: {json.dumps(data['errors'], indent=2)}")
        return None
    return data.get("data")


def create_template():
    """Create a serverless template for the GGUF Docker image."""
    data = graphql("""
        mutation {
            saveTemplate(input: {
                name: "morrigan-sft-gguf"
                imageName: "%s"
                dockerArgs: ""
                containerDiskInGb: 20
                volumeInGb: 0
                env: []
            }) { id name }
        }
    """ % DOCKER_IMAGE)
    if not data:
        return None
    tid = data["saveTemplate"]["id"]
    print(f"Template created: {tid}")
    return tid


def create_endpoint(template_id):
    """Create a serverless endpoint from the template."""
    data = graphql("""
        mutation {
            saveEndpoint(input: {
                name: "morrigan-sft"
                templateId: "%s"
                gpuIds: "NVIDIA T4"
                workersMin: 0
                workersMax: 1
                idleTimeout: 5
                scalerType: "QUEUE_DELAY"
                scalerValue: 1
            }) { id name }
        }
    """ % template_id)
    if not data:
        return None
    eid = data["saveEndpoint"]["id"]
    print(f"Endpoint created: {eid}")
    print(f"URL: https://api.runpod.ai/v2/{eid}")
    return eid


def test_endpoint(endpoint_id):
    """Send a test job to the endpoint."""
    print(f"\nTesting endpoint {endpoint_id} (may take 1-2 min on cold start)...")

    prompt = (
        "<|start_header_id|>system<|end_header_id|>\n\n"
        "You are Morrigan. 23. Record store. Literary, visceral prose. *Italics* for actions.<|eot_id|>"
        "<|start_header_id|>user<|end_header_id|>\n\n"
        "Hey, what are you listening to?<|eot_id|>"
        "<|start_header_id|>assistant<|end_header_id|>\n\n"
    )

    resp = requests.post(
        f"https://api.runpod.ai/v2/{endpoint_id}/run",
        headers={"Authorization": f"Bearer {RUNPOD_API_KEY}", "Content-Type": "application/json"},
        json={"input": {"prompt": prompt, "temperature": 0.8, "n_predict": 200, "stop": ["<|eot_id|>"]}},
    )
    job = resp.json()
    job_id = job.get("id")
    if not job_id:
        print(f"Failed: {job}")
        return

    for i in range(60):
        time.sleep(5)
        r = requests.get(
            f"https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}",
            headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
        )
        result = r.json()
        status = result.get("status")
        print(f"  [{i*5}s] {status}")
        if status == "COMPLETED":
            output = result.get("output", {})
            print(f"\nMORRIGAN: {output.get('content', output)}")
            return
        elif status == "FAILED":
            print(f"\nFailed: {result}")
            return

    print("Timed out")


def main():
    if not RUNPOD_API_KEY:
        print("Set RUNPOD_API_KEY env var first")
        print("  export RUNPOD_API_KEY=rpa_YOUR_KEY")
        return

    if DOCKER_IMAGE.startswith("YOUR_"):
        print("Set DOCKER_IMAGE env var to your Docker Hub image")
        print("  export DOCKER_IMAGE=yourdockerhub/morrigan-sft:latest")
        print("\nOr build it first:")
        print("  docker build -f Dockerfile.runpod -t yourdockerhub/morrigan-sft .")
        print("  docker push yourdockerhub/morrigan-sft")
        return

    tid = create_template()
    if not tid:
        return
    eid = create_endpoint(tid)
    if not eid:
        return

    print(f"\nSet in server .env:")
    print(f"  FT_URL=https://api.runpod.ai/v2/{eid}")
    print(f"  FT_API_KEY={RUNPOD_API_KEY}")

    if input("\nTest now? (y/n): ").strip().lower() == "y":
        test_endpoint(eid)


if __name__ == "__main__":
    main()
