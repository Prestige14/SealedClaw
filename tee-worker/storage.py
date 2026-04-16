import os
import json
import requests
from typing import Optional

# 0G Storage Nodes Endpoints (Local Simulator per phase 3 specs)
STORAGE_UPLOAD_URL = "http://127.0.0.1:5678/tx"
STORAGE_DOWNLOAD_URL = "http://127.0.0.1:5678/file"

def store_to_0g_storage(token_id: int, encrypted_blob: dict) -> str:
    """
    Upload encrypted_blob (JSON) to 0G Storage node.
    Returns the file_root_hash (or simulated hash if offline).
    """
    try:
        response = requests.post(STORAGE_UPLOAD_URL, json=encrypted_blob, timeout=5)
        response.raise_for_status()
        
        # Determine root hash from response or fallback to content hash
        try:
            data = response.json()
            file_root_hash = data.get("root_hash") or data.get("tx", {}).get("data_root")
            if not file_root_hash:
                import hashlib
                file_root_hash = hashlib.sha256(json.dumps(encrypted_blob).encode()).hexdigest()
        except ValueError:
            import hashlib
            file_root_hash = hashlib.sha256(response.content).hexdigest()
        
        # Save hash locally so the agent knows what to download on the next cycle
        hash_file = f".latest_root_hash_{token_id}"
        with open(hash_file, "w") as f:
            f.write(file_root_hash)
            
        return file_root_hash
    except Exception as e:
        print(f"[STORAGE] Warning: Failed to upload to 0G Storage ({e}).")
        # Local fallback for development without real storage node
        import hashlib
        file_root_hash = hashlib.sha256(json.dumps(encrypted_blob).encode()).hexdigest()
        
        hash_file = f".latest_root_hash_{token_id}"
        with open(hash_file, "w") as f:
            f.write(file_root_hash)
            
        mock_file = f".mock_storage_{file_root_hash}.json"
        with open(mock_file, "w") as f:
            json.dump(encrypted_blob, f)
            
        print(f"[STORAGE] Used local mock storage fallback. Hash: {file_root_hash}")
        return file_root_hash

def fetch_from_0g_storage(token_id: int) -> Optional[dict]:
    """
    Download the last known memory state from 0G Storage.
    Returns None if no previous state is found.
    """
    hash_file = f".latest_root_hash_{token_id}"
    if not os.path.exists(hash_file):
        return None
        
    with open(hash_file, "r") as f:
        file_root_hash = f.read().strip()
        
    url = f"{STORAGE_DOWNLOAD_URL}/{file_root_hash}"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[STORAGE] Warning: Failed to download from 0G Storage. ({e})")
        # Local mock fallback
        mock_file = f".mock_storage_{file_root_hash}.json"
        if os.path.exists(mock_file):
            print("[STORAGE] Using local mock storage fallback.")
            with open(mock_file, "r") as f:
                return json.load(f)
        return None
