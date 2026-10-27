const db = require('../config/db');

// Acceso a la Calculadora PVP para usuarios que no son administradores.
// Los administradores tienen acceso siempre; esta tabla solo guarda qué otros
// usuarios lo tienen. Se gestiona desde Usuarios (crear / editar) en el panel admin.

// Usuarios que ya tenían acceso antes de esta tabla (lista fija del index.html).
// Se dan de alta una sola vez, al crear la tabla.
const USUARIOS_INICIALES = ['test', 'asoldan', 'fcarrillo', 'jmunoz', 'dvalderrabano'];

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const [existe] = await db.execute(`SHOW TABLES LIKE 'calculadora_acceso'`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS calculadora_acceso (
      id_usuario INT NOT NULL PRIMARY KEY,
      admin_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  if (!existe.length) {
    // Primera vez: migrar la lista fija. Se lee la tabla usuarios entera para no
    // depender del nombre exacto de la columna del nombre de usuario.
    try {
      const [usuarios] = await db.execute(`SELECT * FROM usuarios`);
      for (const u of usuarios) {
        const nombreUsuario = String(u.username || u.usuario || u.user || '').trim().toLowerCase();
        if (USUARIOS_INICIALES.includes(nombreUsuario)) {
          await db.execute(`INSERT IGNORE INTO calculadora_acceso (id_usuario) VALUES (?)`, [u.id_usuario]);
        }
      }
    } catch (err) {
      console.error('No se pudo migrar la lista inicial de acceso a la calculadora:', err.message);
    }
  }
  _schemaReady = true;
}

/** GET /api/calculadora-acceso/me  (cualquier usuario autenticado) → { acceso } */
async function miAcceso(req, res) {
  try {
    if (req.user.rol === 'admin') return res.json({ acceso: true, admin: true });
    await ensureSchema();
    const [rows] = await db.execute(
      `SELECT 1 FROM calculadora_acceso WHERE id_usuario = ? LIMIT 1`, [req.user.id]
    );
    res.json({ acceso: rows.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error comprobando el acceso a la calculadora' });
  }
}

/** GET /api/calculadora-acceso  (admin) → { ids: [id_usuario, ...] } */
async function listar(req, res) {
  try {
    await ensureSchema();
    const [rows] = await db.execute(`SELECT id_usuario FROM calculadora_acceso`);
    res.json({ ids: rows.map(r => r.id_usuario) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error listando accesos a la calculadora' });
  }
}

/** PUT /api/calculadora-acceso/:id  (admin)  body: { acceso: true|false } */
async function asignar(req, res) {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Usuario inválido' });
    if (req.body && req.body.acceso) {
      await db.execute(
        `INSERT INTO calculadora_acceso (id_usuario, admin_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE admin_id = VALUES(admin_id)`,
        [id, req.user.id]
      );
    } else {
      await db.execute(`DELETE FROM calculadora_acceso WHERE id_usuario = ?`, [id]);
    }
    res.json({ ok: true, acceso: !!(req.body && req.body.acceso) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error guardando el acceso a la calculadora' });
  }
}

module.exports = { miAcceso, listar, asignar };
