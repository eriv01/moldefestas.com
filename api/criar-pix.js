// api/criar-pix.js
// Teste da hipotese CPF: campo de identificacao REMOVIDO.
// Bloco de DEBUG ligado: se der erro, devolve o motivo real do Mercado Pago.
// Variavel de ambiente: MP_ACCESS_TOKEN (Access Token de producao, comeca com APP_USR-)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'metodo_nao_permitido' });

  const { nome, email, zap, valor, plano, bumps } = req.body || {};
  if (!nome || !email || !valor) return res.status(400).json({ error: 'dados_incompletos' });

  const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) return res.status(500).json({ error: 'token_mp_ausente' });

  const bumpsDesc = (bumps && bumps.length) ? (' + ' + bumps.join(', ')) : '';
  const descricao = 'Mae Festeira - ' + (plano === 'basico' ? 'Pacote Basico' : 'Pacote Premium') + bumpsDesc;

  const zapLimpo = String(zap || '').replace(/\D/g, '');

  // notification_url so vai se for URL absoluta valida (URL relativa quebra o MP)
  const base = process.env.VERCEL_URL ? ('https://' + process.env.VERCEL_URL)
             : (process.env.NEXT_PUBLIC_BASE_URL || '');
  const notificationUrl = base ? (base + '/api/mp-webhook') : undefined;

  // expiracao em 15 min, formato aceito pelo MP (offset -03:00, horario de Brasilia)
  const pad = n => String(n).padStart(2, '0');
  const off = new Date(Date.now() + 15 * 60 * 1000 - 3 * 60 * 60 * 1000); // mesmo instante em -03:00
  const dateOfExpiration =
    off.getUTCFullYear() + '-' + pad(off.getUTCMonth() + 1) + '-' + pad(off.getUTCDate()) +
    'T' + pad(off.getUTCHours()) + ':' + pad(off.getUTCMinutes()) + ':' + pad(off.getUTCSeconds()) +
    '.000-03:00';

  const payment = {
    transaction_amount: Number(parseFloat(valor).toFixed(2)),
    description: descricao,
    payment_method_id: 'pix',
    date_of_expiration: dateOfExpiration,
    payer: {
      email: email,
      first_name: nome.split(' ')[0],
      last_name: nome.split(' ').slice(1).join(' ') || nome.split(' ')[0]
    },
    metadata: { plano: plano, bumps: bumps || [], zap: zapLimpo }
  };

  // CPF REMOVIDO (sem payer.identification) para testar a hipotese.
  if (zapLimpo.length >= 10) {
    payment.payer.phone = { area_code: zapLimpo.slice(0, 2), number: zapLimpo.slice(2) };
  }
  if (notificationUrl) payment.notification_url = notificationUrl;

  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MP_TOKEN,
        'X-Idempotency-Key': 'mf-' + Date.now() + '-' + Math.random().toString(16).slice(2)
      },
      body: JSON.stringify(payment)
    });
    const data = await r.json();

    if (!r.ok || !data.id) {
      console.error('[criar-pix] MP status', r.status, JSON.stringify(data));
      // ===== DEBUG: devolve o erro real do MP. Remova depois que funcionar. =====
      return res.status(502).json({
        error: 'mp_error',
        mp_status: r.status,
        mp_message: data.message || null,
        mp_detail: data.cause || data.error || data
      });
      // ========================================================================
    }

    const tx = data.point_of_interaction && data.point_of_interaction.transaction_data;
    if (!tx || !tx.qr_code) {
      console.error('[criar-pix] sem QR', JSON.stringify(data));
      return res.status(502).json({ error: 'sem_qr', status: data.status, status_detail: data.status_detail });
    }

    return res.status(200).json({
      payment_id: data.id,
      pix_code: tx.qr_code,
      qr_image: 'data:image/png;base64,' + tx.qr_code_base64,
      status: data.status
    });
  } catch (err) {
    console.error('[criar-pix] exception', String(err));
    return res.status(500).json({ error: 'erro_interno', detail: String(err) });
  }
}
