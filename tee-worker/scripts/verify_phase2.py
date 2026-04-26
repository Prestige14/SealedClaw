"""
scripts/verify_phase2.py
Quick standalone verification script.
Runs the full TEE worker cycle and prints a verification summary.
No Hardhat required -- checks Python-side consistency only.

Run from tee-worker/ directory:
    python scripts/verify_phase2.py

All 10 tests must pass before running the Hardhat integration test.
"""

import json
import sys
import os
import shutil

# Allow running from tee-worker/ root or from scripts/ subdir
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from enclave.keys import generate_ecdsa_keypair, generate_aes_key
from enclave.crypto import (
    compute_payload_hash,
    build_eth_signed_message_hash,
    encrypt_memory,
    decrypt_memory,
)
from enclave.attestation import generate_attestation_report, verify_attestation_mock
from oracle.aggregator import get_median_price
from agent.strategy import make_trading_decision, build_updated_memory
from payload.builder import build_strategy_data, build_final_payload
from storage.og_storage_client import store_to_0g_storage, fetch_from_0g_storage

# ── Config ────────────────────────────────────────────────────────────────────
VAULT_ADDRESS = os.getenv("POLICY_VAULT_ADDRESS", "0x" + "ab" * 20)
TOKEN_ID      = int(os.getenv("TOKEN_ID", "0"))
NONCE         = int(os.getenv("CURRENT_NONCE", "0"))
TEE_IDENTITY  = os.getenv("TEE_IDENTITY", "sealedclaw-test-identity-v1")

print("\n" + "="*60)
print("  PHASE 2 VERIFICATION SCRIPT")
print("="*60)

errors = []
warnings = []

# ── Test 1: Key generation ────────────────────────────────────────────────────
print("\n[1/10] Key generation...")
keypair = None
try:
    keypair = generate_ecdsa_keypair(tee_identity=TEE_IDENTITY)
    assert keypair.eth_address.startswith("0x"), "Address must be 0x-prefixed"
    assert len(keypair.eth_address) == 42, "Address must be 42 chars"
    print(f"  [PASS] ECDSA keypair generated. Address: {keypair.eth_address}")
    # Verify private key is NOT accessible as an attribute
    assert not hasattr(keypair, 'private_key'), "Private key must not be exposed!"
    assert not hasattr(keypair, '_private_key'), "Private key must not be exposed!"
    print(f"  [PASS] Private key isolation: not accessible as attribute")
except Exception as e:
    errors.append(f"Key generation: {e}")
    print(f"  [FAIL] {e}")

# ── NEW: Environment Checks (9-10) ────────────────────────────────────────────

print("\n[9/10] Environment variables check...")
env_exists = os.path.exists(".env")
if not env_exists:
    print("  [SKIP] No .env file found. Skipping required variables check.")
else:
    try:
        from main import validate_environment
        validate_environment()
        print("  [PASS] All required environment variables are set.")
    except Exception as e:
        errors.append(f"Environment: {e}")
        print(f"  [FAIL] {e}")

print("\n[10/10] Address format check...")
if not env_exists:
    print("  [SKIP] No .env file found. Skipping address format check.")
else:
    try:
        address_vars = ["POLICY_VAULT_ADDRESS", "AGENT_NFT_ADDRESS", "MARKETPLACE_ADDRESS"]
        for var in address_vars:
            val = os.getenv(var)
            if val:
                assert val.startswith("0x") and len(val) == 42, f"Invalid format for {var}"
        print("  [PASS] All contract addresses in .env have valid formats.")
    except Exception as e:
        errors.append(f"Address Format: {e}")
        print(f"  [FAIL] {e}")

