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
    Generate a professional, contextual rationale using Groq API (Llama 3).
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return f"[MOCK AI] ({strategy_name}) Mengikuti instruksi Anda '{user_intent}'. Mengeksekusi {technical_decision} di harga ${price:.2f}."

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )
    
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
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_context}
            ],
            max_tokens=100,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        # Better fallback if API error
        return f"[AI FALLBACK] Memproses '{user_intent}' menggunakan strategi {strategy_name}. Keputusan: {technical_decision} di ${price:.2f}."

def analyze_intent_action(intent: str) -> str:
    """
    Use free Groq AI API to classify the user's intent strongly.
    Returns: "BUY", "SELL" (for REDUCE_ONLY), or "HOLD".
    If no API key or intent is empty, returns "HOLD".
    """
    if not intent:
        return "HOLD"
        
    api_key = os.getenv("GROQ_API_KEY")
    # If no API key, use aggressive keyword fallback
    if not api_key:
        intent_lower = intent.lower()
        if "beli" in intent_lower or "buy" in intent_lower:
            return "BUY"
        elif "jual" in intent_lower or "sell" in intent_lower:
            return "REDUCE_ONLY"
        return "HOLD"

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )
    
    prompt = (
        "Tugas Anda hanya mengklasifikasikan intent trading dari teks user. "
        "Jawab HANYA dengan satu kata: 'BUY', 'SELL', atau 'HOLD'. Tanpa basa-basi.\n"
        f"Input User: '{intent}'"
    )
    
    try:
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=10,
            temperature=0.0,
        )
        ans = response.choices[0].message.content.strip().upper()
        if "BUY" in ans or "BELI" in ans:
            return "BUY"
        elif "SELL" in ans or "JUAL" in ans:
            return "REDUCE_ONLY"
        return "HOLD"
    except Exception:
        # Fallback to simple keyword check
        intent_lower = intent.lower()
        if "beli" in intent_lower or "buy" in intent_lower:
            return "BUY"
        elif "jual" in intent_lower or "sell" in intent_lower:
            return "REDUCE_ONLY"
        return "HOLD"

def analyze_intent_override(
    intent: str,
    current_action: str,
    price_change_pct: float,
    buy_threshold: float,
) -> str:
    """
    Aggressive override logic.
    Check if the user's explicit intent should nudge a HOLD into a BUY/REDUCE.
    Overrides minor market fluctuations if the user gives a firm command.
    """
    forced_action = analyze_intent_action(intent)
    
    if forced_action == "BUY" and current_action != "BUY":
        # Allow BUY even if price slightly dropped (e.g. up to -5%), to honor user command.
        if price_change_pct >= -5.0:
            return "BUY"
            
    if forced_action == "REDUCE_ONLY" and current_action != "REDUCE_ONLY":
        # Allow SELL even if price increased slightly (up to +5%)
        if price_change_pct <= 5.0:
            return "REDUCE_ONLY"
            
    return current_action
