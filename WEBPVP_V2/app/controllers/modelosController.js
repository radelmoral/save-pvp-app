const db = require('../config/db');

// Cola de "modelos por clasificar": cuando un técnico usa la calculadora con un
// dispositivo que no está en la tabla de gamas, se registra aquí para que un
// admin le asigne gama más tarde. No bloquea el presupuesto: la reparación sale
// con gama neutra en el momento; esto es solo el aviso para clasificarlo.

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS modelos_por_clasificar (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      marca VARCHAR(120) NULL,
      modelo VARCHAR(160) NOT NULL,
      marca_nueva TINYINT(1) NOT NULL DEFAULT 0,
      referencia VARCHAR(120) NULL,
      veces INT NOT NULL DEFAULT 1,
      estado ENUM('pendiente','clasificado','descartado') NOT NULL DEFAULT 'pendiente',
      gama_asignada VARCHAR(10) NULL,
      usuario_id INT NULL,
      admin_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_estado_created (estado, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  _schemaReady = true;
}

function normaliza(s) {
  return String(s || '')
    .toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** GET /api/modelos-por-clasificar  (admin) */
async function listar(req, res) {
  try {
    await ensureSchema();
    const estado = req.query.estado || 'pendiente';
    const [rows] = await db.execute(
      `SELECT m.*, u.nombre AS usuario
         FROM modelos_por_clasificar m
         LEFT JOIN usuarios u ON u.id_usuario = m.usuario_id
        WHERE m.estado = ?
        ORDER BY m.veces DESC, m.created_at DESC`,
      [estado]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error listando modelos por clasificar' });
  }
}

/** GET /api/modelos-por-clasificar/conteo  (admin) — para el badge del menú */
async function conteo(req, res) {
  try {
    await ensureSchema();
    const [[row]] = await db.execute(
      `SELECT COUNT(*) AS n FROM modelos_por_clasificar WHERE estado = 'pendiente'`
    );
    res.json({ pendientes: row.n });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error contando' });
  }
}

/** POST /api/modelos-por-clasificar  (cualquier usuario autenticado)
 *  body: { marca, modelo, marcaNueva, referencia } */
async function crear(req, res) {
  try {
    await ensureSchema();
    const marca      = (req.body.marca      || '').toString().trim().slice(0, 120) || null;
    const modelo     = (req.body.modelo     || '').toString().trim().slice(0, 160);
    const marcaNueva = req.body.marcaNueva ? 1 : 0;
    const referencia = (req.body.referencia || '').toString().trim().slice(0, 120) || null;

    if (!modelo) return res.status(400).json({ error: 'El modelo es obligatorio' });

    // Si ese mismo modelo (misma marca, mismo nombre normalizado) ya está pendiente,
    // se cuenta una vez más en vez de duplicar la fila.
    const [existentes] = await db.execute(
      `SELECT id, marca, modelo FROM modelos_por_clasificar WHERE estado = 'pendiente'`
    );
    const mn = normaliza(modelo), man = normaliza(marca);
    const yaExiste = existentes.find(r => normaliza(r.modelo) === mn && normaliza(r.marca) === man);

    if (yaExiste) {
      await db.execute(
        `UPDATE modelos_por_clasificar SET veces = veces + 1 WHERE id = ?`,
        [yaExiste.id]
      );
      return res.status(200).json({ ok: true, id: yaExiste.id, repetido: true });
    }

    const [result] = await db.execute(
      `INSERT INTO modelos_por_clasificar (marca, modelo, marca_nueva, referencia, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [marca, modelo, marcaNueva, referencia, req.user.id]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error registrando el modelo' });
  }
}

/** PUT /api/modelos-por-clasificar/:id/clasificar  (admin)
 *  body: { gama }  — solo marca la cola como resuelta; la tabla de gamas real
 *  se actualiza aparte, al guardar la configuración de la calculadora. */
async function clasificar(req, res) {
  try {
    await ensureSchema();
    const gama = (req.body.gama || '').toString().trim().slice(0, 10);
    if (!gama) return res.status(400).json({ error: 'La gama es obligatoria' });
    const [r] = await db.execute(
      `UPDATE modelos_por_clasificar
          SET estado = 'clasificado', gama_asignada = ?, admin_id = ?
        WHERE id = ? AND estado = 'pendiente'`,
      [gama, req.user.id, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado o ya resuelto' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error clasificando' });
  }
}

/** PUT /api/modelos-por-clasificar/:id/descartar  (admin) */
async function descartar(req, res) {
  try {
    await ensureSchema();
    const [r] = await db.execute(
      `UPDATE modelos_por_clasificar
          SET estado = 'descartado', admin_id = ?
        WHERE id = ? AND estado = 'pendiente'`,
      [req.user.id, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado o ya resuelto' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error descartando' });
  }
}

module.exports = { listar, conteo, crear, clasificar, descartar };
