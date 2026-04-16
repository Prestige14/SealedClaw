import os
import json
import time
import subprocess
from dotenv import load_dotenv
from web3 import Web3
from web3.exceptions import ContractLogicError

# Load environment variables
load_dotenv()

def run_orchestrator():
    print(f"{'='*60}")
    print(f"  [ORCHESTRATOR] SEALEDCLAW RELAYER STARTING")
    print(f"{'='*60}\n")

    # ---------------------------------------------------------
    # 1. TRIGGER TEE WORKER
    # ---------------------------------------------------------
    output_filename = "tee_payload.json"
    
    print("[1] Triggering TEE Worker...")
    try:
        # Run the TEE worker as a subprocess and block until it completes
        # Make sure to run it in the correct directory if needed, but since
        # the command uses 'tee-worker/main.py', running from root is fine.
        result = subprocess.run(
            ["python", "tee-worker/main.py", "--output", output_filename],
            capture_output=True,
            text=True,
            check=True
        )
        print("[+] TEE Worker executed successfully.\n")
        # You can print stdout if you want to see the TEE logs:
        # print(result.stdout)
    except subprocess.CalledProcessError as e:
        print("[-] TEE Worker execution failed!")
        print(f"Error Code: {e.returncode}")
        print(f"Stdout:\n{e.stdout}")
        print(f"Stderr:\n{e.stderr}")
        return

    # ---------------------------------------------------------
    # 2. PARSE PAYLOAD
    # ---------------------------------------------------------
    print(f"[2] Parsing TEE Payload from {output_filename}...")
    if not os.path.exists(output_filename):
        print(f"[-] File {output_filename} not found. Did TEE worker fail to write it?")
        return
        
    with open(output_filename, "r") as f:
        payload = json.load(f)
        
    try:
        token_id = payload["tokenId"]
        strategy_data = payload["strategyData"]
        trade_amount = payload["tradeAmount"]
        target_dex = payload["targetDEX"]
        nonce = payload["nonce_used"]
        deadline = payload["deadline"]
        signature = payload["signature"]
        
        print(f"    Token ID     : {token_id}")
        print(f"    Nonce        : {nonce}")
        print(f"    Deadline     : {deadline}")
        print(f"    Strategy Data: {strategy_data[:32]}... (truncated)")
        print(f"    Signature    : {signature[:32]}... (truncated)\n")
    except KeyError as e:
        print(f"[-] Missing expected key in payload: {e}")
        return

    # ---------------------------------------------------------
    # 3. SEND ON-CHAIN TRANSACTION
    # ---------------------------------------------------------
    print("[3] Preparing On-Chain Transaction...")
    rpc_url = os.getenv("RPC_URL")
    relayer_pk = os.getenv("RELAYER_PRIVATE_KEY")
    policy_vault_address = os.getenv("POLICY_VAULT_ADDRESS")

    if not rpc_url or not relayer_pk or not policy_vault_address:
        print("[-] Missing environment variables! Please check .env (RPC_URL, RELAYER_PRIVATE_KEY, POLICY_VAULT_ADDRESS).")
        return

    web3 = Web3(Web3.HTTPProvider(rpc_url))
    if not web3.is_connected():
        print("[-] Failed to connect to the Web3 RPC endpoint.")
        return
        
    print(f"[+] Connected to network: {rpc_url}")

    # Set up Relayer Account
    relayer_account = web3.eth.account.from_key(relayer_pk)
    print(f"[+] Relayer Address: {relayer_account.address}")
    
    # Check balance
    balance_wei = web3.eth.get_balance(relayer_account.address)
    balance_eth = web3.from_wei(balance_wei, "ether")
    print(f"    Relayer Balance: {balance_eth} ETH")
    if balance_wei == 0:
        print("[-] Warning: Relayer has 0 ETH! Transaction will likely fail due to insufficient funds.")

    # ABI Minimal SDK untuk memanggil `executeWithProof` di PolicyVault
    abi = [
        {
            "inputs": [
                {"internalType": "uint256", "name": "tokenId", "type": "uint256"},
                {"internalType": "bytes", "name": "strategyData", "type": "bytes"},
                {"internalType": "uint256", "name": "tradeAmount", "type": "uint256"},
                {"internalType": "address", "name": "targetDEX", "type": "address"},
                {"internalType": "bytes", "name": "signature", "type": "bytes"},
                {"internalType": "uint256", "name": "deadline", "type": "uint256"}
            ],
            "name": "executeWithProof",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }
    ]

    policy_vault_address_checksum = web3.to_checksum_address(policy_vault_address)
    contract = web3.eth.contract(address=policy_vault_address_checksum, abi=abi)

    # Build Transaction
    try:
        print("[*] Estimating gas and building transaction...")
        tx_base = contract.functions.executeWithProof(
            token_id, 
            Web3.to_bytes(hexstr=strategy_data), 
            trade_amount,
            web3.to_checksum_address(target_dex),
            Web3.to_bytes(hexstr=signature),
            deadline
        ).build_transaction({
            "from": relayer_account.address,
            "nonce": web3.eth.get_transaction_count(relayer_account.address),
            # Optional: Jika testnet tidak stabil dalam gas estimation, 
            # bisa atur gas/gasPrice manual
        })

        # Sign Transaction
        signed_tx = web3.eth.account.sign_transaction(tx_base, relayer_pk)
        
        # Send Transaction
        print("[*] Broadcasting transaction...")
        tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        print(f"\n[+] SUCCESS! Transaction broadcasted.")
        print(f"[+] TX Hash: {web3.to_hex(tx_hash)}")
        
        # Wait for receipt
        print("[*] Waiting for transaction confirmation...")
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt.status == 1:
            print(f"[+] Transaction Confirmed! Block: {receipt.blockNumber}, Gas Used: {receipt.gasUsed}")
        else:
            print(f"[-] Transaction Reverted. Receipt status: {receipt.status}")
            
    except ContractLogicError as e:
        print(f"[-] Transaction reverted during estimation: {e}")
    except Exception as e:
        print(f"[-] Error while sending transaction: {e}")

if __name__ == "__main__":
    run_orchestrator()
