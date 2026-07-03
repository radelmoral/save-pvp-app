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
Tu única función es mostrar exactamente los datos de stock que recibes, sin añadir ni inventar ningún dato.

REGLAS ESTRICTAS:
1. Usa ÚNICAMENTE los datos del contexto proporcionado. No añadas tiendas, referencias ni productos que no aparezcan en el contexto.
2. Lista cada línea del contexto como un punto con este formato exacto:
   • [Nombre tienda] — Ref: [referencia] — [descripción] — Stock: [N] uds — PVP: [X]€
3. NO agrupes ni combines líneas. Cada línea del contexto = un punto en la respuesta.
4. Al final añade: "Total: X unidades en Y tiendas."
5. Si el contexto dice "No se encontraron resultados", responde que no hay stock disponible y sugiere buscar con otros términos.
6. Responde siempre en español.`;

const STOPWORDS = new Set([
  'necesito','quiero','busco','hay','tiene','tienen','tienes','donde','dónde',
  'en','que','qué','una','uno','unos','unas','un','de','del','la','el','los','las',
  'con','para','por','si','se','su','sus','me','te','le','nos','les',
  'alguna','algún','algun','alguno','algunos','algunas','disponible','disponibles',
  'stock','hay','ver','saber','conocer','decir','como','cómo','cual','cuál',
  'cuanto','cuánto','tengo','tiene','favor','gracias','hola','buenas',
]);

async function buscarStock(keyword) {
  const terms = keyword.trim().toLowerCase().split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
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
     ORDER BY current_stock DESC
     LIMIT 15`,
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
    console.log(`[CHAT] Mensaje: "${mensaje}" → ${rows.length} resultados en BD`);
    const contexto = formatStockContext(rows);

    const userMessage = `Pregunta: ${mensaje}\n\nStock disponible:\n${contexto}`;

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1024,
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
