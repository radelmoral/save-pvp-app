/**
 * Reenvío de pedidos a n8n desde el servidor.
 *
 * Antes el navegador lanzaba un formulario oculto contra un iframe y daba el pedido
 * por bueno tras 1,5 s sin poder leer la respuesta. Cualquier fallo se perdía en
 * silencio. Ahora la petición sale del servidor, se comprueba el resultado real y
 * queda traza en el log.
 *
 * El webhook de n8n espera un POST de formulario con el campo `json_payload`,
 * así que se replica ese formato exacto para no tener que tocar el workflow.
 */

const N8N_PEDIDOS_URL =
  process.env.N8N_PEDIDOS_URL ||
  'https://n8n-n8n.ajvss9.easypanel.host/webhook/pedidossave';

const TIMEOUT_MS = 20000;

/** POST /api/pedidos */
async function enviarPedido(req, res) {
  const { items, fecha_envio, hora_envio } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El pedido no tiene líneas' });
  }

  // Validación mínima de cada línea: si falta algo, mejor rechazar aquí que
  // dejar que n8n escriba una fila incompleta o la descarte sin avisar.
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    if (!it.tienda || !it.referencia || !it.unidades) {
      return res.status(400).json({
        error: `La línea ${i + 1} está incompleta (faltan tienda, referencia o unidades)`
      });
    }
  }

  const payload = {
    fecha_envio: fecha_envio || new Date().toLocaleDateString('es-ES'),
    hora_envio:  hora_envio  || new Date().toLocaleTimeString('es-ES'),
    total_lineas: items.length,
    items,
    // Trazabilidad: quién lo envió realmente
    enviado_por: req.user?.nombre || req.user?.username || String(req.user?.id || ''),
    usuario_id:  req.user?.id || null
  };

  const tiendas = [...new Set(items.map(i => i.tienda))].join(', ');
  const etiquetaLog = `[pedidos] usuario=${payload.enviado_por} tiendas="${tiendas}" lineas=${items.length}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const body = new URLSearchParams({ json_payload: JSON.stringify(payload) });

    const r = await fetch(N8N_PEDIDOS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: ctrl.signal
    });

    const texto = await r.text().catch(() => '');

    if (!r.ok) {
      console.error(`${etiquetaLog} → ERROR HTTP ${r.status}: ${texto.slice(0, 500)}`);
      return res.status(502).json({
        error: `El servidor de pedidos respondió ${r.status}. El pedido NO se ha registrado.`,
        detalle: texto.slice(0, 300)
      });
    }

    console.log(`${etiquetaLog} → OK (${r.status})`);
    return res.json({
      message: 'Pedido enviado correctamente',
      lineas: items.length,
      respuesta: texto.slice(0, 300)
    });

  } catch (err) {
    const esTimeout = err.name === 'AbortError';
    console.error(`${etiquetaLog} → ${esTimeout ? 'TIMEOUT' : 'FALLO'}: ${err.message}`);
    return res.status(504).json({
      error: esTimeout
        ? 'El servidor de pedidos no respondió a tiempo. El pedido NO se ha registrado.'
        : `No se pudo contactar con el servidor de pedidos: ${err.message}. El pedido NO se ha registrado.`
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { enviarPedido };
