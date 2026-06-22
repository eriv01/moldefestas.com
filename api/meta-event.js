// api/meta-event.js
// Vercel Serverless Function — Envia eventos para Meta Conversions API (server-side)
// Variáveis de ambiente:
//   META_PIXEL_ID     → ID do seu Pixel (ex: 1500617015193193)
//   META_ACCESS_TOKEN → Token do Conversions API (gerado no Events Manager da Meta)

import crypto from 'crypto';

function hashSHA256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const PIXEL_ID    = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn('[meta-event] Variáveis META não configuradas');
    return res.status(200).json({ warn: 'Meta não configurado — evento ignorado' });
  }

  const {
    event,      // 'PageView' | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase'
    email,
    phone,
    value,
    currency,
    url,
    fbp,        // cookie _fbp do navegador
    fbc,        // cookie _fbc do navegador
  } = req.body;

  if (!event) {
    return res.status(400).json({ error: 'event é obrigatório' });
  }

  // Monta user_data com hashes SHA256 (exigido pela Meta)
  const user_data = {
    em:  hashSHA256(email),
    ph:  hashSHA256(phone),
    client_ip_address: req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress,
    client_user_agent: req.headers['user-agent'],
    fbp: fbp || undefined,
    fbc: fbc || undefined,
  };

  const eventTime = Math.floor(Date.now() / 1000);

  const payload = {
    data: [
      {
        event_name:        event,
        event_time:        eventTime,
        event_source_url:  url || 'https://maefesteira.com.br/checkout',
        action_source:     'website',
        user_data,
        ...(value ? {
          custom_data: {
            value:    parseFloat(value),
            currency: currency || 'BRL',
          }
        } : {}),
      }
    ],
    // test_event_code: 'TEST12345', // descomente para testar no Events Manager da Meta
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[meta-event] Erro:', JSON.stringify(data));
      return res.status(500).json({ error: data.error?.message || 'Erro na Meta API' });
    }

    return res.status(200).json({ success: true, events_received: data.events_received });

  } catch (err) {
    console.error('[meta-event] Exception:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
