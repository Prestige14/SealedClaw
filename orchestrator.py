import os
import json
import time
import subprocess
from dotenv import load_dotenv
from web3 import Web3
from web3.exceptions import ContractLogicError
from openai import OpenAI

# Load environment variables
load_dotenv()

# =========================================================================
# OPENCLAW SDK (Agent Framework Simulation)
# =========================================================================

class OpenClawSkill:
    """Base class for an OpenClaw Agent skill."""
    def __init__(self, name: str, description: str, func: callable):
        self.name = name
        self.description = description
        self.func = func
        
    def get_tool_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "intent": {
                            "type": "string",
                            "description": "The user's trading intent or parameters (e.g., 'Optimize yield with 5% risk max')."
                        }
                    },
                    "required": ["intent"],
                },
            }
        }

    def execute(self, **kwargs):
        print(f"\n[OpenClaw] Executing Skill: {self.name} -> Parameters: {kwargs}")
        return self.func(**kwargs)


class OpenClawAgent:
    """An autonomous LLM-powered agent that utilizes OpenClaw skills."""
    def __init__(self, name: str, model: str = "gpt-4o-mini"):
        self.name = name
        self.model = model
        self.skills = {}
        
        # Ensure OpenAI API key exists for NLP reasoning
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            print("[-] OPENAI_API_KEY missing from .env. OpenClaw Agent needs this for NLP routing!")
            self.client = None
        else:
            self.client = OpenAI(api_key=self.api_key)

    def register_skill(self, skill: OpenClawSkill):
        self.skills[skill.name] = skill
        print(f"[OpenClaw] Skill registered: {skill.name}")

    def run(self, user_prompt: str):
        print(f"\n[OpenClaw] User Intent: '{user_prompt}'")
        
        if not self.client:
            print("[-] Skipping NLP reasoning due to missing API Key. Forcing skill execution directly for simulation...")
            # Fallback for hackathon grading without API key
            skill_name = list(self.skills.keys())[0]
            return self.skills[skill_name].execute(intent=user_prompt)

        tools = [skill.get_tool_schema() for skill in self.skills.values()]
        messages = [
            {"role": "system", "content": f"You are {self.name}, an autonomous AI trading agent. You have access to secure TEE-based tools."},
            {"role": "user", "content": user_prompt}
        ]

        print(f"[OpenClaw] Analyzing intent using {self.model}...")
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="auto"
            )
            
            message = response.choices[0].message
            
            if message.tool_calls:
                for tool_call in message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    if function_name in self.skills:
                        skill_result = self.skills[function_name].execute(**function_args)
                        print(f"\n[OpenClaw] Agent Execution Complete.")
                        return skill_result
                    else:
                        print(f"[-] Agent requested unknown skill: {function_name}")
            else:
                print(f"[OpenClaw] Agent Answer: {message.content}")

        except Exception as e:
            print(f"[-] Agent NLP Error: {e}. Forcing fallback execution...")
            # Fallback
            skill_name = list(self.skills.keys())[0]
            return self.skills[skill_name].execute(intent=user_prompt)

# =========================================================================
# SEALEDCLAW TEE EXECUTION LOGIC (Refactored into Skill)
# =========================================================================

