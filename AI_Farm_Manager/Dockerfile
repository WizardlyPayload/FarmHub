# AI Farm Manager — FastAPI (Docker / Coolify / Hetzner VPS, port 8000)
#
# Coolify: if the UI still shows "running (unknown)", open the service → Healthcheck →
# enable HTTP check, path `/health`, port 8000 (or match your published port). Docker's
# HEALTHCHECK below also reports healthy so orchestration can show status without extra UI steps.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Runtime state: bot_servers.json, logs; compose mounts ./data:/app/data
RUN mkdir -p /app/data && chmod 775 /app/data

EXPOSE 8000

# Lets Docker (and Coolify when wired to Docker health) show healthy vs unknown.
HEALTHCHECK --interval=30s --timeout=5s --start-period=50s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT','8000'), timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
