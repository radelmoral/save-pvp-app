require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;

// ── Seguridad ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));   // CSP deshabilitado para el prototipo (re-habilitar en prod)
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

// ── Frontend estático ──────────────────────────────────────
// Sirve el HTML del prototipo y los assets desde la carpeta padre
app.use(express.static(path.join(__dirname, '..'), {
  index: 'save-pvp-prototipo.html',
}));

// Cualquier ruta no-API devuelve el frontend
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'save-pvp-prototipo.html'));
  }
});

// ── Arranque ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  SAVE PVP arrancado en http://localhost:${PORT}`);
  console.log(`📡  API disponible en  http://localhost:${PORT}/api`);
  console.log(`🌍  Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});
