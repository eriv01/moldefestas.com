// api/status-pix.js
// Vercel Serverless Function — Consulta status de pagamento no Mercado Pago
// Variáveis de ambiente:
//   MP_ACCESS_TOKEN  → Access Token do Mercado Pago

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'ID de pagamento não informado' });
  }

  const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) {
    return res.status(500).json({ error: 'Token não configurado' });
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: {
        'Authorization': `Bearer ${MP_TOKEN}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.message || 'Erro ao consultar pagamento' });
    }

    // Status possíveis: pending, approved, rejected, cancelled, in_process, refunded
    return res.status(200).json({
      payment_id:          data.id,
      status:              data.status,
      status_detail:       data.status_detail,
      transaction_amount:  data.transaction_amount,
      payer_email:         data.payer?.email,
    });

  } catch (err) {
    console.error('[status-pix] Exception:', err);
    return res.status(500).json({ error: 'Erro interno ao consultar status' });
  }
}