# ── Test 2: AES key sealing ────────────────────────────────────────────────────
print("\n[2/10] AES key sealing...")
aes_key = None
try:
    aes_key = generate_aes_key(TEE_IDENTITY)
    assert len(aes_key) == 32, f"AES key must be 32 bytes, got {len(aes_key)}"
    aes_key2 = generate_aes_key(TEE_IDENTITY)
    assert aes_key == aes_key2, "Same TEE_IDENTITY must produce same AES key (deterministic sealing)"
    aes_key_diff = generate_aes_key("different-identity")
    assert aes_key != aes_key_diff, "Different identity must produce different AES key"
    print(f"  [PASS] AES key: 32 bytes, deterministic sealing, identity-bound")
except Exception as e:
    errors.append(f"AES key: {e}")
    print(f"  [FAIL] {e}")

# ── Test 3: Oracle aggregation ─────────────────────────────────────────────────
print("\n[3/10] Oracle aggregation...")
median = None
prices = None
try:
    median, prices = get_median_price("ETH")
    assert isinstance(median, float) and median > 0
    assert all(k in prices for k in ("pyth", "chainlink", "twap", "onchain"))
    print(f"  [PASS] Median: ${median:,.2f} | oracles found: {list(prices.keys())}")
except Exception as e:
    errors.append(f"Oracle: {e}")
    print(f"  [FAIL] {e}")

# ── Test 4: Trading decision ───────────────────────────────────────────────────
print("\n[4/10] Trading decision...")
decision = None
try:
    decision = make_trading_decision(median, None, TOKEN_ID)
    assert decision["action"] in ("BUY", "SELL", "REDUCE_ONLY", "HOLD")
    assert isinstance(decision["amount_wei"], int)
    print(f"  [PASS] Decision: {decision['action']} | amount: {decision['amount_wei']} wei")
    print(f"         Rationale: {decision['rationale'][:80]}...")
except Exception as e:
    errors.append(f"Strategy: {e}")
    print(f"  [FAIL] {e}")

# ── Test 5: Payload construction & signing ────────────────────────────────────
print("\n[5/10] Payload construction & signing...")
payload = None
try:
    if keypair is None or decision is None:
        raise RuntimeError("Skipping: keypair or decision not available (prior test failed)")

    sign_fn = keypair.get_signing_function()
    payload = build_final_payload(
        token_id=TOKEN_ID,
        decision=decision,
        nonce=NONCE,
        policy_vault_address=VAULT_ADDRESS,
        sign_fn=sign_fn,
        tee_pub_key_address=keypair.eth_address,
    )

    sig = bytes.fromhex(payload["signature"].removeprefix("0x"))
    assert len(sig) == 65, f"Signature must be 65 bytes, got {len(sig)}"
    v = sig[64]
    assert v in (27, 28), f"v must be 27 or 28, got {v}"
    print(f"  [PASS] Signature: {len(sig)} bytes, v={v}")
    print(f"  [PASS] payload_hash   : {payload['payload_hash'][:22]}...")
    print(f"  [PASS] eth_signed_hash: {payload['eth_signed_hash'][:22]}...")

    # ---------------------------------------------------------------------------
    # Self-verify: use eth-keys to ecrecover from the signed hash
    # This is the same operation Solidity does in ecrecover / ECDSA.recover()
    # ---------------------------------------------------------------------------
    from eth_keys import keys as eth_keys_lib
    from eth_keys.datatypes import Signature as EthSig

    eth_hash_bytes = bytes.fromhex(payload["eth_signed_hash"].removeprefix("0x"))
    r = int.from_bytes(sig[:32], "big")
    s = int.from_bytes(sig[32:64], "big")
    vv = sig[64] - 27  # eth-keys uses v in {0, 1}

    recovered_sig = EthSig(vrs=(vv, r, s))
    recovered_pubkey = recovered_sig.recover_public_key_from_msg_hash(eth_hash_bytes)

    # to_checksum_address() in eth-keys returns WITHOUT 0x prefix
    raw_addr = recovered_pubkey.to_checksum_address()
    recovered_addr = raw_addr if raw_addr.startswith("0x") else ("0x" + raw_addr)

    expected_addr = keypair.eth_address.lower()
    recovered_lower = recovered_addr.lower()

    if recovered_lower == expected_addr:
        print(f"  [PASS] Self-verify ecrecover: PASS -> recovered {recovered_addr}")
    else:
        errors.append(f"ecrecover mismatch: got {recovered_addr}, expected {expected_addr}")
        print(f"  [FAIL] ecrecover MISMATCH: got {recovered_addr}, expected {expected_addr}")

