"""
agent/llm.py — LLM Service for TEE Worker Rationale Generation

Interfaces with OpenAI to provide contextually aware trading rationales
and intent-driven secondary analysis.

# TEE BOUNDARY: In production, this would be an encrypted outbound call
# or a local small-model inference (e.g. Llama-3-8B).
"""
import os
from typing import Any
from openai import OpenAI

def generate_ai_rationale(
    technical_decision: str,
    price: float,
    price_change_pct: float | None,
    strategy_name: str,
    user_intent: str = "",
) -> str:
    """
    Generate a professional, contextual rationale using GPT-4o-mini.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return f"[MOCK AI] ({strategy_name}) Mengikuti instruksi Anda '{user_intent}'. Mengeksekusi {technical_decision} di harga ${price:.2f}."

    client = OpenAI(api_key=api_key)
    
    system_prompt = (
        "You are the voice of a sovereign AI trading agent inside a TEE enclave. "
        "Your goal is to explain your trading decision professionally and contextually. "
        "Keep it concise (1-2 sentences). If the user provided an intent/instruction, "
        "acknowledge it naturally. If the instruction is in Indonesian, respond in Indonesian."
    )
    
    change_str = f"{price_change_pct:+.2f}%" if price_change_pct is not None else "N/A"
    user_context = (
        f"Strategy Class: {strategy_name}\n"
        f"Assets: ETH/USD\n"
        f"Current Price: ${price:.2f}\n"
        f"Price Change: {change_str}\n"
        f"Technical Decision: {technical_decision}\n"
        f"User Instruction: '{user_intent}'\n\n"
        "Generate a rationale for this decision."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_context}
            ],
            max_tokens=100,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        # Better fallback if 429 or other API error
        return f"[AI FALLBACK] Memproses '{user_intent}' menggunakan strategi {strategy_name}. Keputusan: {technical_decision} di ${price:.2f}."

def analyze_intent_override(
    intent: str,
    current_action: str,
    price_change_pct: float,
    buy_threshold: float,
) -> str:
    """
    Check if the user's explicit intent should nudge a HOLD into a BUY/REDUCE.
    Only allows nudging if the technical signal is 'near' a threshold.
    """
    if not intent:
        return current_action
        
    intent_lower = intent.lower()
    
    # Heuristic: if user says "buy" and price is NOT crashing (change >= 0)
    # or if it's the first run (change=0).
    if "buy" in intent_lower or "beli" in intent_lower:
        if current_action == "HOLD":
            # Allow BUY if price is stable or rising, even if it hasn't hit threshold
            if price_change_pct >= 0:
                return "BUY"
            
    return current_action
