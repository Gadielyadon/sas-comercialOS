'use strict';
const express = require('express');
const router  = express.Router();

function getCfg() {
  try { return require('../services/config.service').getAll(); } catch(e) { return {}; }
}

async function mpFetch(token, path, opts = {}) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers||{}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `MP error ${res.status}`);
  return data;
}

// GET /api/mp/devices
router.get('/devices', async (req, res) => {
  try {
    const cfg = getCfg();
    if (!cfg.mp_access_token) return res.status(400).json({ error: 'Token no configurado' });
    const data = await mpFetch(cfg.mp_access_token, '/point/integration-api/devices');
    res.json({ devices: data.devices || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/mp/cobrar
router.post('/cobrar', async (req, res) => {
  try {
    const cfg = getCfg();
    if (!cfg.mp_access_token) return res.status(400).json({ error: 'Token no configurado' });
    if (!cfg.mp_device_id)    return res.status(400).json({ error: 'Device ID no configurado' });

    const { monto, descripcion, external_reference } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const devicePath = `/point/integration-api/devices/${encodeURIComponent(cfg.mp_device_id)}`;

    // Cancelar intent pendiente si existe — evita "queued intent" error
    try {
      const devInfo = await mpFetch(cfg.mp_access_token, devicePath);
      if (devInfo.payment_intent?.id) {
        await mpFetch(cfg.mp_access_token,
          `${devicePath}/payment-intents/${devInfo.payment_intent.id}`,
          { method: 'DELETE' }
        ).catch(() => {});
        await new Promise(r => setTimeout(r, 800)); // pequeña pausa tras cancelar
      }
    } catch(_) {}

    // Crear nuevo intent — monto en centavos: $6800 → 680000
    const data = await mpFetch(cfg.mp_access_token,
      `${devicePath}/payment-intents`,
      { method: 'POST', body: JSON.stringify({
        amount:          Math.round(Number(monto) * 100),
        additional_info: {
          external_reference: external_reference || `axsoft-${Date.now()}`,
          print_on_terminal:  true,
        }
      })}
    );
    res.json({ ok: true, intent_id: data.id, state: data.state });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/mp/estado/:intent_id
router.get('/estado/:intent_id', async (req, res) => {
  try {
    const cfg = getCfg();
    if (!cfg.mp_access_token) return res.status(400).json({ error: 'Token no configurado' });
    const data = await mpFetch(cfg.mp_access_token,
      `/point/integration-api/payment-intents/${req.params.intent_id}`);

    let status     = data.payment?.status || null;
    let payment_id = data.payment?.id     || null;

    // Si el intent está FINISHED pero el status no llegó aún,
    // consultamos directamente la API de pagos para obtener el estado real
    if (data.state === 'FINISHED' && payment_id && !status) {
      try {
        const pago = await mpFetch(cfg.mp_access_token, `/v1/payments/${payment_id}`);
        status = pago.status || null;
      } catch(_) {}
    }

    res.json({
      state:      data.state,
      intent_id:  data.id,
      payment_id,
      status,
      amount:     data.payment?.amount || null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/mp/cancelar/:intent_id
router.delete('/cancelar/:intent_id', async (req, res) => {
  try {
    const cfg = getCfg();
    if (!cfg.mp_access_token) return res.status(400).json({ error: 'Token no configurado' });
    await mpFetch(cfg.mp_access_token,
      `/point/integration-api/devices/${encodeURIComponent(cfg.mp_device_id)}/payment-intents/${req.params.intent_id}`,
      { method: 'DELETE' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/mp/activar-pdv — cambia el modo del dispositivo (PDV o STANDALONE)
router.post('/activar-pdv', async (req, res) => {
  try {
    const cfg = getCfg();
    if (!cfg.mp_access_token) return res.status(400).json({ error: 'Token no configurado' });
    const deviceId = req.body.device_id || cfg.mp_device_id;
    if (!deviceId) return res.status(400).json({ error: 'Device ID no especificado' });
    const modo = req.body.modo === 'STANDALONE' ? 'STANDALONE' : 'PDV';
    const data = await mpFetch(cfg.mp_access_token,
      `/point/integration-api/devices/${encodeURIComponent(deviceId)}`,
      { method: 'PATCH', body: JSON.stringify({ operating_mode: modo }) }
    );
    res.json({ ok: true, operating_mode: data.operating_mode || modo });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/mp/verificar-pin — verifica la contraseña de configuración
router.post('/verificar-pin', (req, res) => {
  const { pin } = req.body;
  // La contraseña está en la config de la instancia (mp_config_pin)
  // Si no hay pin configurado, usar el default
  const cfg = getCfg();
  const pinCorrecto = cfg.mp_config_pin || 'axsoft2025';
  if (pin === pinCorrecto) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'PIN incorrecto' });
  }
});

module.exports = router;