# -----------------------------------------------------------------------------
# NaijaInvest backend — production Docker image for Fly.io / any Docker host.
# -----------------------------------------------------------------------------
# This Dockerfile lives at the repo ROOT because that's where Fly.io looks by
# default (`fly deploy` run from repo root). The build context is the whole
# repo but we only copy the `backend/` directory into the image.
#
# Build:  docker build -t naijainvest-api .
# Deploy: fly deploy       (from repo root, uses this Dockerfile via fly.toml)
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS base

# Prevents Python from writing .pyc files & buffers stdout/stderr in real time —
# both important for clean logs on Fly.io.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps: gcc for wheels that need compiling (bcrypt, motor, etc.), curl
# for the healthcheck, tini for proper PID-1 signal handling in containers.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first so this layer caches unless requirements.txt changes.
COPY backend/requirements.txt .

# Install Python deps. emergentintegrations lives on a private CloudFront
# index so we add it as an extra-index-url; the main dependencies still come
# from PyPI. Gunicorn + uvicorn workers are the production combo we use.
RUN pip install --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ \
        -r requirements.txt \
    && pip install gunicorn "uvicorn[standard]"

# Copy the backend source (server.py, gateway SDKs, routers, etc). .env is NOT
# copied — secrets come from `fly secrets set` in production.
COPY backend/ .

# Fly.io routes external traffic to whatever we listen on. We standardise on
# 8001 (same as local supervisord) so nothing else needs to change.
ENV PORT=8001
EXPOSE 8001

# Container healthcheck — /api/health returns 200 as long as FastAPI is up.
# Fly.io will restart the machine if this fails 3 times in a row.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1

# tini as PID 1 gives us graceful SIGTERM handling so in-flight requests
# aren't killed mid-deploy.
ENTRYPOINT ["/usr/bin/tini", "--"]

# 4 workers × 2 vCPU is the sweet spot for a FastAPI app on Fly's shared-2x
# machine. Adjust with `--workers` if you scale the VM up/down. --timeout 60
# gives payment-gateway calls (which can be slow) enough runway before the
# worker gets recycled.
CMD ["gunicorn", "server:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8001", \
     "--timeout", "60", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
