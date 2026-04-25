import os
import json
import httpx
import hashlib
from typing import Optional

# Default 0G Storage Endpoints (Galileo Testnet)
DEFAULT_STORAGE_RPC = "https://rpc-storage-testnet.0g.ai"

class OGStorageClient:
    def __init__(self, rpc_url: Optional[str] = None):
        self.rpc_url = rpc_url or os.getenv("OG_STORAGE_RPC_URL", DEFAULT_STORAGE_RPC)
        self.upload_url = f"{self.rpc_url}/tx"
        self.download_url = f"{self.rpc_url}/file"

    def upload_encrypted_blob(self, token_id: int, encrypted_blob: dict) -> str:
        """
        Uploads an encrypted memory blob to 0G Storage.
        Returns the data root hash.
        """
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(self.upload_url, json=encrypted_blob)
                response.raise_for_status()
                
                data = response.json()
                # 0G Storage usually returns root_hash or tx hash
                file_root_hash = data.get("root_hash") or data.get("tx", {}).get("data_root")
                
                if not file_root_hash:
                    # Fallback to local deterministic hash if node doesn't return one
                    file_root_hash = self._compute_hash(encrypted_blob)
                
                print(f"[0G-STORAGE] Upload successful. Root Hash: {file_root_hash}")
                self._save_local_pointer(token_id, file_root_hash)
                return file_root_hash

        except Exception as e:
            print(f"[0G-STORAGE] [WARN] Upload failed: {e}. using local fallback.")
            file_root_hash = self._compute_hash(encrypted_blob)
            self._save_local_pointer(token_id, file_root_hash)
            self._save_mock_data(file_root_hash, encrypted_blob)
            return file_root_hash

    def download_encrypted_blob(self, token_id: int) -> Optional[dict]:
        """
        Downloads the latest encrypted memory blob for a given agent.
        """
        file_root_hash = self._get_local_pointer(token_id)
        if not file_root_hash:
            return None

        try:
            with httpx.Client(timeout=10.0) as client:
                url = f"{self.download_url}/{file_root_hash}"
                response = client.get(url)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"[0G-STORAGE] [WARN] Download failed: {e}. checking local mock.")
            return self._load_mock_data(file_root_hash)

    def _compute_hash(self, data: dict) -> str:
        content = json.dumps(data, sort_keys=True).encode()
        return hashlib.sha256(content).hexdigest()

    def _save_local_pointer(self, token_id: int, root_hash: str):
        path = f".latest_root_hash_{token_id}"
        with open(path, "w") as f:
            f.write(root_hash)

    def _get_local_pointer(self, token_id: int) -> Optional[str]:
        path = f".latest_root_hash_{token_id}"
        if os.path.exists(path):
            with open(path, "r") as f:
                return f.read().strip()
        return None

    def _save_mock_data(self, root_hash: str, data: dict):
        mock_path = f".mock_storage_{root_hash}.json"
        with open(mock_path, "w") as f:
            json.dump(data, f)

    def _load_mock_data(self, root_hash: str) -> Optional[dict]:
        mock_path = f".mock_storage_{root_hash}.json"
        if os.path.exists(mock_path):
            with open(mock_path, "r") as f:
                return json.load(f)
        return None

# Singleton-style helper functions for backward compatibility in main.py
_client = OGStorageClient()

def store_to_0g_storage(token_id: int, encrypted_blob: dict) -> str:
    return _client.upload_encrypted_blob(token_id, encrypted_blob)

def fetch_from_0g_storage(token_id: int) -> Optional[dict]:
    return _client.download_encrypted_blob(token_id)
