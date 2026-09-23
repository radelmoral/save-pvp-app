const db = require('../config/db');

// Reportes de precio: cuando un técnico consulta un PVP en la calculadora (o le
// sale el PVP de catálogo de una referencia) y le parece demasiado bajo, demasiado
// alto o sin sentido, lo reporta. Llega a la cola del admin para revisarlo.
// No bloquea nada: el técnico sigue pudiendo dar el precio.

const MOTIVOS = ['muy_bajo', 'muy_alto', 'sin_sentido'];
const ORIGENES = ['calculado', 'catalogo'];

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reportes_precio (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      origen ENUM('calculado','catalogo') NOT NULL DEFAULT 'calculado',
      catalogo VARCHAR(60) NULL,
      referencia VARCHAR(120) NULL,
      marca VARCHAR(120) NULL,
      modelo VARCHAR(160) NULL,
      categoria VARCHAR(160) NULL,
      proveedor VARCHAR(80) NULL,
      coste DECIMAL(10,2) NULL,
      pvp DECIMAL(10,2) NULL,
      motivo ENUM('muy_bajo','muy_alto','sin_sentido') NOT NULL,
      precio_esperado DECIMAL(10,2) NULL,
      comentario TEXT NULL,
      estado ENUM('pendiente','revisado','descartado') NOT NULL DEFAULT 'pendiente',
      respuesta_admin TEXT NULL,
      usuario_id INT NULL,
      admin_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_estado_created (estado, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  _schemaReady = true;
}

function txt(v, max) {
  const s = (v == null ? '' : String(v)).trim().slice(0, max);
  return s || null;
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
}

/** GET /api/reportes-precio?estado=pendiente|revisado|descartado|todos  (admin) */
async function listar(req, res) {
  try {
    await ensureSchema();
    const estado = req.query.estado || 'pendiente';
    const where = estado === 'todos' ? '' : 'WHERE r.estado = ?';
    const params = estado === 'todos' ? [] : [estado];
    const [rows] = await db.execute(
      `SELECT r.*, u.nombre AS usuario, a.nombre AS admin
         FROM reportes_precio r
         LEFT JOIN usuarios u ON u.id_usuario = r.usuario_id
         LEFT JOIN usuarios a ON a.id_usuario = r.admin_id
         ${where}
        ORDER BY r.created_at DESC
        LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error listando reportes de precio' });
  }
}

/** GET /api/reportes-precio/conteo  (admin) — para el badge del menú */
async function conteo(req, res) {
  try {
    await ensureSchema();
    const [[row]] = await db.execute(
      `SELECT COUNT(*) AS n FROM reportes_precio WHERE estado = 'pendiente'`
    );
    res.json({ pendientes: row.n });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error contando' });
  }
}

/** POST /api/reportes-precio  (cualquier usuario autenticado)
 *  body: { origen, catalogo, referencia, marca, modelo, categoria, proveedor,
 *          coste, pvp, motivo, precioEsperado, comentario } */
async function crear(req, res) {
  try {
    await ensureSchema();
    const b = req.body || {};
    const motivo = String(b.motivo || '');
    if (!MOTIVOS.includes(motivo)) return res.status(400).json({ error: 'Indica el motivo del reporte' });
    const origen = ORIGENES.includes(b.origen) ? b.origen : 'calculado';

    const data = {
      origen,
      catalogo:   txt(b.catalogo, 60),
      referencia: txt(b.referencia, 120),
      marca:      txt(b.marca, 120),
      modelo:     txt(b.modelo, 160),
      categoria:  txt(b.categoria, 160),
      proveedor:  txt(b.proveedor, 80),
      coste:      num(b.coste),
      pvp:        num(b.pvp),
      motivo,
      precio_esperado: num(b.precioEsperado),
      comentario: txt(b.comentario, 1000),
    };
    if (data.pvp === null) return res.status(400).json({ error: 'Falta el precio reportado' });
    if (motivo === 'sin_sentido' && !data.comentario) {
      return res.status(400).json({ error: 'Explica brevemente qué no tiene sentido' });
    }

    // Evitar duplicados: el mismo usuario reportando el mismo precio de la misma
    // referencia mientras sigue pendiente.
    const [dup] = await db.execute(
      `SELECT id FROM reportes_precio
        WHERE estado = 'pendiente' AND usuario_id = ?
          AND referencia <=> ? AND categoria <=> ? AND pvp <=> ?
        LIMIT 1`,
      [req.user.id, data.referencia, data.categoria, data.pvp]
    );
    if (dup.length) return res.status(200).json({ ok: true, id: dup[0].id, repetido: true });

    const [result] = await db.execute(
      `INSERT INTO reportes_precio
         (origen, catalogo, referencia, marca, modelo, categoria, proveedor, coste, pvp,
          motivo, precio_esperado, comentario, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.origen, data.catalogo, data.referencia, data.marca, data.modelo, data.categoria,
       data.proveedor, data.coste, data.pvp, data.motivo, data.precio_esperado,
       data.comentario, req.user.id]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error registrando el reporte' });
  }
}

async function cerrar(req, res, estado) {
  try {
    await ensureSchema();
    const respuesta = txt((req.body || {}).respuesta, 1000);
    const [r] = await db.execute(
      `UPDATE reportes_precio
          SET estado = ?, respuesta_admin = ?, admin_id = ?
        WHERE id = ? AND estado = 'pendiente'`,
      [estado, respuesta, req.user.id, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado o ya resuelto' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error actualizando el reporte' });
  }
}

/** PUT /api/reportes-precio/:id/revisar   (admin) body: { respuesta } */
const revisar = (req, res) => cerrar(req, res, 'revisado');
/** PUT /api/reportes-precio/:id/descartar (admin) body: { respuesta } */
const descartar = (req, res) => cerrar(req, res, 'descartado');

module.exports = { listar, conteo, crear, revisar, descartar, MOTIVOS };
