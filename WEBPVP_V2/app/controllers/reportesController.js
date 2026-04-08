const db = require('../config/db');

let _schemaReady = false;
async function ensureReportesSchema() {
  if (_schemaReady) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reportes_referencias (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      referencia VARCHAR(120) NOT NULL,
      catalogo VARCHAR(30) NOT NULL,
      categoria VARCHAR(120) NULL,
      marca VARCHAR(120) NULL,
      modelo VARCHAR(160) NULL,
      etiqueta VARCHAR(255) NULL,
      motivo TEXT NOT NULL,
      estado ENUM('pendiente', 'resuelto') NOT NULL DEFAULT 'pendiente',
      comentario_admin TEXT NULL,
      usuario_id INT NOT NULL,
      admin_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_estado_created (estado, created_at),
      INDEX idx_usuario_created (usuario_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  _schemaReady = true;
}

/** GET /api/reportes-referencias */
async function listar(req, res) {
  try {
    await ensureReportesSchema();
    const { estado } = req.query;
    const where = [];
    const params = [];

    if (req.user.rol !== 'admin') {
      where.push('r.usuario_id = ?');
      params.push(req.user.id);
    }
    if (estado) {
      where.push('r.estado = ?');
      params.push(estado);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await db.execute(
      `SELECT r.id, r.referencia, r.catalogo, r.categoria, r.marca, r.modelo, r.etiqueta,
              r.motivo, r.estado, r.comentario_admin, r.created_at, r.updated_at,
              u.nombre AS solicitante
       FROM reportes_referencias r
       LEFT JOIN usuarios u ON u.id_usuario = r.usuario_id
       ${whereSQL}
       ORDER BY r.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar reportes' });
  }
}

/** POST /api/reportes-referencias */
async function crear(req, res) {
  try {
    await ensureReportesSchema();
    const { referencia, catalogo, categoria, marca, modelo, etiqueta, motivo } = req.body;
    if (!referencia || !catalogo || !motivo || !String(motivo).trim()) {
      return res.status(400).json({ error: 'referencia, catalogo y motivo son obligatorios' });
    }
    const catalogosValidos = ['repuestos', 'telefonos', 'apple', 'oppo'];
    if (!catalogosValidos.includes(String(catalogo))) {
      return res.status(400).json({ error: 'Catálogo inválido' });
    }

    const [result] = await db.execute(
      `INSERT INTO reportes_referencias
       (referencia, catalogo, categoria, marca, modelo, etiqueta, motivo, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(referencia).trim(),
        String(catalogo).trim(),
        categoria || null,
        marca || null,
        modelo || null,
        etiqueta || null,
        String(motivo).trim(),
        req.user.id
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Reporte enviado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear reporte' });
  }
}

/** PUT /api/reportes-referencias/:id/resolver  — admin */
async function resolver(req, res) {
  try {
    await ensureReportesSchema();
    const { comentario_admin } = req.body;
    const [result] = await db.execute(
      `UPDATE reportes_referencias
       SET estado = 'resuelto',
           comentario_admin = ?,
           admin_id = ?
       WHERE id = ? AND estado = 'pendiente'`,
      [comentario_admin || null, req.user.id, req.params.id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Reporte no encontrado o ya resuelto' });
    }
    res.json({ message: 'Reporte marcado como resuelto' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al resolver reporte' });
  }
}

module.exports = { listar, crear, resolver };

