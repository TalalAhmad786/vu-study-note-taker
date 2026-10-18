# Docling parser service (CPU). Models download on first use into the /models volume.
FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv

# OpenCV (used by Docling's layout and OCR models) needs these shared libraries.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
# CPU-only PyTorch first, so Docling doesn't pull the ~3 GB CUDA build.
RUN uv pip install --system --no-cache torch torchvision --index-url https://download.pytorch.org/whl/cpu \
 && uv pip install --system --no-cache -r requirements.txt

COPY server.py .
RUN useradd --create-home --uid 1001 parser && mkdir -p /models && chown parser /models
USER parser
ENV HF_HOME=/models PYTHONUNBUFFERED=1

EXPOSE 5001
# Reachable only on the compose network; Caddy never routes to it.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5001"]
