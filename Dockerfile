# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Installer les dépendances
RUN npm install

COPY . .

# Construire l'application avec le bon entry point
RUN npm run build

# ============================================================
# Étape de production
# ============================================================
FROM node:20-alpine

WORKDIR /app

# Copier les fichiers de build et les dépendances
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Ajouter les fichiers nécessaires
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig*.json ./

EXPOSE 3000

# Démarrer l'application
CMD ["node", "dist/main"]