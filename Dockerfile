FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose port for FastAPI
EXPOSE 8000

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/tee-worker

# Default command: start both the API and the Orchestrator service
# In a real production setup, we'd use a process manager like supervisord,
# but for a hackathon demo, a simple shell script or running uvicorn in background works.
CMD uvicorn tee_api:app --host 0.0.0.0 --port 8000 & python run_service.py --interval 60
