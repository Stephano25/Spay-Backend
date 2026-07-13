# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de package
COPY package*.json ./
COPY tsconfig*.json ./

# Installer les dépendances
RUN npm ci --only=production && \
    npm cache clean --force

# Copier le reste du code source
COPY . .

# Construire l'application
RUN npm run build

# ============================================================
# Étape de production
# ============================================================
FROM node:20-alpine

WORKDIR /app

# Créer le dossier uploads
RUN mkdir -p /app/uploads/profiles /app/uploads/temp

# Copier les fichiers de build et les dépendances
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src/i18n ./dist/i18n

# Variables d'environnement par défaut
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=512"

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Changer les permissions
RUN chown -R nodejs:nodejs /app/uploads /app/dist

# Passer à l'utilisateur non-root
USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Démarrer l'application
CMD ["node", "dist/main"]