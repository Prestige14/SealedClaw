# SealedClaw Trader

**Sovereign iNFT Trading Agent — 0G APAC Hackathon 2026**

SealedClaw is an autonomous on-chain trading agent built on the 0G ecosystem. Each agent is represented as an **ERC-7857 Agentic iNFT** with a cryptographically enforced risk policy vault and a **Python TEE worker** that generates tamper-proof trading signals from inside a simulated Trusted Execution Environment.

---

## Deployed Contracts — 0G Galileo Testnet

| Contract | Address |
|---|---|
| **SealedClawAgent** (ERC-7857 iNFT) | [`0xD836bC71C9ECAe447F3f323d9C4E982A0ad178D2`](https://chainscan-galileo.0g.ai/address/0xD836bC71C9ECAe447F3f323d9C4E982A0ad178D2) |
| **PolicyVault** | [`0x60aC7E3E0e7D498fCa1d7F526BB21F90d1E43D5F`](https://chainscan-galileo.0g.ai/address/0x60aC7E3E0e7D498fCa1d7F526BB21F90d1E43D5F) |

- **Network**: 0G Galileo Testnet · **Chain ID**: `16602`
- **RPC**: `https://evmrpc-testnet.0g.ai`
- **Deployed**: 2026-04-12
- **Deployer**: `0x1960C0c9A89755eA6E56758C8fFb1e03180B1521`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  0G Galileo Testnet                     │
│                                                         │
│   ┌──────────────────┐    ┌──────────────────────────┐  │
│   │ SealedClawAgent  │    │      PolicyVault         │  │
│   │   (ERC-7857)     │◄───│  executeWithProof()      │  │
│   │                  │    │  • ecrecover(signature)  │  │
│   │  Agentic iNFT    │    │  • nonce anti-replay     │  │
│   │  + 0G Storage    │    │  • risk policy checks    │  │
│   │  CID metadata    │    │  • DEX allowlist         │  │
│   └──────────────────┘    └──────────┬───────────────┘  │
│                                      │ verify sig        │
└──────────────────────────────────────┼──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │        TEE Worker (Python)           │
                    │                                      │
                    │  ┌─────────┐  ┌──────────────────┐  │
                    │  │ Enclave │  │  Oracle Agg.     │  │
                    │  │ ECDSA   │  │  Pyth+CL+TWAP    │  │
                    │  │ keypair │  │  median price    │  │
                    │  │ AES-GCM │  └──────────────────┘  │
                    │  │ sealing │  ┌──────────────────┐  │
                    │  └────┬────┘  │ Strategy Engine  │  │
                    │       │sign   │ BUY/HOLD/REDUCE  │  │
                    │  ┌────▼────┐  └──────────────────┘  │
                    │  │Payload  │  ┌──────────────────┐  │
                    │  │Builder  │  │ 0G Storage       │  │
                    │  │ABI-enc. │  │ Encrypted Memory │  │
                    │  └─────────┘  └──────────────────┘  │
                    └─────────────────────────────────────┘
```

---

## Phase 1 — Smart Contracts

### `SealedClawAgent.sol` — ERC-7857 Agentic iNFT

- Standard ERC-721 NFT where each token represents an autonomous trading agent
- Metadata CID stored on-chain with `0g://` prefix → points to encrypted agent config on 0G Storage
- `mintAgent(metadataCID)` — public mint, one agent per transaction
- Owner-controlled metadata updates and collaborator authorization

### `PolicyVault.sol` — Risk Policy + TEE Verification Vault

Core execution function:

```solidity
function executeWithProof(
    uint256 tokenId,
    bytes calldata strategyData,   // ABI-encoded trade params
    uint256 tradeAmount,
    address targetDEX,
    bytes calldata signature,       // 65-byte ECDSA from TEE
    uint256 deadline
) external
```

Security checks performed on every execution:
1. **Deadline** — reverts if `block.timestamp > deadline`
2. **Policy set** — reverts if no policy configured for token
3. **DEX allowlist** — `targetDEX` must be in `policy.allowedDEXs`
4. **Daily limit** — cumulative spend resets at midnight UTC
5. **Risk per trade** — max `riskMaxPercent` of user balance per call
6. **TEE signature** — `keccak256(abi.encodePacked(tokenId, strategyData, nonce, deadline, address(this)))` is verified via `ecrecover`; signer must equal `teeEnclavePubKey`
7. **Nonce increment** — prevents replay attacks; nonce stored separately from policy

Additional features:
- `updateTeeEnclavePubKey()` — 24h rotation cooldown
- `ReentrancyGuard`, `Pausable`, `Ownable` from OpenZeppelin v5
- Per-user balance accounting (`deposit` / `withdraw`)
- `emergencyWithdraw()` for owner safety

---

## Phase 2 — TEE Worker (`tee-worker/`)

Python package simulating a **Trusted Execution Environment** via 0G Compute Sealed Inference.

### Package Structure

```
tee-worker/
├── main.py                  # End-to-end orchestration (7 phases)
├── enclave/
│   ├── keys.py              # ECDSA keypair (deterministic HKDF sealing)
│   ├── attestation.py       # Mock TEE attestation report
│   └── crypto.py            # Solidity-compatible hashing + AES-256-GCM
├── oracle/
│   └── aggregator.py        # Pyth + Chainlink + TWAP median aggregation
├── agent/
│   └── strategy.py          # BUY / HOLD / REDUCE_ONLY decision logic
├── payload/
│   └── builder.py           # ABI-encode + sign + assemble executeWithProof payload
├── scripts/
│   └── verify_phase2.py     # Standalone 7-point verification suite
├── requirements.txt
└── .env.example
```

### Execution Cycle

```
[1] TEE INIT       Generate ECDSA keypair (HKDF from TEE_IDENTITY)
                   Derive AES-256-GCM key (HKDF from TEE_IDENTITY)
                   Generate mock attestation report
                       → Simulates: PolicyVault.updateTeeEnclavePubKey()

[2] ORACLE         Fetch Pyth + Chainlink + TWAP prices
                   Compute manipulation-resistant median
                   Raise OracleDeviationError if MAX-MIN > 2%

[3] MEMORY READ    Decrypt agent memory blob from 0G Storage
                       → 0G INTEGRATION: fetch from 0G Storage KV store

[4] AGENT          make_trading_decision(price, memory, tokenId)
                   BUY if price +2% | REDUCE_ONLY if -3% | else HOLD

[5] PAYLOAD        ABI-encode decision as strategyData
                   Compute keccak256(abi.encodePacked(...)) — Solidity-exact
                   Apply toEthSignedMessageHash prefix
                   Sign with TEE ECDSA key (65-byte r+s+v)

[6] MEMORY WRITE   Encrypt updated state with AES-256-GCM
                   Upload encrypted blob to 0G Storage
                       → 0G INTEGRATION: store to 0G Storage KV store

[7] OUTPUT         Return JSON payload ready for executeWithProof()
```

### Cryptographic Compatibility

The Python hash construction exactly reproduces the Solidity message hash:

```python
# Python (enclave/crypto.py)
keccak256(
    tokenId.to_bytes(32, "big")       # uint256
    + strategy_data                    # bytes (raw)
    + nonce.to_bytes(32, "big")       # uint256
    + deadline.to_bytes(32, "big")    # uint256
    + bytes.fromhex(vault_address)    # address (20 bytes)
)
```

```solidity
// Solidity (PolicyVault.sol)
keccak256(abi.encodePacked(
    tokenId,        // uint256
    strategyData,   // bytes
    nonces[tokenId],// uint256
    deadline,       // uint256
    address(this)   // address
))
```

Both are then wrapped with `toEthSignedMessageHash` before signing/recovering.

### Key Security Properties

| Property | Implementation |
|---|---|
| Private key isolation | Closure-captured; never returned, printed, or logged |
| Deterministic sealing | Private key derived via HKDF-SHA256 from `TEE_IDENTITY` |
| Memory confidentiality | AES-256-GCM with 12-byte random nonce per write |
| Oracle manipulation resistance | Median of 3 sources; 2% deviation threshold |
| Replay protection | `nonce` + `deadline` + `address(this)` in signed hash |
| Auth tag verification | GCM tag fails on any ciphertext tamper |

---

## Verified Integration Test

The full Phase 1 ↔ Phase 2 integration is verified by a Hardhat test:

```
Phase 1 <-> Phase 2 Integration: TEE Signature Verification
  √ should verify Python TEE signature on-chain via ecrecover
  √ should increment nonce after successful execution
  √ should reject replayed signature (nonce mismatch)
  √ should reject expired deadline

4 passing (1s)
```

Run with:
```bash
npx hardhat test test/TEESignature.test.ts
```

---

## Setup

### Smart Contracts (Phase 1)

**Requirements**: Node.js 18+, npm

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in PRIVATE_KEY, RPC_URL

# 3. Compile
npm run compile

# 4. Deploy to 0G Galileo Testnet
npm run deploy:testnet

# 5. Run integration test (local Hardhat network)
npx hardhat test test/TEESignature.test.ts
```

### TEE Worker (Phase 2)

**Requirements**: Python 3.11+

```bash
cd tee-worker

# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Fill in TEE_IDENTITY, POLICY_VAULT_ADDRESS, TOKEN_ID, CURRENT_NONCE

# 3. Run simulation (full end-to-end cycle)
python main.py

# 4. Run with JSON output (for Hardhat/Foundry integration)
python main.py --output payload.json --vault 0xYourVault --token-id 0 --nonce 0

# 5. Run Python-only verification suite (7 checks)
python scripts/verify_phase2.py
```

### Environment Variables

#### Root `.env`
```env
PRIVATE_KEY=your_wallet_private_key_hex
RPC_URL=https://evmrpc-testnet.0g.ai
ETHERSCAN_API_KEY=your_0g_chainscan_api_key
```

#### `tee-worker/.env`
```env
TEE_IDENTITY=sealed-claw-tee-v1-mrenclave-abc123
POLICY_VAULT_ADDRESS=0xYourPolicyVaultAddress
TOKEN_ID=0
CURRENT_NONCE=0
TARGET_DEX_ADDRESS=0xYourDEXAddress
```

> **Never commit `.env` files.** Both are listed in `.gitignore`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity `^0.8.24`, EVM `cancun` |
| Contract Framework | Hardhat `^2.22` + TypeScript |
| Contract Libraries | OpenZeppelin Contracts `^5.0` |
| Blockchain | 0G Galileo Testnet (Chain ID: 16602) |
| Storage Protocol | 0G Storage (`0g://` CID prefix) |
| TEE Simulation | Python 3.11+, `eth-keys`, `cryptography`, `eth-abi` |
| Key Derivation | HKDF-SHA256 (signing key + AES key from `TEE_IDENTITY`) |
| Memory Encryption | AES-256-GCM with GCM authentication tag |
| Oracle Feeds | Pyth Network + Chainlink + on-chain TWAP (simulated) |
| Signature Scheme | SECP256k1 ECDSA, 65-byte `r+s+v`, Ethereum canonical |

---

## Project Structure

```
SealedClaw/
├── contracts/
│   ├── SealedClawAgent.sol      # ERC-7857 Agentic iNFT
│   └── PolicyVault.sol          # Risk policy + TEE ECDSA vault
├── tee-worker/                  # Phase 2: Python TEE simulation
│   ├── main.py
│   ├── enclave/                 # Key generation, attestation, crypto
│   ├── oracle/                  # Multi-oracle price aggregation
│   ├── agent/                   # Trading strategy engine
│   ├── payload/                 # Payload builder & ABI encoding
│   ├── scripts/verify_phase2.py # Standalone verification suite
│   ├── requirements.txt
│   └── .env.example
├── test/
│   └── TEESignature.test.ts     # Phase 1 <-> Phase 2 integration test
├── scripts/
│   └── deploy.ts                # Deployment script
├── hardhat.config.ts
├── .env.example
└── package.json
```

---

## Roadmap

- [x] **Phase 1** — Smart contract foundation & testnet deployment
- [x] **Phase 2** — TEE worker simulation with verified Solidity signature compatibility
- [ ] **Phase 3** — Live 0G Compute integration + real 0G Storage CID pinning
- [ ] **Phase 4** — Production DEX adapters + on-chain TWAP oracle
- [ ] **Phase 5** — Frontend dashboard + agent marketplace
