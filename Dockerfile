FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up a new user with UID 1000
RUN useradd -m -u 1000 user
RUN mkdir -p /app && chown user:user /app
WORKDIR /app

# Pre-create state file with correct permissions
RUN echo "{}" > agent_state.json && chown user:user agent_state.json

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR /app

# Copy requirements and install Python dependencies
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY --chown=user . .

# Expose port for FastAPI (Hugging Face default is 7860)
EXPOSE 7860

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/tee-worker

# Default command: start both the API and the Orchestrator service
CMD uvicorn tee_api:app --host 0.0.0.0 --port 7860 & python run_service.py --interval 60
