const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { ROL_MAP, ROL_NUM } = require('./authController');

/**
 * Tabla real: `usuarios`
 * Columnas: id_usuario, nombre, usuario, email, clave, rol (1/2/3)
 * Roles: 1=admin, 2=carrefour, 3=eci
 */

/** GET /api/usuarios  — solo admin */
async function listar(req, res) {
  try {
    const [rows] = await db.execute(
      `SELECT id_usuario AS id, nombre, usuario AS username, email, rol
       FROM usuarios ORDER BY id_usuario`
    );
    // Convertir rol numérico a nombre legible
    const data = rows.map(u => ({ ...u, rolNombre: ROL_MAP[u.rol] || 'eci' }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
}

/** POST /api/usuarios  — solo admin */
async function crear(req, res) {
  const { nombre, username, email, password, rol } = req.body;

  if (!nombre || !username || !password || !rol) {
    return res.status(400).json({ error: 'nombre, username, password y rol son obligatorios' });
  }

  // Aceptar rol como nombre ('admin','carrefour','eci') o como número (1,2,3)
  const rolNum = typeof rol === 'number' ? rol : (ROL_NUM[rol] || 3);

  try {
    // Generar hash compatible con bcryptjs ($2a$) — válido también en PHP
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO usuarios (nombre, usuario, email, clave, rol) VALUES (?, ?, ?, ?, ?)',
      [nombre, username, email || '', hash, rolNum]
    );
    res.status(201).json({ id: result.insertId, message: 'Usuario creado correctamente' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El username o email ya existe' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
}

/** PUT /api/usuarios/:id  — solo admin */
async function actualizar(req, res) {
  const { nombre, username, email, rol, password } = req.body;
  const rolNum = rol !== undefined
    ? (typeof rol === 'number' ? rol : (ROL_NUM[rol] || 3))
    : null;

  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.execute(
        `UPDATE usuarios SET nombre=?, usuario=?, email=?${rolNum ? ', rol=?' : ''}, clave=? WHERE id_usuario=?`,
        rolNum
          ? [nombre, username, email || '', rolNum, hash, req.params.id]
          : [nombre, username, email || '', hash, req.params.id]
      );
    } else {
      await db.execute(
        `UPDATE usuarios SET nombre=?, usuario=?, email=?${rolNum ? ', rol=?' : ''} WHERE id_usuario=?`,
        rolNum
          ? [nombre, username, email || '', rolNum, req.params.id]
          : [nombre, username, email || '', req.params.id]
      );
    }
    res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El username o email ya existe' });
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
}

/** DELETE /api/usuarios/:id  — solo admin */
async function eliminar(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de usuario inválido' });
  }

  // Evitar borrado del propio usuario admin en sesión.
  if (req.user?.id === id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario en sesión' });
  }

  try {
    const [result] = await db.execute(
      'DELETE FROM usuarios WHERE id_usuario = ?',
      [id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
}

/** GET /api/categorias — extraídas dinámicamente de la tabla repuestos */
async function listarCategorias(req, res) {
  // Delegado al repuestosController para centralizar
  const repCtrl = require('./repuestosController');
  return repCtrl.listarCategorias(req, res);
}

/** POST /api/categorias  — solo admin
 *  En tu BBDD no hay tabla de categorías separada, así que esto solo
 *  devuelve confirmación (la categoría se añadirá al crear/editar un repuesto)
 */
async function crearCategoria(req, res) {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  // La categoría se crea implícitamente al insertar un repuesto con ese valor
  res.status(201).json({ nombre: nombre.trim(), message: 'Categoría registrada — se aplicará al crear el primer repuesto con este nombre' });
}

module.exports = { listar, crear, actualizar, eliminar, listarCategorias, crearCategoria };
