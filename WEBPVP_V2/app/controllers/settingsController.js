const db = require('../config/db');

const CALC_KEY = 'calculadora_pvp_config';

async function ensureSettingsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      clave       VARCHAR(120) NOT NULL PRIMARY KEY,
      valor       LONGTEXT     NOT NULL,
      updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** GET /api/settings/calculadora — todos los roles autenticados */
async function getCalcConfig(req, res) {
  try {
    await ensureSettingsTable();
    const [[row]] = await db.execute(
      'SELECT valor FROM app_settings WHERE clave = ?', [CALC_KEY]
    );
    if (!row) return res.json(null); // sin config guardada → el cliente usa FABRICA
    res.json(JSON.parse(row.valor));
  } catch (err) {
    console.error('Error al obtener config calculadora:', err.message);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
}

/** PUT /api/settings/calculadora — solo admin */
async function setCalcConfig(req, res) {
  try {
    await ensureSettingsTable();
    const config = req.body;
    if (!config || !config.reparaciones || !config.bandas || !config.mo) {
      return res.status(400).json({ error: 'Configuración inválida' });
    }
    await db.execute(
      `INSERT INTO app_settings (clave, valor)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [CALC_KEY, JSON.stringify(config)]
    );
    res.json({ message: 'Configuración guardada' });
  } catch (err) {
    console.error('Error al guardar config calculadora:', err.message);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
}

module.exports = { getCalcConfig, setCalcConfig };
