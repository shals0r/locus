# Stage 1: Development (hot-reload)
FROM node:22-slim AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 2: Build
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 3: Production (nginx)
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
