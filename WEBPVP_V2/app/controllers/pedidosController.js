/**
 * Registro de pedidos enviados (solo traza, NO interviene en el envío).
 *
 * El pedido lo sigue mandando el navegador directamente a n8n, igual que
 * siempre. Este endpoint recibe una copia únicamente para dejar constancia
 * en el log del servidor de qué se envió, desde qué tienda y por quién.
 *
 * Es deliberadamente inofensivo: pase lo que pase aquí, el pedido ya ha
 * salido. Nunca debe devolver un error que el frontend interprete como
 * un fallo de envío.
 */

/** POST /api/pedidos/log */
async function registrarPedido(req, res) {
  try {
    const { items, fecha_envio, hora_envio } = req.body || {};
    const lineas = Array.isArray(items) ? items : [];
    const tiendas = [...new Set(lineas.map(i => i && i.tienda).filter(Boolean))].join(', ');
    const quien = req.user?.nombre || req.user?.username || String(req.user?.id || '?');
    const rol = req.user?.rol || '?';

    console.log(
      `[pedidos] ${fecha_envio || ''} ${hora_envio || ''} · usuario=${quien} (${rol}) · ` +
      `tiendas="${tiendas}" · lineas=${lineas.length} · ` +
      `refs=${lineas.map(i => i && i.referencia).filter(Boolean).join('|')}`
    );
  } catch (err) {
    console.error('[pedidos] no se pudo registrar la traza:', err.message);
  }
  // Siempre 204: este endpoint jamás debe hacer fallar un pedido.
  return res.status(204).end();
}

module.exports = { registrarPedido };
