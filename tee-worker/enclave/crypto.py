"""
enclave/crypto.py — Hashing, Signing Utilities & AES-256-GCM Encryption

Implements the exact Solidity hash construction from PolicyVault.sol so that
signatures produced here can be verified on-chain via ecrecover.

Critical compatibility constraint:
    PolicyVault.executeWithProof() verifies:

        bytes32 messageHash = keccak256(abi.encodePacked(
            tokenId,           // uint256
            strategyData,      // bytes  (dynamic)
            nonces[tokenId],   // uint256
            deadline,          // uint256
            address(this)      // address (20 bytes)
        ));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address signer   = ethHash.recover(signature);

    Python MUST reproduce the identical byte stream for ecrecover to succeed.
"""

import json
import os
import struct
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from eth_hash.auto import keccak


# ---------------------------------------------------------------------------
# Ethereum Signed Message prefix
# ---------------------------------------------------------------------------

_ETH_SIGN_PREFIX: bytes = b"\x19Ethereum Signed Message:\n32"


def build_eth_signed_message_hash(message_hash: bytes) -> bytes:
    """
    Apply the Ethereum signed-message prefix to a 32-byte hash.

    Replicates OpenZeppelin's ``MessageHashUtils.toEthSignedMessageHash``:

        keccak256("\\x19Ethereum Signed Message:\\n32" + messageHash)

    Parameters
    ----------
    message_hash : bytes
        Raw 32-byte keccak256 digest of the message.

    Returns
    -------
    bytes
        32-byte keccak256 of the prefixed message — the actual digest that
        is signed and later recovered on-chain via ``ECDSA.recover``.

    Raises
    ------
    ValueError
        If ``message_hash`` is not exactly 32 bytes.
    """
    if len(message_hash) != 32:
        raise ValueError(
            f"message_hash must be 32 bytes, got {len(message_hash)}."
        )
    return keccak(_ETH_SIGN_PREFIX + message_hash)


# ---------------------------------------------------------------------------
# abi.encodePacked — manual implementation for Solidity compatibility
# ---------------------------------------------------------------------------

def _abi_encode_packed(
    token_id: int,
    strategy_data: bytes,
    nonce: int,
    deadline: int,
    policy_vault_address: str,
) -> bytes:
    """
    Produce the exact same byte stream as Solidity's ``abi.encodePacked``.

    Solidity types and their packed encodings:
    - uint256  → big-endian 32 bytes (no padding in packed mode)
    - bytes    → raw bytes as-is (no length prefix in packed mode)
    - address  → 20 bytes, lowercase hex (no left-padding in packed mode)

    Parameters
    ----------
    token_id : int
        ERC-7857 token ID (uint256).
    strategy_data : bytes
        ABI-encoded strategy params (raw bytes, passed as-is).
    nonce : int
        Current nonce for the token ID from ``nonces[tokenId]`` (uint256).
    deadline : int
        Transaction deadline as Unix timestamp (uint256).
    policy_vault_address : str
        Address of the deployed PolicyVault contract (0x-prefixed).

    Returns
    -------
    bytes
        Packed byte stream matching ``abi.encodePacked(tokenId, strategyData,
        nonce, deadline, address(this))`` in Solidity.
    """
    # uint256 → 32 big-endian bytes
    packed_token_id: bytes = token_id.to_bytes(32, "big")
    # bytes → raw (no prefix)
    packed_strategy_data: bytes = strategy_data
    # uint256 → 32 big-endian bytes
    packed_nonce: bytes = nonce.to_bytes(32, "big")
    # uint256 → 32 big-endian bytes
    packed_deadline: bytes = deadline.to_bytes(32, "big")
    # address → 20 bytes (strip 0x prefix, decode hex)
    addr_clean: str = policy_vault_address.lower().removeprefix("0x")
    if len(addr_clean) != 40:
        raise ValueError(
            f"policy_vault_address must be a 20-byte Ethereum address, got: {policy_vault_address}"
        )
    packed_address: bytes = bytes.fromhex(addr_clean)

    return (
        packed_token_id
        + packed_strategy_data
        + packed_nonce
        + packed_deadline
        + packed_address
    )


