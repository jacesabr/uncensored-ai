"""Quick test for RunPod Morrigan endpoint."""
import os
import requests
import json
import time
import sys

RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "")
ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID", "kfv9n4dctk2shy")

if not RUNPOD_API_KEY:
    print("Set RUNPOD_API_KEY env var: export RUNPOD_API_KEY=your_key")
    sys.exit(1)
AUTH = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}

def check_health():
    r = requests.get(f"https://api.runpod.ai/v2/{ENDPOINT_ID}/health", headers=AUTH)
    return r.json()

def submit_job():
    r = requests.post(
        f"https://api.runpod.ai/v2/{ENDPOINT_ID}/run",
        headers={**AUTH, "Content-Type": "application/json"},
        json={"input": {"messages": [{"role": "user", "content": "Hello! Who are you?"}], "max_tokens": 200, "temperature": 0.7}},
        timeout=30,
    )
    return r.json()

def poll_job(job_id, max_polls=90):
    for i in range(max_polls):
        time.sleep(10)
        r = requests.get(f"https://api.runpod.ai/v2/{ENDPOINT_ID}/status/{job_id}", headers=AUTH)
        data = r.json()
        status = data.get("status")
        elapsed = (i + 1) * 10
        if i % 6 == 0:
            h = check_health()
            w = h.get("workers", {})
            print(f"  [{elapsed}s] {status} | workers: init={w.get('initializing',0)} ready={w.get('ready',0)} running={w.get('running',0)} throttled={w.get('throttled',0)}")
        else:
            print(f"  [{elapsed}s] {status}")
        sys.stdout.flush()
        if status == "COMPLETED":
            print(f"\nOutput: {json.dumps(data.get('output', {}), indent=2)[:1000]}")
            return True
        elif status == "FAILED":
            print(f"\nFailed: {json.dumps(data, indent=2)[:1000]}")
            return False
    print("\nTimed out after 15 minutes.")
    return False

if __name__ == "__main__":
    print("Health:", json.dumps(check_health(), indent=2))
    sys.stdout.flush()
    print("\nSubmitting job...")
    sys.stdout.flush()
    result = submit_job()
    print(f"Response: {json.dumps(result, indent=2)}")
    sys.stdout.flush()
    job_id = result.get("id")
    if job_id:
        print(f"\nPolling job {job_id}...")
        sys.stdout.flush()
        poll_job(job_id)
