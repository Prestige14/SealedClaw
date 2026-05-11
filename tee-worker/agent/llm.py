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

def analyze_market_context(
    current_price: float,
    previous_memory: dict[str, Any] | None,
    user_intent: str = "",
) -> dict[str, Any]:
    """
    Perform a deep analysis of the market state, price trend, and user intent.
    Returns a JSON-compatible dict with trend analysis, sentiment, and confidence.
    """
    api_key = os.getenv("GROQ_API_KEY")
    last_price = float(previous_memory.get("last_price", 0)) if previous_memory else current_price
    price_change = ((current_price - last_price) / last_price * 100) if last_price > 0 else 0

    default_result = {
        "trend": "NEUTRAL" if abs(price_change) < 0.5 else ("BULLISH" if price_change > 0 else "BEARISH"),
        "sentiment_score": 0.0,
        "confidence": 50,
        "size_multiplier": 1.0,
        "reasoning": "Baseline technical analysis."
    }

    if not api_key:
        return default_result

    client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    
    prompt = (
        "You are an expert Crypto Quant Analyst inside a TEE enclave. "
        "Analyze the following data and return ONLY a JSON object.\n\n"
        f"DATA:\n"
        f"- Current Price: ${current_price:.2f}\n"
        f"- Last Price: ${last_price:.2f}\n"
        f"- 1-Cycle Change: {price_change:+.2f}%\n"
        f"- User Intent: '{user_intent}'\n\n"
        "EXPECTED JSON FORMAT:\n"
        "{\n"
        '  "trend": "BULLISH" | "BEARISH" | "NEUTRAL",\n'
        '  "sentiment_score": float (-1.0 to 1.0),\n'
        '  "confidence": int (0 to 100),\n'
        '  "size_multiplier": float (0.5 to 2.0),\n'
        '  "reasoning": "short explanation"\n'
        "}"
    )

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        import json
        return json.loads(response.choices[0].message.content.strip())
    except Exception as e:
        print(f"[AI] Analysis Error: {e}")
        return default_result

def generate_ai_rationale(
    technical_decision: str,
    price: float,
    price_change_pct: float | None,
    strategy_name: str,
    user_intent: str = "",
    market_analysis: dict[str, Any] | None = None,
) -> str:
    """
    Generate a professional, contextual rationale using Groq API (Llama 3).
    Now incorporates the deep market analysis results.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return f"[MOCK AI] ({strategy_name}) Mengikuti instruksi Anda '{user_intent}'. Mengeksekusi {technical_decision} di harga ${price:.2f}."

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )
    
    analysis_context = ""
    if market_analysis:
        analysis_context = (
            f"Market Analysis: Trend is {market_analysis.get('trend')}, "
            f"Confidence: {market_analysis.get('confidence')}%, "
            f"AI Reasoning: {market_analysis.get('reasoning')}"
        )

    system_prompt = (
        "You are the voice of a sovereign AI trading agent inside a TEE enclave. "
        "Your goal is to explain your trading decision professionally and contextually. "
        "Explain WHY you made this choice based on technicals and AI analysis. "
        "Keep it concise (2-3 sentences). If the instruction is in Indonesian, respond in Indonesian."
    )
    
    change_str = f"{price_change_pct:+.2f}%" if price_change_pct is not None else "N/A"
    user_context = (
        f"Strategy Class: {strategy_name}\n"
        f"Assets: ETH/USD\n"
        f"Current Price: ${price:.2f}\n"
        f"Price Change: {change_str}\n"
        f"Technical Decision: {technical_decision}\n"
        f"{analysis_context}\n"
        f"User Instruction: '{user_intent}'\n\n"
        "Generate a rationale for this decision."
    )

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_context}
            ],
            max_tokens=150,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
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
            model="llama-3.3-70b-versatile",
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
