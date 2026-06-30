# ============================================================
# DOCKERFILE - SPaye Backend (NestJS)
# ============================================================

# Étape 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./
COPY package-lock.json ./

# Installer les dépendances
RUN npm ci && \
    npm cache clean --force

# Copier le code source
COPY . .

# Builder l'application
RUN npm run build

# Étape 2: Production
FROM node:20-alpine

WORKDIR /app

# Installer les dépendances de production uniquement
COPY package*.json ./
COPY package-lock.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copier les fichiers buildés
COPY --from=builder /app/dist ./dist

# Copier le fichier .env.production en .env
COPY .env.production .env

# Créer le dossier uploads
RUN mkdir -p /app/uploads && \
    chown -R node:node /app

# Utilisateur non-root
USER node

# Port
EXPOSE 3000

# Démarrer l'application
CMD ["node", "dist/main"]