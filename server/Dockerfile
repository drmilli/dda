# Multi-stage build. One image, one command per service (override CMD per role:
# web / ingestion / triage / orchestrator / workers / aggregator / publisher).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY config ./config
COPY drizzle ./drizzle
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY config ./config
COPY drizzle ./drizzle
# Run as the built-in non-root node user.
USER node
EXPOSE 3000
# Liveness: the web role serves /health.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
# Default role; override in compose/k8s, e.g. `node dist/entrypoints/workers.js`.
CMD ["node", "dist/entrypoints/web.js"]
