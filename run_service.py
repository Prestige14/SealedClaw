import os
import time
import subprocess
import argparse
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_orchestrator(intent):
    """Executes the orchestrator.py script with a specific intent."""
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] --- STARTING TRADE CYCLE ---")
    print(f"[Service] Intent: {intent}")
    
    try:
        # Run orchestrator as a subprocess
        cmd = ["python", "orchestrator.py"]
        # If intent is provided, we can pass it via env or command line if orchestrator supported it.
        # Since current orchestrator.py has a hardcoded prompt in __main__, 
        # we will assume the service handles the loop and the orchestrator handles the execution.
        
        # We set an env var to signal the orchestrator to run with the service intent
        env = os.environ.copy()
        env["SERVICE_INTENT"] = intent
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            env=env
        )
        
        print(result.stdout)
        if result.stderr:
            print(f"[Service] Errors/Warnings:\n{result.stderr}")
            
        if result.returncode == 0:
            print(f"[Service] Cycle completed successfully.")
        else:
            print(f"[Service] Cycle failed with return code {result.returncode}.")
            
    except Exception as e:
        print(f"[Service] FATAL ERROR during execution: {e}")

def main():
    parser = argparse.ArgumentParser(description="SealedClaw Autonomous Service Wrapper")
    parser.add_argument("--interval", type=int, default=300, help="Interval in seconds between cycles (default: 300s / 5m)")
    parser.add_argument("--intent", type=str, default="Optimize yield with default risk parameters.", help="The default intent for the autonomous agent")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    
    args = parser.parse_args()
    
    print("============================================================")
    print("  SealedClaw Autonomous Hosting Service")
    print(f"  Interval: {args.interval}s")
    print(f"  Intent  : {args.intent}")
    print("============================================================")
    
    if args.once:
        run_orchestrator(args.intent)
        return

    try:
        while True:
            run_orchestrator(args.intent)
            print(f"\n[Service] Sleeping for {args.interval} seconds...")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n[Service] Stopping service (KeyboardInterrupt)...")
    except Exception as e:
        print(f"\n[Service] Service crashed: {e}")

if __name__ == "__main__":
    main()
