import os
import json
import pytest
from storage.og_storage_client import OGStorageClient

def test_storage_roundtrip_local_fallback():
    client = OGStorageClient(rpc_url="http://invalid-url-for-test")
    token_id = 999
    test_data = {"hello": "world", "secret": 123}

    # Upload (should fallback to local)
    root_hash = client.upload_encrypted_blob(token_id, test_data)
    assert root_hash is not None
    assert len(root_hash) == 64 # SHA-256

    # Download
    downloaded = client.download_encrypted_blob(token_id)
    assert downloaded == test_data

    # Cleanup
    if os.path.exists(f".latest_root_hash_{token_id}"):
        os.remove(f".latest_root_hash_{token_id}")
    if os.path.exists(f".mock_storage_{root_hash}.json"):
        os.remove(f".mock_storage_{root_hash}.json")

if __name__ == "__main__":
    test_storage_roundtrip_local_fallback()
    print("Storage local fallback test passed!")
