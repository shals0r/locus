# Stage 1: Build frontend assets
FROM node:22-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build agent .pyz for Linux targets
FROM python:3.12-slim AS agent-build
WORKDIR /agent
RUN pip install --no-cache-dir shiv
COPY agent/ .
RUN mkdir -p dist && shiv \
    --python '/usr/bin/env python3' \
    -e 'locus_agent.__main__:main' \
    -o dist/locus-agent-linux-x64.pyz \
    --compressed \
    -r requirements.txt \
    .

# Stage 3: Python base
FROM python:3.12-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir requests beautifulsoup4 lxml feedparser google-api-python-client python-dateutil
RUN mkdir -p /data/workers/_builtin /data/workers/user /app/agents /app/agent-src

# Stage 4: Development (hot-reload)
FROM base AS development
COPY backend/ .
COPY --from=agent-build /agent/dist/*.pyz /app/agents/
COPY agent/ /app/agent-src/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Stage 5: Production
FROM base AS production
COPY backend/ .
COPY --from=frontend-build /frontend/dist /app/static
COPY --from=agent-build /agent/dist/*.pyz /app/agents/
COPY agent/ /app/agent-src/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
