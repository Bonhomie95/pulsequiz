# ── Build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies from the tree we're about to copy.
RUN npm prune --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Run unprivileged.
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./package.json
# Question seed data is read at runtime by `npm run seed`.
COPY --chown=app:app src/seed ./dist/seed

USER app
EXPOSE 8000

# The app answers /health with 503 while Mongo is unreachable, so the
# orchestrator takes the instance out of rotation instead of serving errors.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# SIGTERM is handled: the server drains connections before exiting.
STOPSIGNAL SIGTERM

CMD ["node", "dist/server.js"]
