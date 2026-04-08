const db = require('../config/db');
let _repuestosColsCache = null;

function addTokenizedSearch(where, params, q, columns) {
  const raw = String(q || '').trim();
  const baseTokens = raw.split(/\s+/).filter(Boolean);
  if (!baseTokens.length) return;
  const normalizedExpr = (c) => `REPLACE(REPLACE(LOWER(${c}), ' ', ''), '-', '')`;
  const hasDigit = (s) => /\d/.test(s);

  // Fusiona patrones tipo "iphone 7" => "iphone7"
  // para evitar falsos positivos por el término numérico suelto.
  const tokens = [];
  baseTokens.forEach((tkRaw) => {
    const tk = tkRaw.toLowerCase();
    if (!tokens.length) {
      tokens.push(tk);
      return;
    }
    const prev = tokens[tokens.length - 1];
    if (/^\d+[a-z]*$/i.test(tk) && !hasDigit(prev)) {
      tokens[tokens.length - 1] = `${prev}${tk}`;
      return;
    }
    tokens.push(tk);
  });

  // Requiere que TODOS los términos estén presentes (AND),
  // pero cada término puede estar en cualquier columna (OR).
  tokens.forEach((tk) => {
    const tkNorm = tk.replace(/[\s-]+/g, '');
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

async function getRepuestosColumns() {
  if (_repuestosColsCache) return _repuestosColsCache;
  const [rows] = await db.execute(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'repuestos'`
  );
  _repuestosColsCache = new Set(rows.map(r => r.COLUMN_NAME));
  return _repuestosColsCache;
}

/** GET /api/dashboard/resumen */
async function dashboardResumen(req, res) {
  try {
    const cols = await getRepuestosColumns();
    const hasCreatedAt = cols.has('created_at');
    const hasUpdatedAt = cols.has('updated_at');
    const hasId = cols.has('id');

    let latestOrder = 'referencia DESC';
    if (hasCreatedAt) latestOrder = 'created_at DESC, referencia DESC';
    else if (hasUpdatedAt) latestOrder = 'updated_at DESC, referencia DESC';
    else if (hasId) latestOrder = 'id DESC';

    const [
      [[repCount]],
      [[telCount]],
      [catRows],
      [marcaRows],
      [latestRows],
      [latestPvpRows],
    ] = await Promise.all([
      db.execute(`SELECT COUNT(*) AS total FROM repuestos`),
      db.execute(`SELECT COUNT(*) AS total FROM telefonos`),
      db.execute(
        `SELECT COALESCE(NULLIF(TRIM(categoria), ''), 'Sin categoría') AS nombre, COUNT(*) AS total
           FROM repuestos
          GROUP BY COALESCE(NULLIF(TRIM(categoria), ''), 'Sin categoría')
          ORDER BY total DESC
          LIMIT 6`
      ),
      db.execute(
        `SELECT COALESCE(NULLIF(TRIM(marca), ''), 'Sin marca') AS nombre, COUNT(*) AS total
           FROM repuestos
          GROUP BY COALESCE(NULLIF(TRIM(marca), ''), 'Sin marca')
          ORDER BY total DESC
          LIMIT 6`
      ),
      db.execute(
        `SELECT referencia, marca, categoria, modelo, etiqueta, pvp, pvp_clubsave
           FROM repuestos
          ORDER BY ${latestOrder}
          LIMIT 5`
      ),
      db.execute(
        `SELECT referencia, marca, categoria, modelo, etiqueta, pvp, pvp_clubsave
           FROM repuestos
          WHERE pvp IS NOT NULL
          ORDER BY ${latestOrder}
          LIMIT 5`
      ),
    ]);

    res.json({
      totalRepuestos: Number(repCount.total || 0),
      totalTelefonos: Number(telCount.total || 0),
      topCategorias: catRows,
      topMarcas: marcaRows,
      ultimasReferencias: latestRows,
      ultimosPvpModificados: latestPvpRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar resumen de dashboard' });
  }
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

/** POST /api/apple — solo admin */
async function crearApple(req, res) {
  const { referencia, marca, categoria, modelo, etiqueta, pvp } = req.body;
  if (!referencia) return res.status(400).json({ error: 'Referencia obligatoria' });
  try {
    await db.execute(
      `INSERT INTO apple_original (referencia, marca, categoria, modelo, etiqueta, pvp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [referencia, marca || '', categoria || '', modelo || '', etiqueta || referencia, pvp || null]
    );
    res.status(201).json({ referencia, message: 'Referencia Apple creada' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esa referencia ya existe' });
    res.status(500).json({ error: 'Error al crear Apple Original' });
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
    const { ref, categoria, marca, modelo, q, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = []; const params = [];
    if (ref)      { where.push('referencia LIKE ?'); params.push(`%${ref}%`); }
    if (categoria){ where.push('categoria = ?');     params.push(categoria);  }
    if (marca)    { where.push('marca = ?');         params.push(marca);      }
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
    const { ref, categoria, marca, modelo, q, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = []; const params = [];
    if (ref)   { where.push('referencia LIKE ?'); params.push(`%${ref}%`); }
    if (categoria){ where.push('categoria = ?');  params.push(categoria);  }
    if (marca) { where.push('marca = ?');         params.push(marca);      }
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

/** POST /api/oppo — solo admin */
async function crearOppo(req, res) {
  const { referencia, marca, categoria, modelo, etiqueta, pvp } = req.body;
  if (!referencia) return res.status(400).json({ error: 'Referencia obligatoria' });
  try {
    await db.execute(
      `INSERT INTO oppo_original (referencia, marca, categoria, modelo, etiqueta, pvp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [referencia, marca || '', categoria || '', modelo || '', etiqueta || referencia, pvp || null]
    );
    res.status(201).json({ referencia, message: 'Referencia Oppo creada' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esa referencia ya existe' });
    res.status(500).json({ error: 'Error al crear Oppo Original' });
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

/** POST /api/telefonos — solo admin */
async function crearTelefono(req, res) {
  const { referencia, marca, modelo, etiqueta, pvp } = req.body;
  if (!referencia) return res.status(400).json({ error: 'Referencia obligatoria' });
  try {
    await db.execute(
      `INSERT INTO telefonos (referencia, marca, modelo, etiqueta, pvp)
       VALUES (?, ?, ?, ?, ?)`,
      [referencia, marca || '', modelo || '', etiqueta || referencia, pvp || null]
    );
    res.status(201).json({ referencia, message: 'Teléfono creado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esa referencia ya existe' });
    res.status(500).json({ error: 'Error al crear teléfono' });
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
      `SELECT nombre
       FROM (
         SELECT DISTINCT categoria AS nombre
         FROM repuestos
         WHERE categoria IS NOT NULL AND categoria != ''
         UNION
         SELECT DISTINCT categoria AS nombre
         FROM apple_original
         WHERE categoria IS NOT NULL AND categoria != ''
         UNION
         SELECT DISTINCT categoria AS nombre
         FROM oppo_original
         WHERE categoria IS NOT NULL AND categoria != ''
       ) c
       WHERE nombre IS NOT NULL AND nombre != ''
       ORDER BY nombre`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
}

module.exports = {
  listar, obtener, crear, actualizar, eliminar,
  listarApple, crearApple, actualizarApple, eliminarApple,
  listarOppo, crearOppo, actualizarOppo, eliminarOppo,
  listarTelefonos, crearTelefono, actualizarTelefono, eliminarTelefono,
  dashboardResumen,
  busquedaGlobal,
  listarCategorias,
};
