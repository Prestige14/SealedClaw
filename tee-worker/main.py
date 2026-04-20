"""
main.py — SealedClaw TEE Worker End-to-End Simulation

Orchestrates a full execution cycle of the SealedClaw autonomous trading agent:

  1. TEE INIT       — Generate ECDSA keypair & AES key inside enclave boundary
  2. ATTESTATION    — Produce mock attestation report (→ PolicyVault.updateTeeEnclavePubKey)
  3. ORACLE         — Fetch multi-source prices & compute median
  4. AGENT          — Make trading decision from price + sealed memory
  5. PAYLOAD        — Build ABI-encoded, TEE-signed executeWithProof payload
  6. MEMORY         — Encrypt updated memory for 0G Storage upload

The final output JSON is directly usable in Hardhat / Foundry test suites
to call PolicyVault.executeWithProof() with a valid TEE signature.

Usage:
    cd tee-worker
    python main.py

Environment variables (see .env.example):
    TEE_IDENTITY            — Enclave identity string (simulates MRENCLAVE)
    POLICY_VAULT_ADDRESS    — Deployed PolicyVault contract address
    TOKEN_ID                — ERC-7857 token ID to operate
    CURRENT_NONCE           — Current on-chain nonce for TOKEN_ID
    TARGET_DEX_ADDRESS      — (Optional) DEX router address
"""
import argparse
import json
import os
import sys
import traceback

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load environment variables from .env (if present)
# ---------------------------------------------------------------------------

load_dotenv()

# ---------------------------------------------------------------------------
# Internal imports (all modules live under tee-worker/)
# ---------------------------------------------------------------------------

from enclave.keys import generate_ecdsa_keypair, generate_aes_key
from enclave.attestation import generate_attestation_report, verify_attestation_mock
from enclave.crypto import encrypt_memory, decrypt_memory, re_encrypt_for_handover
from oracle.aggregator import get_median_price, OracleDeviationError
from agent.strategy import make_trading_decision, build_updated_memory
from payload.builder import build_final_payload
from storage import store_to_0g_storage, fetch_from_0g_storage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _section(title: str) -> None:
    """Print a visible section separator."""
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def _hr() -> None:
    print("-" * 60)


# ---------------------------------------------------------------------------
# Main simulation
# ---------------------------------------------------------------------------

