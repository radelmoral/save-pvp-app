const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../config/db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Eres un asistente de stock de SAVE, una red de tiendas de reparación de electrónica.
Tu única función es ayudar a los empleados a encontrar piezas y repuestos disponibles en las tiendas de la red.

Cuando el usuario pregunte por un producto, recibirás un contexto de stock filtrado.
Responde siempre en español, de forma concisa y clara.
Si hay resultados, lista las tiendas disponibles con el stock y el precio.
Si no hay resultados, indícalo claramente y sugiere buscar con otros términos.
No inventes datos: usa solo la información del contexto proporcionado.`;

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
  return rows.map(r =>
    `Tienda: ${r.store} | Ref: ${r.reference} | ${r.make} ${r.label} ${r.model || ''} | ` +
    `Stock: ${r.current_stock} | Cat: ${r.category} | PVP: ${r.sell_price_with_tax ?? 'N/D'}€`
  ).join('\n');
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
    res.json({ respuesta, resultados: rows.length });
  } catch (err) {
    console.error('Error en chat:', err.message);
    res.status(500).json({ error: 'Error al procesar la consulta' });
  }
}

module.exports = { chat };
