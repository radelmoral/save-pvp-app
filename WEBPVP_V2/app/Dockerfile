# ── Build stage ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

COPY webpvp_v2/app/package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ───────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /srv/app

# Copia node_modules desde el build stage
COPY --from=builder /build/node_modules ./node_modules

# Copia el código de la app
COPY webpvp_v2/app/ .

# Copia el frontend estático (HTML, logo) a la carpeta padre (../)
COPY webpvp_v2/save-pvp-prototipo.html /srv/
COPY webpvp_v2/login.html /srv/
COPY webpvp_v2/save_logo.png /srv/

EXPOSE 3000

CMD ["node", "server.js"]
