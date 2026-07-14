# backend/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers package
COPY package*.json ./
COPY package-lock*.json ./

# Installer les dépendances
RUN npm install --legacy-peer-deps

# ✅ Copier le code source
COPY . .

# Build l'application
RUN npm run build

# Image de production
FROM node:20-alpine

WORKDIR /app

# Copier les fichiers nécessaires
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Créer le dossier uploads
RUN mkdir -p /app/uploads/profiles /app/uploads/temp

EXPOSE 3000

CMD ["node", "dist/main"]