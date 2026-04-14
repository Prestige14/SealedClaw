"""
enclave/keys.py -- Key Generation & Sealing

Simulates TEE-level key management for SealedClaw. In production, this
module runs entirely inside a 0G Compute Sealed Inference enclave. The
private key material NEVER leaves the hardware security boundary.

Uses `eth-keys` for SECP256k1 keypair generation (avoids dependency on
cryptography>=42 which dropped SECP256k1 from the hazmat EC module).
Uses `cryptography` HKDF-SHA256 for AES key sealing only.

# TEE BOUNDARY: All key operations are confined to this module.
# Private key bytes are never written to disk, logs, or returned externally.
"""

import os
from typing import Callable

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.backends import default_backend
from eth_keys import keys as eth_keys_lib
from eth_keys.datatypes import PrivateKey, Signature as EthSignature
from eth_hash.auto import keccak


# ---------------------------------------------------------------------------
# Public-facing return type for the keypair initialiser
# ---------------------------------------------------------------------------

class EnclaveKeypair:
    """
    Opaque handle to an ECDSA keypair sealing the private key inside
    the enclave boundary.

    Attributes
    ----------
    eth_address : str
        Ethereum address derived from the public key (0x-prefixed, 20 bytes).

    Notes
    -----
    The private key is captured in a closure inside `get_signing_function()`
    and is NEVER exposed as an attribute or return value of this class.
    """

    def __init__(self, eth_address: str, _sign_fn: Callable) -> None:
        # TEE BOUNDARY: private key is captured in the closure _sign_fn only.
        self.eth_address: str = eth_address
        self._sign_fn: Callable = _sign_fn

    def get_signing_function(self) -> Callable[[bytes], bytes]:
        """
        Return a callable that signs a 32-byte digest with the sealed private key.

        Returns
        -------
        Callable[[bytes], bytes]
            A function `sign_hash(hash_bytes) -> bytes` producing a 65-byte
            Ethereum-compatible signature (r || s || v).
        """
        return self._sign_fn

    def __repr__(self) -> str:
        return f"<EnclaveKeypair eth_address={self.eth_address}>"


# ---------------------------------------------------------------------------
# Key generation
# ---------------------------------------------------------------------------

