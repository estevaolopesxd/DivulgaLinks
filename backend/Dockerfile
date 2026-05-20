FROM node:20-alpine AS builder

# Baileys needs these for native modules (sharp, etc.)
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

COPY package*.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ---- Production image ----
FROM node:20-alpine AS production

RUN apk add --no-cache vips wget

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

RUN mkdir -p uploads logs whatsapp_sessions && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

CMD ["./docker-entrypoint.sh"]
