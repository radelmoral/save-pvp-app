const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

// Mapeo numérico de roles de tu BBDD → nombres usados en la app
const ROL_MAP = { 1: 'admin', 2: 'carrefour', 3: 'eci' };
// Y al revés, para filtros
const ROL_NUM = { admin: 1, carrefour: 2, eci: 3 };

/**
 * POST /api/auth/login
 * Usa la tabla `usuarios` original con columnas:
 *   id_usuario, nombre, usuario, email, clave, rol (1/2/3)
 * Los hashes son $2y$ (PHP bcrypt) — compatibles con bcryptjs
 */
async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id_usuario, nombre, usuario, email, clave, rol
       FROM usuarios
       WHERE usuario = ?`,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = rows[0];

    // bcryptjs acepta hashes $2y$ de PHP directamente
    const valid = await bcrypt.compare(password, user.clave);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const rolNombre = ROL_MAP[user.rol] || 'eci';

    const token = jwt.sign(
      {
        id:       user.id_usuario,
        username: user.usuario,
        nombre:   user.nombre,
        rol:      rolNombre,       // 'admin' | 'carrefour' | 'eci'
        rolNum:   user.rol,        // 1 | 2 | 3  (por si hace falta)
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        id:       user.id_usuario,
        nombre:   user.nombre,
        username: user.usuario,
        email:    user.email,
        rol:      rolNombre,
      }
    });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/auth/me
 */
async function me(req, res) {
  try {
    const [rows] = await db.execute(
      `SELECT id_usuario AS id, nombre, usuario AS username, email, rol
       FROM usuarios WHERE id_usuario = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const u = rows[0];
    res.json({ ...u, rol: ROL_MAP[u.rol] || 'eci' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

module.exports = { login, me, ROL_MAP, ROL_NUM };