def generate_ecdsa_keypair(tee_identity: str | None = None) -> EnclaveKeypair:
    """
    Generate (or deterministically derive) an ECDSA keypair on SECP256k1.

    When `tee_identity` is provided, the private key is derived deterministically
    via HKDF-SHA256 from the identity string. This simulates how a real TEE
    hardware root-of-trust produces the same signing key across restarts so long
    as the enclave measurement (MRENCLAVE) remains the same.

    When `tee_identity` is None, a fresh random keypair is generated.

    Parameters
    ----------
    tee_identity : str or None, optional
        TEE identity string (e.g. from env var TEE_IDENTITY). If given, the
        private key is derived deterministically — identical identity produces
        identical key, allowing the same key to be used across Python invocations.
        Pass None to generate a non-deterministic ephemeral keypair.

    Returns
    -------
    EnclaveKeypair
        An opaque keypair handle exposing only the Ethereum address and a
        signing callable. Private key bytes are inaccessible from outside.

    Notes
    -----
    # TEE BOUNDARY: private key never leaves this function scope.
    In production this function would call the 0G Compute TEE key-generation
    API which seals the key to the enclave's MRENCLAVE measurement.
    # 0G INTEGRATION: Replace with 0G Compute TEE key provisioning API.
    """
    # TEE BOUNDARY: private key derivation happens here and only here.
    if tee_identity:
        # Deterministic derivation: HKDF-SHA256(tee_identity) -> 32-byte scalar
        # This simulates TEE sealing: same MRENCLAVE -> same private key.
        _salt: bytes = b"SealedClaw-v1-ECDSA-signing-key"
        _hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=_salt,
            info=b"tee-ecdsa-private-key",
            backend=default_backend(),
        )
        _raw_privkey_bytes: bytes = _hkdf.derive(tee_identity.encode("utf-8"))
    else:
        # Non-deterministic: generate fresh random keypair (for standalone use)
        _raw_privkey_bytes = os.urandom(32)

    # eth-keys validates the scalar is in [1, N-1]; retry only for random path.
    _MAX_RETRIES = 8
    for _attempt in range(_MAX_RETRIES):
        try:
            _private_key: PrivateKey = eth_keys_lib.PrivateKey(_raw_privkey_bytes)
            break
        except Exception:
            if tee_identity:
                raise RuntimeError(
                    "HKDF-derived key is invalid for SECP256k1 — update TEE_IDENTITY."
                )
            _raw_privkey_bytes = os.urandom(32)
    else:
        raise RuntimeError("Failed to generate a valid SECP256k1 private key after retries.")

    # Derive the Ethereum address from the public key
    _pub_key = _private_key.public_key
    # eth-keys exposes the 64-byte uncompressed pubkey (without the 04 prefix)
    _raw_pub_bytes: bytes = _pub_key.to_bytes()
    _keccak_digest: bytes = keccak(_raw_pub_bytes)
    eth_address: str = "0x" + _keccak_digest[12:].hex()

    # Closure captures _private_key -- the ONLY place it lives after this fn.
    def _sign_fn(hash_bytes: bytes) -> bytes:
        """
        Sign a 32-byte hash using the sealed ECDSA private key.

        Parameters
        ----------
        hash_bytes : bytes
            32-byte message digest to sign (already Ethereum-prefixed).

        Returns
        -------
        bytes
            65-byte signature: r (32 bytes) || s (32 bytes) || v (1 byte).
            Compatible with Solidity's `ecrecover` / ECDSA.recover.
            v is 27 or 28 (Ethereum legacy format).

        # TEE BOUNDARY: private key access is restricted to this closure.
        """
        if len(hash_bytes) != 32:
            raise ValueError(
                f"Expected 32-byte hash for signing, got {len(hash_bytes)} bytes."
            )

        # eth-keys produces a Signature with (v, r, s) where v in {0, 1}
        eth_sig: EthSignature = _private_key.sign_msg_hash(hash_bytes)

        # Unpack and repack as 65-byte r || s || v (v = 27 + eth_sig.v)
        r: int = eth_sig.r
        s: int = eth_sig.s
        v: int = 27 + eth_sig.v  # Ethereum canonical: 27 or 28

        sig_bytes: bytes = (
            r.to_bytes(32, "big")
            + s.to_bytes(32, "big")
            + bytes([v])
        )
        return sig_bytes

    return EnclaveKeypair(eth_address=eth_address, _sign_fn=_sign_fn)


def generate_aes_key(tee_identity: str) -> bytes:
    """
    Derive a 32-byte AES-256-GCM key sealed to the TEE identity string.

    Uses HKDF-SHA256 to derive a deterministic key from the TEE identity,
    simulating hardware key sealing where the AES key is bound to the
    MRENCLAVE measurement of the enclave.

    Parameters
    ----------
    tee_identity : str
        The enclave identity string (e.g. from ENV var `TEE_IDENTITY`).
        In production this is the MRENCLAVE value from the attestation report.

    Returns
    -------
    bytes
        32 raw bytes suitable for AES-256-GCM encryption.

    Notes
    -----
    # TEE BOUNDARY: AES key is derived inside the enclave and never logged.
    # 0G INTEGRATION: In production, derive from TEE sealing key API
    #   provided by 0G Compute runtime using the hardware root of trust.
    """
    if not tee_identity:
        raise ValueError("tee_identity must be a non-empty string.")

    # Static salt tied to this project -- prevents cross-project key reuse
    _salt: bytes = b"SealedClaw-v1-AES-GCM-seal"

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_salt,
        info=b"enclave-memory-encryption",
        backend=default_backend(),
    )
    # TEE BOUNDARY: AES key bytes are never returned to external callers
    # beyond what is strictly necessary for encrypt/decrypt operations.
    aes_key: bytes = hkdf.derive(tee_identity.encode("utf-8"))
    return aes_key
