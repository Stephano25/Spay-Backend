# ============================================================
# DOCKERFILE - SPaye Backend
# ============================================================

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install && npm cache clean --force

COPY . .

RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Créer les dossiers pour les uploads
RUN mkdir -p /app/uploads /app/uploads/profiles

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app/uploads

USER nodejs

EXPOSE 3000

CMD ["node", "dist/main"]