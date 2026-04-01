require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;

// Necesario cuando Express está detrás de un proxy inverso (Easypanel/Traefik)
app.set('trust proxy', 1);

// ── Seguridad ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Rate limiter — máx 200 req/15 min por IP
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Inténtalo en unos minutos.' },
}));

// ── Body parser ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API routes ─────────────────────────────────────────────
app.use('/api', require('./routes/index'));
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta API no encontrada' });
});

// ── Frontend estático ──────────────────────────────────────
// En producción (Docker) los estáticos están en la misma carpeta que server.js
// En desarrollo local están en la carpeta padre (..)
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..');

app.use(express.static(STATIC_DIR, {
  index: 'index.html',
}));

// Cualquier ruta no-API devuelve el frontend
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (!req.path.startsWith('/api')) {
    const filePath = path.join(STATIC_DIR, 'index.html');
    console.log(`📄  Sirviendo: ${filePath}`);
    res.sendFile(filePath, err => {
      if (err) console.error(`❌  Error sirviendo HTML: ${err.message}`);
    });
  }
});

// ── Error handler global ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌  Error no controlado:', err.message);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: isDev ? err.message : 'Error interno del servidor'
  });
});

// ── Arranque ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  SAVE PVP arrancado en http://localhost:${PORT}`);
  console.log(`📡  API disponible en  http://localhost:${PORT}/api`);
  console.log(`🌍  Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});