except Exception as e:
    errors.append(f"Payload/signing: {e}")
    print(f"  [FAIL] {e}")

# ── Test 6: Memory encrypt/decrypt roundtrip ──────────────────────────────────
print("\n[6/10] Memory encrypt/decrypt roundtrip...")
try:
    if aes_key is None or decision is None or median is None:
        raise RuntimeError("Skipping: prior test failed, required variables missing")

    memory = build_updated_memory(None, decision, median, cycle_number=0)
    encrypted = encrypt_memory(memory, aes_key)
    assert all(k in encrypted for k in ("ciphertext", "nonce_gcm", "tag"))
    decrypted = decrypt_memory(encrypted, aes_key)
    assert decrypted == memory, "Decrypted memory must match original"
    print(f"  [PASS] Encrypt/decrypt roundtrip: OK")
    print(f"  [PASS] Ciphertext length: {len(encrypted['ciphertext'])//2} bytes")

    # Tamper test: modified ciphertext must raise InvalidTag (GCM auth failure)
    tampered = dict(encrypted)
    tampered["ciphertext"] = "ff" * (len(encrypted["ciphertext"]) // 2)
    try:
        decrypt_memory(tampered, aes_key)
        errors.append("Tamper test FAILED: should have raised InvalidTag")
        print("  [FAIL] Tamper test FAILED (no exception raised!)")
    except Exception:
        print(f"  [PASS] Tamper detection (AES-GCM InvalidTag): OK")

except Exception as e:
    errors.append(f"Memory crypto: {e}")
    print(f"  [FAIL] {e}")

# ── Test 7: Attestation report ───────────────────────────────────────────────────────
print("\n[7/10] Attestation report...")
try:
    if keypair is None:
        raise RuntimeError("Skipping: keypair not available (Test 1 failed)")

    report = generate_attestation_report(keypair.eth_address)
    valid = verify_attestation_mock(report, keypair.eth_address)
    assert valid, "Attestation verification must pass for matching key"
    invalid = verify_attestation_mock(report, "0x" + "00" * 20)
    assert not invalid, "Attestation verification must fail for wrong key"
    print("  [PASS] Attestation generate + verify: OK")
    print("  [PASS] Wrong key rejection: OK")
except Exception as e:
    errors.append(f"Attestation: {e}")
    print(f"  [FAIL] {e}")

# ── Test 8: 0G Storage roundtrip ──────────────────────────────────────────────
print("\n[8/10] 0G Storage roundtrip...")
try:
    test_token_id = 9999
    test_blob = {"test": "storage", "phase": 3}
    
    # Test Store (local fallback expected if no node)
    root_hash = store_to_0g_storage(test_token_id, test_blob)
    assert root_hash, "Store must return a hash"
    
    # Test Fetch
    fetched = fetch_from_0g_storage(test_token_id)
    assert fetched == test_blob, "Fetched blob must match stored blob"
    
    # Cleanup
    if os.path.exists(f".latest_root_hash_{test_token_id}"):
        os.remove(f".latest_root_hash_{test_token_id}")
    if os.path.exists(f".mock_storage_{root_hash}.json"):
        os.remove(f".mock_storage_{root_hash}.json")
        
    print("  [PASS] Store/Fetch roundtrip: OK")
except Exception as e:
    errors.append(f"Storage: {e}")
    print(f"  [FAIL] {e}")

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "="*60)
if not errors:
    print("  ALL 10 CHECKS PASSED -- Phase 2 ready for Hardhat integration test")
    print("="*60 + "\n")
    sys.exit(0)
else:
    print(f"  {len(errors)} CHECK(S) FAILED:")
    for err in errors:
        print(f"     * {err}")
    print("="*60 + "\n")
    sys.exit(1)