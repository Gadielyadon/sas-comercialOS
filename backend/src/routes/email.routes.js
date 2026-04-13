// src/routes/email.routes.js
const express = require('express');
const router  = express.Router();
const { enviarComprobante } = require('../services/email.service');

// POST /api/email/comprobante
// Body: { sale_id, email_destino }
router.post('/comprobante', async (req, res) => {
  try {
    const { sale_id, email_destino } = req.body;

    if (!sale_id)       return res.status(400).json({ error: 'sale_id requerido' });
    if (!email_destino) return res.status(400).json({ error: 'email_destino requerido' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email_destino)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const resultado = await enviarComprobante({
      sale_id:       Number(sale_id),
      email_destino: email_destino.trim(),
    });

    res.json(resultado);
  } catch(e) {
    console.error('Email comprobante error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/email/test — enviar email de prueba desde Ajustes
router.post('/test', async (req, res) => {
  try {
    const { email_destino } = req.body;
    if (!email_destino) return res.status(400).json({ error: 'email_destino requerido' });

    const configService = require('../services/config.service');
    const nodemailer    = require('nodemailer');
    const cfg           = configService.getAll();
    const user          = String(cfg.email_gmail   || '').trim();
    const pass          = String(cfg.email_app_pass || '').trim();

    if (!user || !pass) {
      return res.status(400).json({ error: 'Gmail no configurado en Ajustes' });
    }

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    const empresa     = cfg.empresa_nombre || 'AxSoft';

    await transporter.sendMail({
      from:    `"${empresa}" <${user}>`,
      to:      email_destino,
      subject: `✅ Email de prueba — ${empresa}`,
      html:    `<div style="font-family:sans-serif;padding:24px;max-width:480px;margin:0 auto;">
                  <h2 style="color:#1B4FD8;">¡Conexión exitosa!</h2>
                  <p>Este es un email de prueba enviado desde <strong>${empresa}</strong>.</p>
                  <p style="color:#6B7280;font-size:13px;">Si lo recibiste, el sistema está listo para enviar comprobantes a tus clientes.</p>
                </div>`,
    });

    res.json({ ok: true });
  } catch(e) {
    console.error('Email test error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
