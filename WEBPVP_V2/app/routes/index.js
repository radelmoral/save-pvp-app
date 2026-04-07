const express = require('express');
const router  = express.Router();

const { authMiddleware: auth, role } = require('../middleware/auth');

const authCtrl      = require('../controllers/authController');
const repCtrl       = require('../controllers/repuestosController');
const solicCtrl     = require('../controllers/solicitudesController');
const usuariosCtrl  = require('../controllers/usuariosController');

// ── Auth ──────────────────────────────────────────────────
router.post('/auth/login', authCtrl.login);
router.get ('/auth/me',    auth, authCtrl.me);

// ── Categorías (extraídas de la BBDD real) ────────────────
router.get ('/categorias',    auth, usuariosCtrl.listarCategorias);
router.post('/categorias',    auth, role('admin'), usuariosCtrl.crearCategoria);

// ── Repuestos ─────────────────────────────────────────────
router.get ('/repuestos',        auth, repCtrl.listar);
router.get ('/repuestos/:id',    auth, repCtrl.obtener);
router.post('/repuestos',        auth, role('admin'), repCtrl.crear);
router.put ('/repuestos/:id',    auth, role('admin'), repCtrl.actualizar);
router.delete('/repuestos/:id',  auth, role('admin'), repCtrl.eliminar);
router.get ('/busqueda-global',  auth, repCtrl.busquedaGlobal);

// ── Apple Original ────────────────────────────────────────
router.get('/apple', auth, repCtrl.listarApple);
router.post('/apple', auth, role('admin'), repCtrl.crearApple);
router.put('/apple/:id', auth, role('admin'), repCtrl.actualizarApple);
router.delete('/apple/:id', auth, role('admin'), repCtrl.eliminarApple);

// ── Oppo Original ─────────────────────────────────────────
router.get('/oppo', auth, repCtrl.listarOppo);
router.post('/oppo', auth, role('admin'), repCtrl.crearOppo);
router.put('/oppo/:id', auth, role('admin'), repCtrl.actualizarOppo);
router.delete('/oppo/:id', auth, role('admin'), repCtrl.eliminarOppo);

// ── Teléfonos ─────────────────────────────────────────────
router.get('/telefonos', auth, repCtrl.listarTelefonos);
router.post('/telefonos', auth, role('admin'), repCtrl.crearTelefono);
router.put('/telefonos/:id', auth, role('admin'), repCtrl.actualizarTelefono);
router.delete('/telefonos/:id', auth, role('admin'), repCtrl.eliminarTelefono);

// ── Solicitudes PVP ───────────────────────────────────────
router.get ('/solicitudes',              auth, solicCtrl.listar);
router.post('/solicitudes',              auth, solicCtrl.crear);
router.put ('/solicitudes/:id/aprobar',  auth, role('admin'), solicCtrl.aprobar);
router.put ('/solicitudes/:id/rechazar', auth, role('admin'), solicCtrl.rechazar);

// ── Usuarios (admin only) ─────────────────────────────────
router.get ('/usuarios',      auth, role('admin'), usuariosCtrl.listar);
router.post('/usuarios',      auth, role('admin'), usuariosCtrl.crear);
router.put ('/usuarios/:id',  auth, role('admin'), usuariosCtrl.actualizar);

module.exports = router;
