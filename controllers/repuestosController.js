const db = require('../config/db');

/**
 * Tablas reales en la BBDD `Repuestos`:
 *   repuestos       — referencia, marca, categoria, modelo, etiqueta,
 *                     sage_act, sage_new, pvp, pvp_clubsave, stock, vendidos, diferencia
 *   apple_original  — misma estructura
 *   oppo_original   — misma estructura
 *   telefonos       — referencia, marca, modelo, etiqueta, pvp
 */

/** GET /api/repuestos  — listado con filtros */
async function listar(req, res) {
  try {
    const { ref, categoria, marca, modelo, q, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = [];
    const params = [];

    if (ref)       { where.push('referencia LIKE ?');  params.push(`%${ref}%`); }
    if (categoria) { where.push('categoria = ?');      params.push(categoria);  }
    if (marca)     { where.push('marca = ?');          params.push(marca);      }
    if (modelo)    { where.push('modelo LIKE ?');      params.push(`%${modelo}%`); }
    if (q) {
      where.push('(referencia LIKE ? OR etiqueta LIKE ? OR marca LIKE ? OR modelo LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM repuestos ${whereSQL}`, params
    );

    const [rows] = await db.execute(
      `SELECT referencia, marca, categoria, modelo, etiqueta,
              sage_act, sage_new, pvp, pvp_clubsave, stock
       FROM repuestos ${whereSQL}
       ORDER BY referencia
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({ total, page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener repuestos' });
  }
}

/** GET /api/repuestos/:ref  — busca por referencia */
async function obtener(req, res) {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM repuestos WHERE referencia = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Repuesto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

/** POST /api/repuestos  — solo admin */
async function crear(req, res) {
  const { referencia, marca, categoria, modelo, etiqueta, sage_act, sage_new, pvp, pvp_clubsave } = req.body;
  if (!referencia || !etiqueta) {
    return res.status(400).json({ error: 'Referencia y etiqueta son obligatorias' });
  }
  try {
    await db.execute(
      `INSERT INTO repuestos (referencia, marca, categoria, modelo, etiqueta, sage_act, sage_new, pvp, pvp_clubsave)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [referencia, marca || '', categoria || '', modelo || '', etiqueta,
       sage_act || null, sage_new || null, pvp || null, pvp_clubsave || null]
    );
    res.status(201).json({ referencia, message: 'Repuesto creado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esa referencia ya existe' });
    res.status(500).json({ error: 'Error al crear repuesto' });
  }
}

/** PUT /api/repuestos/:ref  — solo admin */
async function actualizar(req, res) {
  const { marca, categoria, modelo, etiqueta, sage_act, sage_new, pvp, pvp_clubsave } = req.body;
  try {
    const [result] = await db.execute(
      `UPDATE repuestos
       SET marca=?, categoria=?, modelo=?, etiqueta=?,
           sage_act=?, sage_new=?, pvp=?, pvp_clubsave=?
       WHERE referencia=?`,
      [marca, categoria, modelo, etiqueta,
       sage_act || null, sage_new || null, pvp || null, pvp_clubsave || null,
       req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Repuesto no encontrado' });
    res.json({ message: 'Repuesto actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar repuesto' });
  }
}

/** DELETE /api/repuestos/:ref  — solo admin (elimina de verdad, o puedes adaptarlo) */
async function eliminar(req, res) {
  try {
    await db.execute('DELETE FROM repuestos WHERE referencia = ?', [req.params.id]);
    res.json({ message: 'Repuesto eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar repuesto' });
  }
}

// ── Apple Original ──────────────────────────────────────────

/** GET /api/apple */
async function listarApple(req, res) {
  try {
    const { ref, categoria, modelo, q, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = []; const params = [];
    if (ref)      { where.push('referencia LIKE ?'); params.push(`%${ref}%`); }
    if (categoria){ where.push('categoria = ?');     params.push(categoria);  }
    if (modelo)   { where.push('modelo LIKE ?');     params.push(`%${modelo}%`); }
    if (q)        { where.push('(referencia LIKE ? OR etiqueta LIKE ? OR modelo LIKE ?)'); params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM apple_original ${w}`, params);
    const [rows] = await db.execute(
      `SELECT referencia, marca, categoria, modelo, etiqueta, sage_act, sage_new, pvp, stock
       FROM apple_original ${w} ORDER BY referencia LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ total, page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) { res.status(500).json({ error: 'Error al obtener Apple Original' }); }
}

// ── Oppo Original ───────────────────────────────────────────

/** GET /api/oppo */
async function listarOppo(req, res) {
  try {
    const { ref, modelo, q, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = []; const params = [];
    if (ref)   { where.push('referencia LIKE ?'); params.push(`%${ref}%`); }
    if (modelo){ where.push('modelo LIKE ?');     params.push(`%${modelo}%`); }
    if (q)     { where.push('(referencia LIKE ? OR etiqueta LIKE ? OR modelo LIKE ?)'); params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM oppo_original ${w}`, params);
    const [rows] = await db.execute(
      `SELECT referencia, marca, categoria, modelo, etiqueta, sage_act, sage_new, pvp, stock
       FROM oppo_original ${w} ORDER BY referencia LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ total, page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) { res.status(500).json({ error: 'Error al obtener Oppo Original' }); }
}

// ── Teléfonos ───────────────────────────────────────────────

/** GET /api/telefonos */
async function listarTelefonos(req, res) {
  try {
    const { ref, marca, modelo, q, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = []; const params = [];
    if (ref)   { where.push('referencia LIKE ?'); params.push(`%${ref}%`); }
    if (marca) { where.push('marca = ?');         params.push(marca); }
    if (modelo){ where.push('modelo LIKE ?');     params.push(`%${modelo}%`); }
    if (q)     { where.push('(referencia LIKE ? OR etiqueta LIKE ? OR marca LIKE ? OR modelo LIKE ?)'); params.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM telefonos ${w}`, params);
    const [rows] = await db.execute(
      `SELECT referencia, marca, modelo, etiqueta, pvp
       FROM telefonos ${w} ORDER BY marca, modelo LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ total, page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) { res.status(500).json({ error: 'Error al obtener teléfonos' }); }
}

// ── Categorías únicas de la tabla repuestos ─────────────────

/** GET /api/categorias  — extrae las categorías reales de la BBDD */
async function listarCategorias(req, res) {
  try {
    const [rows] = await db.execute(
      `SELECT DISTINCT categoria AS nombre FROM repuestos
       WHERE categoria IS NOT NULL AND categoria != ''
       ORDER BY categoria`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
}

module.exports = {
  listar, obtener, crear, actualizar, eliminar,
  listarApple, listarOppo, listarTelefonos,
  listarCategorias,
};
