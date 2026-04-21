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
# HELPER FUNCTIONS
# =========================================================================

def call_with_retry(func, max_retries=3, backoff_factor=2):
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            print(f"[Retry] Attempt {attempt+1} failed ({e}). Retrying ...")
            time.sleep(backoff_factor ** attempt)

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
                # Add the assistant's tool call message to the history
                messages.append(message)
                
                for tool_call in message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    if function_name in self.skills:
                        skill_result = self.skills[function_name].execute(**function_args)
                        
                        # Feed the tool result back into the prompt for a final conversational answer
                        messages.append({
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": function_name,
                            "content": str(skill_result),
                        })
                
                # Get a final summary response from the agent
                final_response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                )
                print(f"\n[OpenClaw] Agent Final Answer Generated.")
                return final_response.choices[0].message.content
            else:
                print(f"[OpenClaw] Agent Answer: {message.content}")
                return message.content

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

    print(f"\n[1] Fetching Policy, Nonce, and Pending Transfer for Token ID {token_id_env} from PolicyVault...")
    policy_vault_address_checksum = web3.to_checksum_address(policy_vault_address)
    abi_nonce = [
        {"inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "name": "nonces", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}
    ]
    abi_pending = [
        {"inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "name": "pendingTransfers", "outputs": [{"internalType": "address", "name": "newOwner", "type": "address"}, {"internalType": "uint256", "name": "transferInitiatedAt", "type": "uint256"}], "stateMutability": "view", "type": "function"}
    ]
    abi_policy = [
        {"inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}], "name": "getPolicy", "outputs": [{"components": [{"internalType": "uint256", "name": "maxDrawdown", "type": "uint256"}, {"internalType": "uint256", "name": "riskMaxPercent", "type": "uint256"}, {"internalType": "address[]", "name": "allowedTokens", "type": "address[]"}, {"internalType": "address[]", "name": "allowedDEXs", "type": "address[]"}, {"internalType": "uint256", "name": "dailyLimit", "type": "uint256"}], "internalType": "struct PolicyVault.Policy", "name": "", "type": "tuple"}], "stateMutability": "view", "type": "function"},
        {"inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}, {"components": [{"internalType": "uint256", "name": "maxDrawdown", "type": "uint256"}, {"internalType": "uint256", "name": "riskMaxPercent", "type": "uint256"}, {"internalType": "address[]", "name": "allowedTokens", "type": "address[]"}, {"internalType": "address[]", "name": "allowedDEXs", "type": "address[]"}, {"internalType": "uint256", "name": "dailyLimit", "type": "uint256"}], "internalType": "struct PolicyVault.Policy", "name": "newPolicy", "type": "tuple"}], "name": "updatePolicy", "outputs": [], "stateMutability": "nonpayable", "type": "function"}
    ]
    
    contract_nonce = web3.eth.contract(address=policy_vault_address_checksum, abi=abi_nonce)
    contract_pending = web3.eth.contract(address=policy_vault_address_checksum, abi=abi_pending)
    contract_policy = web3.eth.contract(address=policy_vault_address_checksum, abi=abi_policy)
    
    # StrategyVault ABI for reading strategy class
    strategy_vault_address = os.getenv("STRATEGY_VAULT_ADDRESS", "")
    abi_strategy = [
        {"inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}], "name": "getStrategyClass", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "stateMutability": "view", "type": "function"},
        {"inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}], "name": "getResolvedParams", "outputs": [{"internalType": "uint256", "name": "buyThresholdBps", "type": "uint256"}, {"internalType": "uint256", "name": "reduceThresholdBps", "type": "uint256"}, {"internalType": "uint256", "name": "buySizeBps", "type": "uint256"}, {"internalType": "uint8", "name": "strategyClassId", "type": "uint8"}], "stateMutability": "view", "type": "function"}
    ]
    strategy_class_id = 2  # default BALANCED_MERC
    strategy_buy_bps = 200
    strategy_reduce_bps = 300
    strategy_size_bps = 500
    
    if strategy_vault_address:
        strategy_vault_checksum = web3.to_checksum_address(strategy_vault_address)
        contract_strategy = web3.eth.contract(address=strategy_vault_checksum, abi=abi_strategy)
        try:
            params = call_with_retry(lambda: contract_strategy.functions.getResolvedParams(token_id_env).call())
            strategy_buy_bps, strategy_reduce_bps, strategy_size_bps, strategy_class_id = params
            print(f"[+] Strategy Class: #{strategy_class_id} (Buy: {strategy_buy_bps}bps, Reduce: {strategy_reduce_bps}bps, Size: {strategy_size_bps}bps)")
        except Exception as e:
            print(f"[!] StrategyVault read failed, using defaults: {e}")
    
    try:
        # Check Policy first
        policy = call_with_retry(lambda: contract_policy.functions.getPolicy(token_id_env).call())
        target_dex_env = os.getenv("TARGET_DEX_ADDRESS", "0x7530623Cb630AEB93609Ba82c7edb9723fC4dc6F")
        target_dex_checksum = web3.to_checksum_address(target_dex_env)
        
        is_dex_allowed = any(d.lower() == target_dex_checksum.lower() for d in policy[3])
        
        if policy[4] == 0 or not is_dex_allowed:
            print(f"[!] Policy invalid or DEX {target_dex_checksum} not allowed. Attempting autonomous policy update...")
            
            # Preserve existing policy values if they exist
            new_max_drawdown = policy[0] if policy[0] > 0 else 1000
            new_risk_max = policy[1] if policy[1] > 0 else 500
            new_daily_limit = policy[4] if policy[4] > 0 else web3.to_wei(1, 'ether')
            
            # Ensure the target DEX is in the list
            new_allowed_dexs = list(set(list(policy[3]) + [target_dex_checksum]))
            
            new_policy = (
                new_max_drawdown,
                new_risk_max,
                policy[2], # allowedTokens
                new_allowed_dexs,
                new_daily_limit
            )
            
            print(f"[*] Updating policy on-chain: {new_policy}")
            tx_policy = contract_policy.functions.updatePolicy(token_id_env, new_policy).build_transaction({
                "from": relayer_account.address,
                "nonce": web3.eth.get_transaction_count(relayer_account.address),
            })
            signed_policy_tx = web3.eth.account.sign_transaction(tx_policy, relayer_pk)
            tx_hash = web3.eth.send_raw_transaction(signed_policy_tx.raw_transaction)
            print(f"[+] Autonomous Policy sync complete! Tx: {web3.to_hex(tx_hash)}")
            web3.eth.wait_for_transaction_receipt(tx_hash)

        current_nonce = call_with_retry(lambda: contract_nonce.functions.nonces(token_id_env).call())
        print(f"[+] Current On-Chain Nonce: {current_nonce}")
        
        pending_transfer = call_with_retry(lambda: contract_pending.functions.pendingTransfers(token_id_env).call())
        new_owner = pending_transfer[0]
        transfer_initiated_at = pending_transfer[1]
        is_pending_transfer = transfer_initiated_at > 0
        if is_pending_transfer:
            print(f"[+] Pending Transfer Detected: newOwner={new_owner}\n")
        else:
            print("[+] No pending transfer.\n")
    except Exception as e:
        print(f"[-] Failed to fetch contract state: {e}")
        return f"FAILED: {e}"

    # ---------------------------------------------------------
    # 2. TRIGGER TEE WORKER
    # ---------------------------------------------------------
    output_filename = "tee_payload.json"
    
    print("[2] Triggering TEE Worker...")
    try:
        # Pass dynamic nonce and user intent to tee-worker
        cmd = ["python", "tee-worker/main.py", "--output", output_filename, "--nonce", str(current_nonce), "--intent", intent]
        if is_pending_transfer:
            cmd.extend(["--pending-transfer", "--new-owner", str(new_owner)])
            
        # Build env for TEE worker — override with orchestrator's resolved values
        tee_env = os.environ.copy()
        tee_env["CURRENT_NONCE"] = str(current_nonce)
        tee_env["TOKEN_ID"] = str(token_id_env)
        tee_env["POLICY_VAULT_ADDRESS"] = policy_vault_address
        tee_env["TARGET_DEX_ADDRESS"] = target_dex_checksum
        # Inject strategy class for dynamic TEE decision-making
        tee_env["STRATEGY_CLASS_ID"] = str(strategy_class_id)
        tee_env["STRATEGY_BUY_BPS"] = str(strategy_buy_bps)
        tee_env["STRATEGY_REDUCE_BPS"] = str(strategy_reduce_bps)
        tee_env["STRATEGY_SIZE_BPS"] = str(strategy_size_bps)
        
        # Ensure TEE worker uses UTF-8 even on Windows environments with CP1252
        tee_env["PYTHONIOENCODING"] = "utf-8"
        tee_env["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY", "")

        result = call_with_retry(lambda: subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            check=True,
            env=tee_env
        ))
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
        tx_base = call_with_retry(lambda: contract.functions.executeWithProof(
            token_id, 
            Web3.to_bytes(hexstr=strategy_data), 
            trade_amount,
            web3.to_checksum_address(target_dex),
            Web3.to_bytes(hexstr=signature),
            deadline
        ).build_transaction({
            "from": relayer_account.address,
            "nonce": call_with_retry(lambda: web3.eth.get_transaction_count(relayer_account.address)),
        }))

        # Sign Transaction
        signed_tx = web3.eth.account.sign_transaction(tx_base, relayer_pk)
        
        # Send Transaction
        print("[*] Broadcasting transaction...")
        tx_hash = call_with_retry(lambda: web3.eth.send_raw_transaction(signed_tx.raw_transaction))
        
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

# =========================================================================
# GLOBAL AGENT INITIALIZATION
# =========================================================================

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

def process_intent(user_prompt: str):
    """
    Main entry point for external callers (e.g. Telegram Bot).
    Returns the result of the agent execution (Success/Fail + TxHash).
    """
    return agent.run(user_prompt)

# =========================================================================
# MAIN EXECUTION (CI/CD / Manual CLI)
# =========================================================================

if __name__ == "__main__":
    print("============================================================")
    print("  Initialize OpenClaw SDK (Manual Test Mode)")
    print("============================================================")
    
    # Simulate a user intent/prompt
    user_prompt = "Tolong optimasi yield saya hari ini dengan risiko maksimal 5%."
    
    # Run the Agent autonomously
    result = process_intent(user_prompt)
    print(f"\nFinal Agent Result: {result}")
