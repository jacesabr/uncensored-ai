"""
RunPod Deployment Script for JaceSabr/morrigan-sft-v1
=====================================================
Run this from VS Code terminal:
    pip install runpod requests
    python deploy_runpod.py

You need a RunPod API key:
    1. Go to https://www.runpod.io/console/user/settings
    2. Click "API Keys" → Create key
    3. Paste it below or set RUNPOD_API_KEY env variable
"""

import os
import time
import requests
import json

# ============================================================
# CONFIGURATION - Edit these
# ============================================================
RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "YOUR_API_KEY_HERE")  # <-- paste your key
MODEL_NAME = "JaceSabr/morrigan-sft-v1"
ENDPOINT_NAME = "morrigan-sft-v1"
GPU_IDS = "NVIDIA A40"  # Options: "NVIDIA A40", "NVIDIA L4", "NVIDIA RTX A6000"

# ============================================================
# DO NOT EDIT BELOW THIS LINE
# ============================================================

RUNPOD_API_URL = "https://api.runpod.io/graphql"
HEADERS = {"Content-Type": "application/json", "api_key": RUNPOD_API_KEY}


def graphql_request(query, variables=None):
    """Make a GraphQL request to RunPod API."""
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    resp = requests.post(RUNPOD_API_URL, headers=HEADERS, json=payload)
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        print(f"❌ API Error: {json.dumps(data['errors'], indent=2)}")
        return None
    return data.get("data")


def create_serverless_endpoint():
    """Create a vLLM serverless endpoint."""
    print(f"🚀 Creating serverless endpoint: {ENDPOINT_NAME}")
    print(f"   Model: {MODEL_NAME}")
    print(f"   GPU: {GPU_IDS}")
    print()

    # Create a serverless template first
    template_query = """
    mutation CreateTemplate($input: CreateEndpointTemplateInput!) {
        saveTemplate(input: $input) {
            id
            name
        }
    }
    """
    template_vars = {
        "input": {
            "name": f"{ENDPOINT_NAME}-template",
            "imageName": "runpod/worker-v1-vllm:stable-cuda12.1.0",
            "dockerArgs": "",
            "containerDiskInGb": 20,
            "volumeInGb": 50,
            "env": [
                {"key": "MODEL_NAME", "value": MODEL_NAME},
                {"key": "MAX_MODEL_LEN", "value": "4096"},
                {"key": "DTYPE", "value": "bfloat16"},
                {"key": "GPU_MEMORY_UTILIZATION", "value": "0.90"},
                {"key": "DISABLE_LOG_STATS", "value": "true"},
            ],
        }
    }

    template_data = graphql_request(template_query, template_vars)
    if not template_data:
        print("❌ Failed to create template. Trying alternative approach...")
        return create_pod_instead()

    template_id = template_data["saveTemplate"]["id"]
    print(f"✅ Template created: {template_id}")

    # Create the endpoint
    endpoint_query = """
    mutation CreateEndpoint($input: CreateEndpointInput!) {
        saveEndpoint(input: $input) {
            id
            name
            templateId
        }
    }
    """
    endpoint_vars = {
        "input": {
            "name": ENDPOINT_NAME,
            "templateId": template_id,
            "gpuIds": GPU_IDS,
            "workersMin": 0,
            "workersMax": 1,
            "idleTimeout": 5,
            "scalerType": "QUEUE_DELAY",
            "scalerValue": 1,
        }
    }

    endpoint_data = graphql_request(endpoint_query, endpoint_vars)
    if not endpoint_data:
        print("❌ Failed to create endpoint")
        return None

    endpoint_id = endpoint_data["saveEndpoint"]["id"]
    print(f"✅ Endpoint created: {endpoint_id}")
    print(f"   URL: https://api.runpod.ai/v2/{endpoint_id}")
    return endpoint_id


