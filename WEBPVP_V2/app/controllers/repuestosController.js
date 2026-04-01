const db = require('../config/db');

function addTokenizedSearch(where, params, q, columns) {
  const raw = String(q || '').trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (!tokens.length) return;
  const normalizedExpr = (c) => `REPLACE(REPLACE(LOWER(${c}), ' ', ''), '-', '')`;

  // Requiere que TODOS los términos estén presentes (AND),
  // pero cada término puede estar en cualquier columna (OR).
  tokens.forEach((tk) => {
    const tkNorm = tk.toLowerCase().replace(/[\s-]+/g, '');
    const perToken = columns
      .map((c) => `(${c} LIKE ? OR ${normalizedExpr(c)} LIKE ?)`)
      .join(' OR ');
    where.push(`(${perToken})`);
    columns.forEach(() => {
      params.push(`%${tk}%`);
      params.push(`%${tkNorm}%`);
    });
  });
}

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
    addTokenizedSearch(where, params, q, ['referencia', 'etiqueta', 'marca', 'modelo', 'categoria']);

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
  const { referencia, marca, categoria, modelo, etiqueta, sage_act, sage_new, pvp, pvp_clubsave } = req.body;
  try {
    const [result] = await db.execute(
      `UPDATE repuestos
       SET referencia=COALESCE(NULLIF(?, ''), referencia),
           marca=?, categoria=?, modelo=?, etiqueta=?,
           sage_act=?, sage_new=?, pvp=?, pvp_clubsave=?
       WHERE referencia=?`,
      [referencia || null, marca, categoria, modelo, etiqueta,
       sage_act || null, sage_new || null, pvp || null, pvp_clubsave || null,
       req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Repuesto no encontrado' });
    res.json({ message: 'Repuesto actualizado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'La referencia nueva ya existe' });
    res.status(500).json({ error: 'Error al actualizar repuesto' });
  }
}

/** DELETE /api/repuestos/:ref  — solo admin */
async function eliminar(req, res) {
  try {
    const [result] = await db.execute('DELETE FROM repuestos WHERE referencia = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Repuesto no encontrado' });
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
    addTokenizedSearch(where, params, q, ['referencia', 'etiqueta', 'modelo', 'categoria', 'marca']);
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

/** PUT /api/apple/:ref  — solo admin */
async function actualizarApple(req, res) {
  const { referencia, marca, categoria, modelo, etiqueta, pvp } = req.body;
  try {
    const [result] = await db.execute(
      `UPDATE apple_original
       SET referencia=COALESCE(NULLIF(?, ''), referencia),
           marca=?, categoria=?, modelo=?, etiqueta=?, pvp=?
       WHERE referencia=?`,
      [referencia || null, marca || '', categoria || '', modelo || '', etiqueta || '', pvp || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    res.json({ message: 'Apple Original actualizado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'La referencia nueva ya existe' });
    res.status(500).json({ error: 'Error al actualizar Apple Original' });
  }
}

/** DELETE /api/apple/:ref  — solo admin */
async function eliminarApple(req, res) {
  try {
    const [result] = await db.execute('DELETE FROM apple_original WHERE referencia = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    res.json({ message: 'Referencia Apple eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar Apple Original' });
  }
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
    addTokenizedSearch(where, params, q, ['referencia', 'etiqueta', 'modelo', 'categoria', 'marca']);
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

/** PUT /api/oppo/:ref  — solo admin */
async function actualizarOppo(req, res) {
  const { referencia, marca, categoria, modelo, etiqueta, pvp } = req.body;
  try {
    const [result] = await db.execute(
      `UPDATE oppo_original
       SET referencia=COALESCE(NULLIF(?, ''), referencia),
           marca=?, categoria=?, modelo=?, etiqueta=?, pvp=?
       WHERE referencia=?`,
      [referencia || null, marca || '', categoria || '', modelo || '', etiqueta || '', pvp || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    res.json({ message: 'Oppo Original actualizado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'La referencia nueva ya existe' });
    res.status(500).json({ error: 'Error al actualizar Oppo Original' });
  }
}

/** DELETE /api/oppo/:ref  — solo admin */
async function eliminarOppo(req, res) {
  try {
    const [result] = await db.execute('DELETE FROM oppo_original WHERE referencia = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    res.json({ message: 'Referencia Oppo eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar Oppo Original' });
  }
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
    addTokenizedSearch(where, params, q, ['referencia', 'etiqueta', 'marca', 'modelo']);
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

/** PUT /api/telefonos/:ref  — solo admin */
async function actualizarTelefono(req, res) {
  const { referencia, marca, modelo, etiqueta, pvp } = req.body;
  try {
    const [result] = await db.execute(
      `UPDATE telefonos
       SET referencia=COALESCE(NULLIF(?, ''), referencia),
           marca=?, modelo=?, etiqueta=?, pvp=?
       WHERE referencia=?`,
      [referencia || null, marca || '', modelo || '', etiqueta || '', pvp || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    res.json({ message: 'Teléfono actualizado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'La referencia nueva ya existe' });
    res.status(500).json({ error: 'Error al actualizar teléfono' });
  }
}

/** DELETE /api/telefonos/:ref  — solo admin */
async function eliminarTelefono(req, res) {
  try {
    const [result] = await db.execute('DELETE FROM telefonos WHERE referencia = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    res.json({ message: 'Teléfono eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar teléfono' });
  }
}

/** GET /api/busqueda-global?q=... */
async function busquedaGlobal(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q es obligatorio' });

    const repWhere = []; const repParams = [];
    addTokenizedSearch(repWhere, repParams, q, ['referencia', 'etiqueta', 'marca', 'modelo', 'categoria']);
    const [repRows] = await db.execute(
      `SELECT referencia, marca, categoria, modelo, etiqueta, pvp
       FROM repuestos
       WHERE ${repWhere.join(' AND ')}
       ORDER BY referencia LIMIT 50`,
      repParams
    );

    const appleWhere = []; const appleParams = [];
    addTokenizedSearch(appleWhere, appleParams, q, ['referencia', 'etiqueta', 'marca', 'modelo', 'categoria']);
    const [appleRows] = await db.execute(
      `SELECT referencia, categoria, modelo, etiqueta, pvp
       FROM apple_original
       WHERE ${appleWhere.join(' AND ')}
       ORDER BY referencia LIMIT 50`,
      appleParams
    );

    const oppoWhere = []; const oppoParams = [];
    addTokenizedSearch(oppoWhere, oppoParams, q, ['referencia', 'etiqueta', 'marca', 'modelo', 'categoria']);
    const [oppoRows] = await db.execute(
      `SELECT referencia, categoria, modelo, etiqueta, pvp
       FROM oppo_original
       WHERE ${oppoWhere.join(' AND ')}
       ORDER BY referencia LIMIT 50`,
      oppoParams
    );

    const telWhere = []; const telParams = [];
    addTokenizedSearch(telWhere, telParams, q, ['referencia', 'etiqueta', 'marca', 'modelo']);
    const [telRows] = await db.execute(
      `SELECT referencia, marca, modelo, etiqueta, pvp
       FROM telefonos
       WHERE ${telWhere.join(' AND ')}
       ORDER BY referencia LIMIT 50`,
      telParams
    );

    res.json({
      q,
      repuestos: repRows,
      apple: appleRows,
      oppo: oppoRows,
      telefonos: telRows,
      total: repRows.length + appleRows.length + oppoRows.length + telRows.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error en búsqueda global' });
  }
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
  listarApple, actualizarApple, eliminarApple,
  listarOppo, actualizarOppo, eliminarOppo,
  listarTelefonos, actualizarTelefono, eliminarTelefono,
  busquedaGlobal,
  listarCategorias,
};
