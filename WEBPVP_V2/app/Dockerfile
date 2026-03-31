# ── Build stage ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build/app

# Instala dependencias primero (aprovecha cache de Docker)
COPY app/package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ───────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /srv

# Copia node_modules desde el build stage
COPY --from=builder /build/app/node_modules ./app/node_modules

# Copia el código de la app
COPY app/ ./app/

# Copia el frontend (HTML, logo, assets) que server.js sirve desde ".."
COPY save-pvp-prototipo.html ./
COPY login.html ./
COPY save_logo.png ./

# Puerto que expone la app
EXPOSE 3000

# Directorio de trabajo = donde está server.js
WORKDIR /srv/app

CMD ["node", "server.js"]