def create_pod_instead():
    """Fallback: create a GPU pod with vLLM."""
    print("\n🔄 Creating a GPU Pod instead (simpler, more reliable)...")

    query = """
    mutation CreatePod($input: PodFindAndDeployOnDemandInput!) {
        podFindAndDeployOnDemand(input: $input) {
            id
            name
            desiredStatus
            imageName
            machineId
        }
    }
    """
    variables = {
        "input": {
            "name": ENDPOINT_NAME,
            "imageName": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
            "gpuTypeId": GPU_IDS,
            "gpuCount": 1,
            "volumeInGb": 50,
            "containerDiskInGb": 20,
            "minVcpuCount": 4,
            "minMemoryInGb": 24,
            "ports": "8000/http",
            "dockerArgs": "",
            "env": [
                {"key": "MODEL_NAME", "value": MODEL_NAME},
            ],
            "startJupyter": False,
            "startSsh": True,
        }
    }

    data = graphql_request(query, variables)
    if not data:
        print("❌ Failed to create pod")
        return None

    pod = data["podFindAndDeployOnDemand"]
    print(f"✅ Pod created: {pod['id']}")
    print(f"   Name: {pod['name']}")
    print(f"\n📋 Next steps:")
    print(f"   1. Go to https://www.runpod.io/console/pods")
    print(f"   2. SSH into the pod")
    print(f"   3. Run these commands:")
    print(f"      pip install vllm")
    print(f"      python -m vllm.entrypoints.openai.api_server \\")
    print(f"          --model {MODEL_NAME} \\")
    print(f"          --dtype bfloat16 \\")
    print(f"          --host 0.0.0.0 \\")
    print(f"          --port 8000")
    return pod["id"]


def test_endpoint(endpoint_id):
    """Test the serverless endpoint."""
    print(f"\n🧪 Testing endpoint {endpoint_id}...")
    print("   (First request may take a few minutes as the worker spins up)\n")

    url = f"https://api.runpod.ai/v2/{endpoint_id}/runsync"
    headers = {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "input": {
            "messages": [
                {"role": "user", "content": "Hello! Who are you?"}
            ],
            "max_tokens": 200,
            "temperature": 0.7,
        }
    }

    try:
        print("   Sending request...")
        resp = requests.post(url, headers=headers, json=payload, timeout=300)
        resp.raise_for_status()
        result = resp.json()

        if result.get("status") == "COMPLETED":
            print(f"✅ Success! Response:")
            print(f"   {json.dumps(result.get('output', {}), indent=2)}")
        elif result.get("status") == "IN_QUEUE":
            job_id = result.get("id")
            print(f"   Job queued: {job_id}")
            print(f"   Worker is spinning up. Polling for result...")
            poll_result(endpoint_id, job_id)
        else:
            print(f"   Status: {result.get('status')}")
            print(f"   Full response: {json.dumps(result, indent=2)}")
    except requests.exceptions.Timeout:
        print("   ⏱️ Request timed out (worker may still be starting)")
        print(f"   Try again in a few minutes")
    except Exception as e:
        print(f"   ❌ Error: {e}")


def poll_result(endpoint_id, job_id, max_attempts=60):
    """Poll for async job result."""
    url = f"https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}"
    headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}

    for i in range(max_attempts):
        time.sleep(5)
        resp = requests.get(url, headers=headers)
        result = resp.json()
        status = result.get("status")
        print(f"   [{i+1}/{max_attempts}] Status: {status}")

        if status == "COMPLETED":
            print(f"\n✅ Success! Response:")
            print(f"   {json.dumps(result.get('output', {}), indent=2)}")
            return
        elif status == "FAILED":
            print(f"\n❌ Failed: {json.dumps(result, indent=2)}")
            return

    print("   ⏱️ Timed out waiting for response")


def main():
    if RUNPOD_API_KEY == "YOUR_API_KEY_HERE":
        print("=" * 60)
        print("❌ Please set your RunPod API key first!")
        print()
        print("Option 1: Edit this file and replace YOUR_API_KEY_HERE")
        print("Option 2: Set environment variable:")
        print("   Windows:  set RUNPOD_API_KEY=your_key_here")
        print("   Mac/Linux: export RUNPOD_API_KEY=your_key_here")
        print()
        print("Get your key at: https://www.runpod.io/console/user/settings")
        print("=" * 60)
        return

    print("=" * 60)
    print("  RunPod Deployment: JaceSabr/morrigan-sft-v1")
    print("=" * 60)
    print()

    endpoint_id = create_serverless_endpoint()

    if endpoint_id:
        print("\n" + "=" * 60)
        print("  DEPLOYMENT COMPLETE")
        print("=" * 60)
        print(f"\n📌 Your endpoint ID: {endpoint_id}")
        print(f"📌 API URL: https://api.runpod.ai/v2/{endpoint_id}")
        print()

        test_now = input("Test the endpoint now? (y/n): ").strip().lower()
        if test_now == "y":
            test_endpoint(endpoint_id)

        print(f"\n📖 To use in your app:")
        print(f'   curl -X POST https://api.runpod.ai/v2/{endpoint_id}/runsync \\')
        print(f'     -H "Authorization: Bearer {RUNPOD_API_KEY[:8]}..." \\')
        print(f'     -H "Content-Type: application/json" \\')
        print(f'     -d \'{{"input": {{"messages": [{{"role": "user", "content": "Hello"}}], "max_tokens": 200}}}}\'')


if __name__ == "__main__":
    main()