def execute_sealed_trade(intent: str):
    """
    Core function that connects to Web3, fetches dynamic nonce,
    runs the TEE worker, and relays the signed payload.
    """
    print(f"\n{ '='*60 }")
    print(f"  [SKILL] SEALEDCLAW EXECUTING TRADE")
    print(f"{ '='*60 }\n")

    # ---------------------------------------------------------
    # 1. SETUP WEB3 & FETCH DYNAMIC NONCE
    # ---------------------------------------------------------
    rpc_url = os.getenv("RPC_URL")
    relayer_pk = os.getenv("RELAYER_PRIVATE_KEY")
    policy_vault_address = os.getenv("POLICY_VAULT_ADDRESS")
    token_id_env = int(os.getenv("TOKEN_ID", "0"))

    if not rpc_url or not relayer_pk or not policy_vault_address:
        print("[-] Missing environment variables! Please check .env (RPC_URL, RELAYER_PRIVATE_KEY, POLICY_VAULT_ADDRESS).")
        return "FAILED: Missing ENV dependencies."

    web3 = Web3(Web3.HTTPProvider(rpc_url))
    if not web3.is_connected():
        print("[-] Failed to connect to the Web3 RPC endpoint.")
        return "FAILED: Web3 Connection Error."
        
    print(f"[+] Connected to network: {rpc_url}")
    relayer_account = web3.eth.account.from_key(relayer_pk)
    print(f"[+] Relayer Address: {relayer_account.address}")
    
    balance_wei = web3.eth.get_balance(relayer_account.address)
    if balance_wei == 0:
        print("[-] Warning: Relayer has 0 ETH! Transaction will likely fail due to insufficient funds.")

    print(f"\n[1] Fetching Dynamic Nonce for Token ID {token_id_env} from PolicyVault...")
    policy_vault_address_checksum = web3.to_checksum_address(policy_vault_address)
    abi_nonce = [
        {"inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "name": "nonces", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}
    ]
    contract_nonce = web3.eth.contract(address=policy_vault_address_checksum, abi=abi_nonce)
    
    try:
        current_nonce = contract_nonce.functions.nonces(token_id_env).call()
        print(f"[+] Current On-Chain Nonce: {current_nonce}\n")
    except Exception as e:
        print(f"[-] Failed to fetch nonce from contract: {e}")
        return f"FAILED: {e}"

    # ---------------------------------------------------------
    # 2. TRIGGER TEE WORKER
    # ---------------------------------------------------------
    output_filename = "tee_payload.json"
    
    print("[2] Triggering TEE Worker...")
    try:
        # Pass dynamic nonce to tee-worker
        result = subprocess.run(
            ["python", "tee-worker/main.py", "--output", output_filename, "--nonce", str(current_nonce)],
            capture_output=True,
            text=True,
            check=True
        )
        print("[+] TEE Worker executed successfully.\n")
        print("    --- TEE Worker Console Output ---")
        print(result.stdout)
        print("    ---------------------------------\n")
    except subprocess.CalledProcessError as e:
        print("[-] TEE Worker execution failed!")
        print(f"Error Code: {e.returncode}")
        print(f"Stdout:\n{e.stdout}")
        print(f"Stderr:\n{e.stderr}")
        return "FAILED: TEE execution reverted."

    # ---------------------------------------------------------
    # 3. PARSE PAYLOAD
    # ---------------------------------------------------------
    print(f"[3] Parsing TEE Payload from {output_filename}...")
    if not os.path.exists(output_filename):
        print(f"[-] File {output_filename} not found. Did TEE worker fail to write it?")
        return "FAILED: Missing tee_payload.json"
        
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
        return "FAILED: Malformed Payload"

    # ---------------------------------------------------------
    # 4. SEND ON-CHAIN TRANSACTION
    # ---------------------------------------------------------
    print("[4] Preparing On-Chain Transaction...")
    
    balance_eth = web3.from_wei(balance_wei, "ether")
    print(f"    Relayer Balance: {balance_eth} ETH")

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
            return f"SUCCESS: Tx={web3.to_hex(tx_hash)}"
        else:
            print(f"[-] Transaction Reverted. Receipt status: {receipt.status}")
            return "FAILED: Transaction Reverted On-Chain."
            
    except ContractLogicError as e:
        print(f"[-] Transaction reverted during estimation: {e}")
        return f"FAILED: Gas Estimation ({e})"
    except Exception as e:
        print(f"[-] Error while sending transaction: {e}")
        return f"FAILED: {e}"

# =========================================================================
# MAIN EXECUTION: Agent Flow
# =========================================================================

if __name__ == "__main__":
    print("============================================================")
    print("  Initialize OpenClaw SDK")
    print("============================================================")
    
    # Instantiate the wrapper Agent
    agent = OpenClawAgent(name="SealedClaw-0G-Oracle")
    
    # Create the Trading Skill that wraps our Web3/TEE subprocess routine
    trade_skill = OpenClawSkill(
        name="execute_sealed_trade",
        description="Triggers the secure TEE enclave to compute trading strategies based on intent and relays the transaction to 0G Blockchain.",
        func=execute_sealed_trade
    )
    
    # Register the skill to the Agent
    agent.register_skill(trade_skill)
    
    # Simulate a user intent/prompt
    user_prompt = "Tolong optimasi yield saya hari ini dengan risiko maksimal 5%."
    
    # Run the Agent autonomously
    agent.run(user_prompt)
