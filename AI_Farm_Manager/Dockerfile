# AI Farm Manager — FastAPI (Koyeb, Fly.io, Railway, or any Docker host)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Layer cache: deps change less often than app code
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application (Python package `app` lives under backend/)
COPY backend/ .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
