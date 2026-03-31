const db = require('../config/db');

/**
 * Tabla: `solicitudes_pvp` (creada con migrate.sql)
 * Usa `categoria` como texto libre (igual que en repuestos)
 * Roles: admin ve todas; carrefour/eci solo las suyas
 */

/** GET /api/solicitudes */
async function listar(req, res) {
  try {
    const { estado } = req.query;
    let where = [];
    const params = [];

    if (req.user.rol !== 'admin') {
      where.push('s.usuario_id = ?');
      params.push(req.user.id);
    }
    if (estado) {
      where.push('s.estado = ?');
      params.push(estado);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await db.execute(
      `SELECT s.id, s.referencia, s.descripcion, s.categoria,
              s.coste, s.proveedor, s.observaciones,
              u.nombre AS solicitante, u.rol AS rol_solicitante_num,
              s.estado, s.pvp_asignado, s.pvp_club_asignado,
              s.motivo_rechazo, s.created_at, s.updated_at
       FROM solicitudes_pvp s
       LEFT JOIN usuarios u ON s.usuario_id = u.id_usuario
       ${whereSQL}
       ORDER BY s.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
}

/** POST /api/solicitudes */
async function crear(req, res) {
  const { referencia, descripcion, categoria, coste, proveedor, observaciones } = req.body;

  if (!referencia || !coste) {
    return res.status(400).json({ error: 'Referencia y coste son obligatorios' });
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO solicitudes_pvp
         (referencia, descripcion, categoria, coste, proveedor, observaciones, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [referencia, descripcion || null, categoria || null,
       coste, proveedor || null, observaciones || null, req.user.id]
    );
    res.status(201).json({ id: result.insertId, message: 'Solicitud enviada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear solicitud' });
  }
}

/** PUT /api/solicitudes/:id/aprobar  — solo admin */
async function aprobar(req, res) {
  const { referencia, descripcion, categoria, coste, pvp_asignado, pvp_club_asignado } = req.body;

  if (!pvp_asignado) {
    return res.status(400).json({ error: 'El PVP a asignar es obligatorio' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // 1. Actualizar la solicitud
    const [upd] = await conn.execute(
      `UPDATE solicitudes_pvp
       SET estado           = 'aprobado',
           referencia       = COALESCE(?, referencia),
           descripcion      = COALESCE(?, descripcion),
           categoria        = COALESCE(?, categoria),
           coste            = COALESCE(?, coste),
           pvp_asignado     = ?,
           pvp_club_asignado= ?,
           admin_id         = ?
       WHERE id = ? AND estado = 'pendiente'`,
      [referencia || null, descripcion || null, categoria || null, coste || null,
       pvp_asignado, pvp_club_asignado || null, req.user.id, req.params.id]
    );

    if (upd.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }

    // 2. Obtener los datos definitivos de la solicitud
    const [rows] = await conn.execute('SELECT * FROM solicitudes_pvp WHERE id = ?', [req.params.id]);
    const s = rows[0];

    // 3. Insertar o actualizar en la tabla repuestos real
    await conn.execute(
      `INSERT INTO repuestos
         (referencia, marca, categoria, modelo, etiqueta, sage_new, pvp, pvp_clubsave)
       VALUES (?, '', ?, '', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         categoria    = VALUES(categoria),
         etiqueta     = VALUES(etiqueta),
         sage_new     = VALUES(sage_new),
         pvp          = VALUES(pvp),
         pvp_clubsave = VALUES(pvp_clubsave)`,
      [s.referencia, s.categoria || '', s.descripcion || s.referencia,
       s.coste, pvp_asignado, pvp_club_asignado || null]
    );

    await conn.commit();
    res.json({ message: 'Solicitud aprobada y repuesto añadido a la BBDD' });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Error al aprobar solicitud' });
  } finally {
    if (conn) conn.release();
  }
}

/** PUT /api/solicitudes/:id/rechazar  — solo admin */
async function rechazar(req, res) {
  const { motivo_rechazo } = req.body;

  if (!motivo_rechazo || !motivo_rechazo.trim()) {
    return res.status(400).json({ error: 'El motivo del rechazo es obligatorio' });
  }

  try {
    const [result] = await db.execute(
      `UPDATE solicitudes_pvp
       SET estado = 'rechazado', motivo_rechazo = ?, admin_id = ?
       WHERE id = ? AND estado = 'pendiente'`,
      [motivo_rechazo.trim(), req.user.id, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }

    res.json({ message: 'Solicitud rechazada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al rechazar solicitud' });
  }
}

module.exports = { listar, crear, aprobar, rechazar };
