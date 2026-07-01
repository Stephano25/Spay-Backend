# ============================================================
# DOCKERFILE - SPaye Backend (Version Finale)
# ============================================================

# Étape 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les dépendances
COPY package*.json ./

# ✅ Utiliser npm install au lieu de npm ci
RUN npm install && npm cache clean --force

# Copier le code source
COPY . .

# Builder l'application
RUN npm run build

# Étape 2: Production
FROM node:20-alpine

WORKDIR /app

# Installer les dépendances de production uniquement
COPY package*.json ./

# ✅ Utiliser npm install --only=production
RUN npm install --only=production && npm cache clean --force

# Copier les fichiers buildés
COPY --from=builder /app/dist ./dist

# Créer le dossier uploads
RUN mkdir -p /app/uploads

# Utilisateur non-root
USER node

# Port
EXPOSE 3000

# Démarrer l'application
CMD ["node", "dist/main"]