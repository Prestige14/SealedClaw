"""
enclave/attestation.py — Mock TEE Attestation Report

Generates and verifies a simulated attestation report for the SealedClaw
TEE worker. In production this is replaced with a real 0G Compute attestation
certificate that includes hardware-rooted measurements (MRENCLAVE, MRSIGNER).

# 0G INTEGRATION: Replace `generate_attestation_report` with a call to the
# 0G Compute attestation API endpoint once the enclave is deployed.
"""

import hashlib
import json
import os
import secrets
import time
from typing import Any


# ---------------------------------------------------------------------------
# Simulated MRENCLAVE value — in production this is a SHA-256 of the enclave
# binary loaded into the SGX/TDX secure memory region.
# ---------------------------------------------------------------------------
_MOCK_MRENCLAVE: str = (
    "a3f2c9d1e8b74a0f56c3912d7b4e8fa261c5d3a9e0f1b2c8d7a4e9f3b6c2d1e5"
)
_MOCK_MRSIGNER: str = (
    "d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2"
)


def generate_attestation_report(tee_pub_key_address: str) -> dict[str, Any]:
    """
    Generate a mock TEE attestation report binding a public key to the enclave.

    The report simulates the structure of a real SGX/TDX attestation quote,
    binding the TEE's ECDSA public key (as Ethereum address) to the enclave
    measurement values so that on-chain verifiers can confirm authenticity.

    Parameters
    ----------
    tee_pub_key_address : str
        The Ethereum address derived from the TEE's ECDSA public key (0x-prefixed).

    Returns
    -------
    dict[str, Any]
        JSON-serializable attestation report containing:
        - ``mrenclave``   : SHA-256 measurement of the enclave binary.
        - ``mrsigner``    : SHA-256 measurement of the signing key.
        - ``tee_pub_key`` : Ethereum address of the TEE's ECDSA key.
        - ``timestamp``   : Unix timestamp of report generation.
        - ``nonce``       : 32-byte random hex nonce (replay protection).
        - ``report_data`` : keccak256 of (mrenclave ‖ tee_pub_key ‖ nonce).
        - ``version``     : Attestation format version string.

    Notes
    -----
    # In production: replace with actual 0G Compute TEE attestation API call.
    # The 0G Compute node will return a signed TLS certificate + SGX quote
    # that can be verified on-chain via the 0G attestation verifier contract.
    # 0G INTEGRATION: POST /v1/attestation/report on 0G Compute endpoint.
    """
    if not tee_pub_key_address.startswith("0x"):
        raise ValueError("tee_pub_key_address must be a 0x-prefixed Ethereum address.")

    try:
        import requests
        url = f"http://localhost:8080/attestation?pubkey={tee_pub_key_address}"
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[ATTESTATION] Warning: Live TEE attestation failed ({e}). Falling back to mock report.")

    timestamp: int = int(time.time())
    nonce_hex: str = secrets.token_hex(32)

    # Simulate report_data: binding enclave measurement to the public key
    # In real SGX, REPORT.ReportData is a 64-byte field set by the enclave.
    report_data_input: bytes = (
        bytes.fromhex(_MOCK_MRENCLAVE)
        + tee_pub_key_address.lower().encode("utf-8")
        + bytes.fromhex(nonce_hex)
    )
    report_data_hash: str = hashlib.sha256(report_data_input).hexdigest()

    report: dict[str, Any] = {
        "version": "sealedclaw-mock-attestation-v1",
        "mrenclave": _MOCK_MRENCLAVE,
        "mrsigner": _MOCK_MRSIGNER,
        "tee_pub_key": tee_pub_key_address.lower(),
        "timestamp": timestamp,
        "nonce": nonce_hex,
        "report_data": report_data_hash,
        # In production this would be a base64-encoded SGX QUOTE structure
        # signed by the Quoting Enclave (QE) and verifiable against Intel IAS
        # or DCAP infrastructure — or the 0G Compute attestation verifier.
        "quote_signature": "mock:" + secrets.token_hex(64),
        # 0G INTEGRATION: Replace quote_signature with real attestation quote.
    }
    return report


def verify_attestation_mock(report: dict[str, Any], expected_pub_key: str) -> bool:
    """
    Verify a mock attestation report against an expected TEE public key.

    Simulates the on-chain verification step where the contract checks that
    the attestation report was produced for the expected TEE key. In production
    this is performed by the 0G attestation verifier smart contract.

    Parameters
    ----------
    report : dict[str, Any]
        Attestation report dict as returned by `generate_attestation_report`.
    expected_pub_key : str
        The Ethereum address we expect the TEE to own (0x-prefixed, lowercase).

    Returns
    -------
    bool
        True if the report is structurally valid and contains the expected key;
        False otherwise.

    Notes
    -----
    # In production: verification is performed on-chain by the 0G attestation
    # verifier contract. This function is for local simulation only.
    # 0G INTEGRATION: Replace with call to PolicyVault.verifyAttestation()
    #   or the 0G attestation verifier contract.
    """
    required_fields = {
        "mrenclave", "mrsigner", "tee_pub_key",
        "timestamp", "nonce", "report_data", "version",
    }
    missing = required_fields - set(report.keys())
    if missing:
        print(f"[ATTESTATION] Verification FAILED: missing fields {missing}")
        return False

    report_key = report.get("tee_pub_key", "").lower()
    expected_key_lower = expected_pub_key.lower()

    if report_key != expected_key_lower:
        print(
            f"[ATTESTATION] Verification FAILED: "
            f"expected {expected_key_lower}, got {report_key}"
        )
        return False

    # Check timestamp freshness (must be within last 5 minutes in simulation)
    age_seconds = int(time.time()) - report.get("timestamp", 0)
    if age_seconds > 300:
        print(f"[ATTESTATION] Verification FAILED: report is stale ({age_seconds}s old).")
        return False

    return True
