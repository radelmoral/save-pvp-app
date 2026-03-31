const jwt = require('jsonwebtoken');

/**
 * Verifica el token JWT en la cabecera Authorization: Bearer <token>
 * Adjunta req.user = { id, username, rol }
 */
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Restringe el acceso a uno o varios roles
 * Uso: router.get('/ruta', auth, role('admin'), handler)
 */
function role(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado — rol insuficiente' });
    }
    next();
  };
}

module.exports = { authMiddleware, role };
