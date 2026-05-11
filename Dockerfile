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

# Expose port for FastAPI (Hugging Face default is 7860)
EXPOSE 7860

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/tee-worker

# Default command: start both the API and the Orchestrator service
CMD uvicorn tee_api:app --host 0.0.0.0 --port 7860 & python run_service.py --interval 60
