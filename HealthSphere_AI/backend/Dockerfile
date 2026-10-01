# HealthSphere AI backend — API-only container (nginx serves the frontend)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=off

# Install prod deps only (pg). No lockfile churn: fall back to npm install.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