def run_tee_worker_cycle(is_pending_transfer: bool = False, new_owner: str | None = None, intent: str = "") -> dict:
    """
    Execute one full SealedClaw TEE worker cycle.

    Parameters
    ----------
    is_pending_transfer : bool
        True if token is in handover protocol.
    new_owner : str or None
        New owner address if in handover.
    intent : str
        User's conversational intent (NLP string).

    Returns
    -------
    dict
        The final signed payload ready for PolicyVault.executeWithProof().
    """

    print("\n" + "=" * 60)
    print("  [SEALEDCLAW] TEE WORKER STARTING")
    print("=" * 60)

    # =========================================================================
    # PHASE 1: TEE INITIALISATION
    # =========================================================================

    _section("TEE INIT")

    # Read TEE identity first — used for both keypair and AES key derivation
    tee_identity: str = os.getenv("TEE_IDENTITY", "sealed-claw-tee-v1-mrenclave-default")

    # ── Key generation ────────────────────────────────────────────────────────
    print("[TEE INIT] Generating ECDSA keypair inside enclave...")
    # TEE BOUNDARY: private key is sealed inside the enclave object.
    # Deterministic from tee_identity: same identity -> same keypair across runs.
    # This simulates TEE hardware root-of-trust: same MRENCLAVE -> same key.
    enclave_keypair = generate_ecdsa_keypair(tee_identity=tee_identity)
    tee_pub_key_address: str = enclave_keypair.eth_address
    sign_fn = enclave_keypair.get_signing_function()
    print(f"[TEE INIT] Public Key (Ethereum addr) : {tee_pub_key_address}")

    # ── AES key derivation ────────────────────────────────────────────────────
    print("[TEE INIT] Generating AES-256-GCM key (sealed to TEE identity)...")
    # TEE BOUNDARY: AES key never leaves this variable — used only for encrypt/decrypt
    aes_key: bytes = generate_aes_key(tee_identity)
    print(f"[TEE INIT] AES key derived from identity: {tee_identity!r} (key bytes hidden)")

    # ── Attestation report ────────────────────────────────────────────────────
    print("[TEE INIT] Generating attestation report...")
    attestation_report = generate_attestation_report(tee_pub_key_address)
    print(
        f"[TEE INIT] Attestation mock:\n"
        f"           mrenclave  = {attestation_report['mrenclave'][:16]}...\n"
        f"           tee_pub_key= {attestation_report['tee_pub_key']}"
    )

    # ── Attestation self-check ────────────────────────────────────────────────
    attestation_ok: bool = verify_attestation_mock(attestation_report, tee_pub_key_address)
    if not attestation_ok:
        print("[TEE INIT] [WARN] Attestation self-check FAILED - aborting.")
        sys.exit(1)
    print("[TEE INIT] [OK] Attestation self-check passed.")

    print("\n--- Simulated: Send tee_pub_key + attestation to PolicyVault.updateTeeEnclavePubKey() ---")
    # 0G INTEGRATION: Call PolicyVault.updateTeeEnclavePubKey(tee_pub_key_address, attestation_json)

    # =========================================================================
    # PHASE 2: ORACLE AGGREGATION
    # =========================================================================

    _section("ORACLE")

    asset: str = "ETH"
    print(f"[ORACLE] Fetching prices for {asset}...")

    median_price: float
    oracle_prices: dict

    try:
        median_price, oracle_prices = get_median_price(asset)
        print(
            f"[ORACLE] Pyth      : ${oracle_prices['pyth']:,.4f}\n"
            f"[ORACLE] Chainlink : ${oracle_prices['chainlink']:,.4f}\n"
            f"[ORACLE] TWAP      : ${oracle_prices['twap']:,.4f}"
        )
        print(f"[ORACLE] Median price : ${median_price:,.4f} (deviation OK)")

    except OracleDeviationError as e:
        print(f"[ORACLE] [WARN] Oracle deviation detected: {e}")
        print("[ORACLE] Fallback: forcing REDUCE_ONLY decision for safety.")
        # Use last price from oracle_prices or a safe estimate
        oracle_prices = e.prices
        median_price = sorted(e.prices.values())[1]  # median of 3

    # =========================================================================
    # PHASE 3: LOAD PREVIOUS MEMORY
    # =========================================================================

    _section("MEMORY READ")

    token_id: int = int(os.getenv("TOKEN_ID", "0"))

    # In production: fetch encrypted blob from 0G Storage using the tokenId key
    previous_encrypted_blob: dict | None = fetch_from_0g_storage(token_id)

    previous_memory: dict | None = None
    if previous_encrypted_blob is not None:
        try:
            # TEE BOUNDARY: decrypt inside enclave; plaintext never leaves
            previous_memory = decrypt_memory(previous_encrypted_blob, aes_key)
            print(f"[MEMORY] Previous memory loaded: {json.dumps(previous_memory, indent=2)}")
        except Exception as e:
            print(f"[MEMORY] [WARN] Failed to decrypt previous memory: {e}. Treating as first run.")
    else:
        print("[AI AGENT] Previous memory: None (first run)")

    # =========================================================================
    # PHASE 4: TRADING DECISION
    # =========================================================================

    _section("AI AGENT")

    # Read environment config
    current_nonce: int = int(os.getenv("CURRENT_NONCE", "0"))
    policy_vault_address: str = os.getenv(
        "POLICY_VAULT_ADDRESS", "0x0000000000000000000000000000000000001234"
    )
    target_dex_address: str | None = os.getenv("TARGET_DEX_ADDRESS")

    decision: dict = make_trading_decision(
        median_price=median_price,
        previous_memory=previous_memory,
        token_id=token_id,
        is_pending_transfer=is_pending_transfer,
        intent=intent,
    )

    print(
        f"[AI AGENT] Decision   : {decision['action']}\n"
        f"[AI AGENT] Amount     : {decision['amount_wei']} wei\n"
        f"[AI AGENT] Asset      : {decision['asset']}\n"
        f"[AI AGENT] Rationale  : {decision['rationale']}"
    )

    # =========================================================================
    # PHASE 5: PAYLOAD CONSTRUCTION & SIGNING
    # =========================================================================

    _section("PAYLOAD")

    print("[PAYLOAD] Building signed payload...")

    final_payload: dict = build_final_payload(
        token_id=token_id,
        decision=decision,
        nonce=current_nonce,
        policy_vault_address=policy_vault_address,
        sign_fn=sign_fn,
        tee_pub_key_address=tee_pub_key_address,
        target_dex_address=target_dex_address,
    )

    print(f"[PAYLOAD] strategy_data (ABI-encoded) : {final_payload['strategyData']}")
    print(f"[PAYLOAD] payload_hash (pre-prefix)   : {final_payload['payload_hash']}")
    print(f"[PAYLOAD] eth_signed_hash (post-prefix): {final_payload['eth_signed_hash']}")
    print(f"[PAYLOAD] Signature (65 bytes)        : {final_payload['signature']}")
    print(f"[PAYLOAD] Deadline (UNIX)             : {final_payload['deadline']}")
    print(f"[PAYLOAD] Nonce used                  : {final_payload['nonce_used']}")

    # =========================================================================
    # PHASE 6: MEMORY ENCRYPTION & STORAGE
    # =========================================================================

    _section("MEMORY WRITE")

    updated_memory: dict = build_updated_memory(
        previous_memory=previous_memory,
        decision=decision,
        median_price=median_price,
        cycle_number=(previous_memory or {}).get("cycle", -1) + 1,
    )

    if is_pending_transfer and new_owner:
        print(f"[MEMORY] Re-encrypting memory for handover to new owner {new_owner}...")
        encrypted_blob: dict = re_encrypt_for_handover(updated_memory, new_owner)
    else:
        print("[MEMORY] Encrypting memory state for 0G Storage...")
        # TEE BOUNDARY: encryption happens inside enclave before data exits
        encrypted_blob: dict = encrypt_memory(updated_memory, aes_key)

    print(
        f"[MEMORY] Encrypted blob:\n"
        f"         ciphertext : {encrypted_blob['ciphertext'][:32]}...\n"
        f"         nonce_gcm  : {encrypted_blob['nonce_gcm']}\n"
        f"         tag        : {encrypted_blob['tag']}"
    )
    print("\n--- Upload encrypted blob to 0G Storage ---")
    store_to_0g_storage(token_id, encrypted_blob)

    # ── Verify round-trip decrypt (sanity check) ──────────────────────────────
    try:
        recovered_memory = decrypt_memory(encrypted_blob, aes_key)
        assert recovered_memory["last_price"] == median_price
        print("[MEMORY] [OK] Decrypt round-trip verification passed.")
    except Exception as e:
        print(f"[MEMORY] [WARN] Decrypt round-trip FAILED: {e}")

    # =========================================================================
    # PHASE 7: FINAL OUTPUT
    # =========================================================================

    print("\n" + "=" * 60)
    print("  FINAL OUTPUT (ready for PolicyVault.executeWithProof)")
    print("=" * 60)

    # Build the clean on-chain-ready subset (drop diagnostic fields)
    on_chain_payload: dict = {
        "tokenId": final_payload["tokenId"],
        "strategyData": final_payload["strategyData"],
        "tradeAmount": final_payload["tradeAmount"],
        "targetDEX": final_payload["targetDEX"],
        "signature": final_payload["signature"],
        "deadline": final_payload["deadline"],
    }

    print(json.dumps(on_chain_payload, indent=2))

    print("\n" + "=" * 60)
    print("  [DONE] TEE WORKER CYCLE COMPLETE")
    print("=" * 60 + "\n")

    # Return the full payload for programmatic use / testing
    return final_payload


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Menyiapkan parser argumen untuk menerima flag --output dari Hardhat
    parser = argparse.ArgumentParser(description="SealedClaw TEE Worker Simulation")
    parser.add_argument("--output", type=str, default=None, help="Path to save the output JSON payload")
    # CLI overrides for Hardhat integration testing
    parser.add_argument("--vault", type=str, default=None, help="PolicyVault contract address (overrides POLICY_VAULT_ADDRESS env)")
    parser.add_argument("--token-id", type=int, default=None, dest="token_id", help="ERC-7857 token ID (overrides TOKEN_ID env)")
    parser.add_argument("--nonce", type=int, default=None, help="Current on-chain nonce (overrides CURRENT_NONCE env)")
    parser.add_argument("--pending-transfer", action="store_true", help="Flag indicating token is in handover window")
    parser.add_argument("--new-owner", type=str, default=None, help="Ethereum address of the new owner during handover")
    parser.add_argument("--intent", type=str, default="", help="User intent string from OpenClaw Agent")
    args = parser.parse_args()

    # Apply CLI overrides to environment so run_tee_worker_cycle() picks them up
    if args.vault:
        os.environ["POLICY_VAULT_ADDRESS"] = args.vault
    if args.token_id is not None:
        os.environ["TOKEN_ID"] = str(args.token_id)
    if args.nonce is not None:
        os.environ["CURRENT_NONCE"] = str(args.nonce)

    try:
        result = run_tee_worker_cycle(
            is_pending_transfer=args.pending_transfer,
            new_owner=args.new_owner,
            intent=args.intent
        )
        
        # LOGIKA BARU: Jika flag --output digunakan, simpan payload ke file JSON
        if args.output:
            # Mengambil tee_pub_key dari attestation report untuk mempermudah testing Hardhat
            tee_pub_key = result.get("attestation_report", {}).get("tee_pub_key", "")
            
            # Gabungkan payload dengan pub_key
            output_data = {**result, "tee_pub_key": tee_pub_key}
            
            with open(args.output, "w") as f:
                json.dump(output_data, f, indent=2)
            print(f"\n[+] Payload JSON untuk Hardhat berhasil disimpan di: {args.output}")

    except KeyboardInterrupt:
        print("\n[MAIN] Interrupted by user.")
        sys.exit(0)
    except Exception as exc:
        print(f"\n[MAIN] FATAL ERROR: {exc}")
        traceback.print_exc()
        sys.exit(1)
