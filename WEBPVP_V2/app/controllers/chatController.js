const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../config/db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TIENDAS = {
  PSCES011: 'CRF La Sierra (Córdoba)',
  PSCES013: 'CRF El Paseo (Puerto de Santa María)',
  PSCES021: 'CRF Fan Mallorca (Palma de Mallorca)',
  PSCES078: 'SAVE General Ricardos (Madrid)',
  PSCES020: 'ECI Castellana (Madrid)',
  PSCES023: 'ECI Princesa (Madrid)',
  PSCES024: 'ECI Pozuelo (Madrid)',
  PSCES025: 'ECI Callao (Madrid)',
  PSCES033: 'ECI Sanchinarro (Madrid)',
  PSCES034: 'ECI Bilbao (Bilbao)',
  PSCES035: 'ECI Plaza Cataluña (Barcelona)',
  PSCES036: 'ECI Goya (Madrid)',
  PSCES039: 'ECI Diagonal (Barcelona)',
  PSCES040: 'ECI Marbella (Marbella)',
  PSCES043: 'ECI Alicante (Alicante)',
  PSCES044: 'ECI Málaga (Málaga)',
  PSCES046: 'ECI Mallorca (Palma de Mallorca)',
  PSCES047: 'ECI Valencia (Valencia)',
  PSCES048: 'ECI Las Palmas (Las Palmas)',
  PSCES065: 'ECI Murcia (Murcia)',
  PSCES066: 'ECI Bahía de Santander (Santander)',
  PSCES067: 'ECI San Juan de Aznalfarache (Sevilla)',
  PSCES076: 'ECI Pamplona (Pamplona)',
};

const SYSTEM_PROMPT = `Eres un asistente de stock de SAVE, una red de tiendas de reparación de electrónica.
Tu única función es ayudar a los empleados a encontrar piezas y repuestos disponibles en las tiendas de la red.

Cuando el usuario pregunte por un producto, recibirás un contexto de stock filtrado donde cada línea ya incluye el nombre completo de la tienda.
Responde siempre en español, de forma concisa y estructurada.

Formato de respuesta obligatorio:
- Si hay resultados, presenta cada producto encontrado como un punto de lista con este formato:
  • [Nombre tienda] — Ref: [referencia] — [Descripción producto] — Stock: [N] uds — PVP: [X]€
- Agrupa por producto si el mismo artículo aparece en varias tiendas.
- Añade un resumen breve al final indicando el total de unidades disponibles y en cuántas tiendas.
- Si no hay resultados, indícalo claramente y sugiere buscar con otros términos.
- No inventes datos: usa solo la información del contexto proporcionado.`;

async function buscarStock(keyword) {
  const terms = keyword.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const conditions = terms.map(() =>
    `(reference LIKE ? OR make LIKE ? OR label LIKE ? OR model LIKE ? OR category LIKE ?)`
  ).join(' AND ');

  const params = terms.flatMap(t => {
    const like = `%${t}%`;
    return [like, like, like, like, like];
  });

  const [rows] = await pool.execute(
    `SELECT store, reference, make, label, current_stock, category, model,
            amount_without_vat, sell_price_with_tax
     FROM stock_erp
     WHERE current_stock > 0 AND (${conditions})
     LIMIT 30`,
    params
  );
  return rows;
}

function formatStockContext(rows) {
  if (rows.length === 0) return 'No se encontraron resultados en el stock.';
  return rows.map(r => {
    const tienda = TIENDAS[r.store] || r.store;
    return `Tienda: ${tienda} | Ref: ${r.reference} | ${r.make} ${r.label} ${r.model || ''} | ` +
           `Stock: ${r.current_stock} | Cat: ${r.category} | PVP: ${r.sell_price_with_tax ?? 'N/D'}€`;
  }).join('\n');
}

async function chat(req, res) {
  const { mensaje } = req.body;
  if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length === 0) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }
  if (mensaje.length > 500) {
    return res.status(400).json({ error: 'Mensaje demasiado largo (máx. 500 caracteres)' });
  }

  try {
    const rows = await buscarStock(mensaje);
    const contexto = formatStockContext(rows);

    const userMessage = `Pregunta: ${mensaje}\n\nStock disponible:\n${contexto}`;

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userMessage }],
    });

    const respuesta = response.content[0]?.text ?? 'No se pudo obtener respuesta.';

    try {
      await pool.execute(
        `INSERT INTO chat_logs (usuario_id, usuario, rol, mensaje, resultados)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, req.user.username || req.user.nombre || String(req.user.id),
         req.user.rol, mensaje, rows.length]
      );
    } catch (logErr) {
      console.error('Error guardando chat_log:', logErr.message);
    }

    res.json({ respuesta, resultados: rows.length });
  } catch (err) {
    console.error('Error en chat:', err.message);
    res.status(500).json({ error: 'Error al procesar la consulta' });
  }
}

module.exports = { chat };
