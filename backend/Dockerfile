# Stage 1: Build frontend assets
FROM node:22-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python base
FROM python:3.12-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3: Development (hot-reload)
FROM base AS development
COPY backend/ .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Stage 4: Production
FROM base AS production
COPY backend/ .
COPY --from=frontend-build /frontend/dist /app/static
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
