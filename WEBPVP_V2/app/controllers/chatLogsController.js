const pool = require('../config/db');

async function listar(req, res) {
  const { usuario, desde, hasta, page = 1 } = req.query;
  const limit  = 50;
  const offset = (Math.max(1, parseInt(page)) - 1) * limit;

  const conditions = [];
  const params     = [];

  if (usuario) {
    conditions.push('(usuario LIKE ? OR usuario_id = ?)');
    params.push(`%${usuario}%`, parseInt(usuario) || 0);
  }
  if (desde) { conditions.push('created_at >= ?'); params.push(desde + ' 00:00:00'); }
  if (hasta) { conditions.push('created_at <= ?'); params.push(hasta + ' 23:59:59'); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM chat_logs ${where}`, params
  );
  const [rows] = await pool.execute(
    `SELECT id, usuario_id, usuario, rol, mensaje, resultados, created_at
     FROM chat_logs ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({ total, page: parseInt(page), limit, rows });
}

async function resumen(req, res) {
  const [porUsuario] = await pool.execute(
    `SELECT usuario, rol, COUNT(*) AS consultas,
            SUM(resultados > 0) AS con_resultados,
            MAX(created_at) AS ultima
     FROM chat_logs
     GROUP BY usuario_id, usuario, rol
     ORDER BY consultas DESC`
  );
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM chat_logs`
  );
  const [[{ hoy }]] = await pool.execute(
    `SELECT COUNT(*) AS hoy FROM chat_logs WHERE DATE(created_at) = CURDATE()`
  );
  res.json({ total, hoy, porUsuario });
}

module.exports = { listar, resumen };
