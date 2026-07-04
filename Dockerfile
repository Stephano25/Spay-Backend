# ============================================================
# DOCKERFILE - SPaye Backend
# ============================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm install && npm cache clean --force

# Copier le code source
COPY . .

# Construire l'application
RUN npm run build

# ============================================================
# Stage de production
# ============================================================
FROM node:20-alpine

WORKDIR /app

# Copier package.json
COPY package*.json ./

# Installer seulement les dépendances de production
RUN npm install --omit=dev && npm cache clean --force

# Copier les fichiers buildés
COPY --from=builder /app/dist ./dist

# Copier les scripts d'initialisation
COPY scripts ./scripts

# Créer les dossiers pour les uploads
RUN mkdir -p /app/uploads /app/uploads/profiles

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app/uploads

# ⚠️ SUPPRIMER LE POSTINSTALL - L'initialisation se fera au démarrage
# RUN node scripts/init-users.js

USER nodejs

EXPOSE 3000

# Démarrer avec initialisation
CMD ["sh", "-c", "node scripts/init-users.js && node dist/main"]