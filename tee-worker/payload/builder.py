"""
payload/builder.py — Payload Construction & Output Formatting

Builds the complete signed payload consumable by PolicyVault.executeWithProof().
This is the final assembly step in the TEE worker cycle: it takes the trading
decision, ABI-encodes the strategy data, computes the Solidity-compatible hash,
signs it with the TEE ECDSA key, and bundles everything into a JSON-ready dict.

Output is directly copy-pasteable into Hardhat / Foundry test calls.
"""

import time
from typing import Any, Callable

import eth_abi

from enclave.crypto import (
    build_eth_signed_message_hash,
    compute_payload_hash,
)
from enclave.attestation import generate_attestation_report


# ---------------------------------------------------------------------------
# Mock addresses (replace with real deployment addresses in production)
# ---------------------------------------------------------------------------

_MOCK_DEX_ADDRESS: str = "0x000000000000000000000000000000000000dEaD"


# ---------------------------------------------------------------------------
# ABI encoding helpers
# ---------------------------------------------------------------------------

def build_strategy_data(decision: dict[str, Any]) -> bytes:
    """
    ABI-encode the trading decision into ``strategyData`` bytes for Solidity.

    Encodes the decision as ``(string action, uint256 amount, string asset)``
    so it can be decoded on-chain inside PolicyVault or downstream DEX adapters.

    Parameters
    ----------
    decision : dict[str, Any]
        Decision dict from ``agent.strategy.make_trading_decision``. Required keys:
        - ``action`` (str): ``"BUY"``, ``"HOLD"``, or ``"REDUCE_ONLY"``.
        - ``amount_wei`` (int): Trade size in wei.
        - ``asset`` (str): Asset ticker (e.g. ``"ETH"``).

    Returns
    -------
    bytes
        ABI-encoded bytes representing
        ``abi.encode(string action, uint256 amount, string asset)``
        in Solidity — exactly the format expected by the DEX adapter contract.

    Raises
    ------
    KeyError
        If required keys are missing from the decision dict.
    """
    action: str = decision["action"]
    amount_wei: int = int(decision["amount_wei"])
    asset: str = decision["asset"]

    # Encode as Solidity: abi.encode(string, uint256, string)
    encoded: bytes = eth_abi.encode(
        ["string", "uint256", "string"],
        [action, amount_wei, asset],
    )
    return encoded


# ---------------------------------------------------------------------------
# Full payload builder
# ---------------------------------------------------------------------------

def build_final_payload(
    token_id: int,
    decision: dict[str, Any],
    nonce: int,
    policy_vault_address: str,
    sign_fn: Callable[[bytes], bytes],
    tee_pub_key_address: str,
    target_dex_address: str | None = None,
) -> dict[str, Any]:
    """
    Construct the complete signed payload ready for PolicyVault.executeWithProof().

    This is the central assembly function of the TEE worker. It:

    1. ABI-encodes the strategy decision into ``strategyData``.
    2. Computes ``deadline = now + 300`` (5-minute expiry).
    3. Reproduces the exact Solidity message hash:
       ``keccak256(abi.encodePacked(tokenId, strategyData, nonce, deadline, address(this)))``.
    4. Applies the Ethereum signed message prefix via ``toEthSignedMessageHash``.
    5. Signs the final hash with the TEE ECDSA key using the sealed ``sign_fn``.
    6. Attaches an attestation report to the payload for on-chain verification.

    Parameters
    ----------
    token_id : int
        ERC-7857 token ID of the agent NFT (uint256).
    decision : dict[str, Any]
        Trading decision from ``agent.strategy.make_trading_decision``.
    nonce : int
        Current nonce from ``PolicyVault.nonces[tokenId]`` (must match on-chain).
    policy_vault_address : str
        Deployed PolicyVault contract address (0x-prefixed, 20 bytes).
    sign_fn : Callable[[bytes], bytes]
        Signing function from ``EnclaveKeypair.get_signing_function()``.
        Accepts a 32-byte hash, returns a 65-byte signature.
    tee_pub_key_address : str
        Ethereum address of the TEE's ECDSA public key (for attestation).
    target_dex_address : str or None, optional
        Address of the DEX to route the trade through. Defaults to the mock
        address. Pass the real DEX address in production.

    Returns
    -------
    dict[str, Any]
        JSON-serializable payload ready for ``PolicyVault.executeWithProof()``:

        .. code-block:: json

            {
                "tokenId":        1,
                "strategyData":   "0x...",
                "tradeAmount":    50000000000000000,
                "targetDEX":      "0x...",
                "signature":      "0x...(65 bytes)",
                "deadline":       1712345678,
                "nonce_used":     0,
                "payload_hash":   "0x...(32 bytes, pre-prefix)",
                "eth_signed_hash":"0x...(32 bytes, post-prefix)",
                "decision":       {...},
                "attestation_report": {...}
            }

    Notes
    -----
    The ``signature`` field is a 65-byte Ethereum-compatible ECDSA signature
    (r ‖ s ‖ v) where v ∈ {27, 28}. This is the format expected by
    OpenZeppelin's ``ECDSA.recover`` / Solidity's built-in ``ecrecover``.

    # TEE BOUNDARY: signing happens here inside the enclave boundary.
    # The signed payload exits the enclave as an immutable, verifiable artifact.
    """
    dex_address: str = target_dex_address or _MOCK_DEX_ADDRESS

    # Step 1: ABI-encode strategy decision
    strategy_data: bytes = build_strategy_data(decision)

    # Step 2: Compute deadline (5 minutes from now)
    deadline: int = int(time.time()) + 300

    # Step 3: Compute raw Solidity message hash
    # Reproduces: keccak256(abi.encodePacked(tokenId, strategyData, nonce, deadline, address(this)))
    payload_hash: bytes = compute_payload_hash(
        token_id=token_id,
        strategy_data=strategy_data,
        nonce=nonce,
        deadline=deadline,
        policy_vault_address=policy_vault_address,
    )

    # Step 4: Apply Ethereum signed message prefix
    # Reproduces: MessageHashUtils.toEthSignedMessageHash(messageHash)
    eth_signed_hash: bytes = build_eth_signed_message_hash(payload_hash)

    # Step 5: Sign the final hash with the sealed TEE ECDSA key
    # TEE BOUNDARY: sign_fn is a closure over the sealed private key.
    signature: bytes = sign_fn(eth_signed_hash)

    # Sanity check — ecrecover requires exactly 65 bytes
    if len(signature) != 65:
        raise ValueError(
            f"Expected 65-byte signature from TEE, got {len(signature)} bytes."
        )

    # Step 6: Generate attestation report for this cycle
    attestation_report: dict[str, Any] = generate_attestation_report(tee_pub_key_address)

    return {
        "tokenId": token_id,
        "strategyData": "0x" + strategy_data.hex(),
        "tradeAmount": decision["amount_wei"],
        "targetDEX": dex_address,
        "signature": "0x" + signature.hex(),
        "deadline": deadline,
        "nonce_used": nonce,
        # ── Below: diagnostic fields (strip before sending to contract) ──
        "payload_hash": "0x" + payload_hash.hex(),
        "eth_signed_hash": "0x" + eth_signed_hash.hex(),
        "decision": decision,
        "attestation_report": attestation_report,
    }