def compute_payload_hash(
    token_id: int,
    strategy_data: bytes,
    nonce: int,
    deadline: int,
    policy_vault_address: str,
) -> bytes:
    """
    Compute the raw keccak256 message hash matching PolicyVault.executeWithProof.

    Reproduces EXACTLY:

        bytes32 messageHash = keccak256(abi.encodePacked(
            tokenId, strategyData, nonces[tokenId], deadline, address(this)
        ));

    Parameters
    ----------
    token_id : int
        ERC-7857 token ID (uint256).
    strategy_data : bytes
        ABI-encoded trading strategy parameters.
    nonce : int
        Current nonce read from ``nonces[tokenId]`` on PolicyVault.
    deadline : int
        Unix timestamp deadline (uint256).
    policy_vault_address : str
        Deployed PolicyVault contract address (0x-prefixed).

    Returns
    -------
    bytes
        Raw 32-byte ``bytes32`` message hash — must be passed to
        ``build_eth_signed_message_hash`` before signing.
    """
    packed: bytes = _abi_encode_packed(
        token_id=token_id,
        strategy_data=strategy_data,
        nonce=nonce,
        deadline=deadline,
        policy_vault_address=policy_vault_address,
    )
    return keccak(packed)


# ---------------------------------------------------------------------------
# AES-256-GCM encryption/decryption for 0G Storage memory blobs
# ---------------------------------------------------------------------------

def encrypt_memory(memory_data: dict[str, Any], aes_key: bytes) -> dict[str, str]:
    """
    Encrypt an agent memory dict using AES-256-GCM for upload to 0G Storage.

    The memory blob holds the agent's persistent state across execution cycles
    (e.g. last price, last decision, balance). It is encrypted inside the
    TEE before upload so that only a future enclave with the same sealed key
    can read it.

    Parameters
    ----------
    memory_data : dict[str, Any]
        Arbitrary JSON-serializable state dict.
    aes_key : bytes
        32-byte AES-256 key derived from the TEE sealed key (from keys.py).

    Returns
    -------
    dict[str, str]
        Encrypted blob as hex strings:
        - ``ciphertext``  : hex-encoded AES-GCM ciphertext.
        - ``nonce_gcm``   : 12-byte random GCM nonce (hex).
        - ``tag``         : 16-byte GCM authentication tag (hex).

    Notes
    -----
    GCM produces ciphertext ‖ tag as a single buffer in most implementations.
    We split them for explicit representation and easier on-chain handling.
    # TEE BOUNDARY: encryption happens inside the enclave before data leaves.
    # 0G INTEGRATION: Upload the returned dict to 0G Storage KV store.
    """
    if len(aes_key) != 32:
        raise ValueError(f"AES key must be 32 bytes, got {len(aes_key)}.")

    plaintext: bytes = json.dumps(memory_data, separators=(",", ":")).encode("utf-8")

    # Random 12-byte nonce (GCM standard recommendation)
    nonce_gcm: bytes = os.urandom(12)

    aesgcm = AESGCM(aes_key)
    # AESGCM.encrypt returns ciphertext ‖ 16-byte tag
    ciphertext_with_tag: bytes = aesgcm.encrypt(nonce_gcm, plaintext, associated_data=None)

    # Split ciphertext and tag
    tag: bytes = ciphertext_with_tag[-16:]
    ciphertext: bytes = ciphertext_with_tag[:-16]

    return {
        "ciphertext": ciphertext.hex(),
        "nonce_gcm": nonce_gcm.hex(),
        "tag": tag.hex(),
    }


def decrypt_memory(encrypted: dict[str, str], aes_key: bytes) -> dict[str, Any]:
    """
    Decrypt an AES-256-GCM encrypted memory blob retrieved from 0G Storage.

    Parameters
    ----------
    encrypted : dict[str, str]
        Dict with keys ``ciphertext``, ``nonce_gcm``, and ``tag`` as hex strings,
        as produced by ``encrypt_memory``.
    aes_key : bytes
        32-byte AES-256 key (must match the one used during encryption).

    Returns
    -------
    dict[str, Any]
        The original memory state dict.

    Raises
    ------
    ValueError
        If the AES key length is incorrect.
    cryptography.exceptions.InvalidTag
        If authentication tag verification fails (tampered ciphertext).

    Notes
    -----
    # TEE BOUNDARY: decryption happens inside the enclave; plaintext never
    # leaves the secure execution environment.
    # 0G INTEGRATION: Fetch encrypted blob from 0G Storage before calling this.
    """
    if len(aes_key) != 32:
        raise ValueError(f"AES key must be 32 bytes, got {len(aes_key)}.")

    ciphertext: bytes = bytes.fromhex(encrypted["ciphertext"])
    nonce_gcm: bytes = bytes.fromhex(encrypted["nonce_gcm"])
    tag: bytes = bytes.fromhex(encrypted["tag"])

    # Reconstruct ciphertext ‖ tag for AESGCM.decrypt
    ciphertext_with_tag: bytes = ciphertext + tag

    aesgcm = AESGCM(aes_key)
    plaintext: bytes = aesgcm.decrypt(nonce_gcm, ciphertext_with_tag, associated_data=None)

    return json.loads(plaintext.decode("utf-8"))
