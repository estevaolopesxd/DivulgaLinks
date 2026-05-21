FROM node:20-slim AS builder

# Dependências para módulos nativos (Baileys/sharp/canvas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ---- Production image ----
FROM node:20-slim AS production

# openssl: requerido pelo Prisma; wget: healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl wget libvips \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nodejs

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

RUN mkdir -p uploads logs whatsapp_sessions && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

CMD ["./docker-entrypoint.sh"]
