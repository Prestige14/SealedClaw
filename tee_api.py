import os
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="SealedClaw TEE Agent API")

# Enable CORS for the React Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STATE_FILE = "agent_state.json"

class AgentState(BaseModel):
    status: str  # IDLE, THINKING, EXECUTING, SUCCESS, ERROR
    last_action: Optional[str] = None
    last_thought: Optional[str] = None
    confidence: Optional[int] = None
    current_price: Optional[float] = None
    last_update: Optional[str] = None

def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    return {"status": "IDLE", "last_thought": "Agent is waiting for instructions."}

@app.get("/status")
async def get_status():
    """Returns the current real-time status of the TEE agent."""
    return load_state()

@app.get("/health")
async def health():
    return {"status": "ok", "service": "sealedclaw-tee-api"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
