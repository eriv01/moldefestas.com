// api/criar-pix.js
// Vercel Serverless Function — Criar cobrança PIX via Mercado Pago
// Variáveis de ambiente necessárias no painel Vercel:
//   MP_ACCESS_TOKEN  → seu Access Token do Mercado Pago (começa com APP_USR-)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { nome, email, zap, valor, plano, bumps } = req.body;

  if (!nome || !email || !valor) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) {
    return res.status(500).json({ error: 'Token Mercado Pago não configurado' });
  }

  // Monta descrição dos itens selecionados
  const bumpsDesc = (bumps && bumps.length > 0)
    ? ` + ${bumps.join(', ')}`
    : '';
  const descricao = `Mãe Festeira — ${plano === 'basico' ? 'Pacote Básico' : 'Pacote Premium'}${bumpsDesc}`;

  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MP_TOKEN}`,
        'X-Idempotency-Key': `mf-${Date.now()}-${email.replace(/[^a-z0-9]/gi, '')}`,
      },
      body: JSON.stringify({
        transaction_amount: parseFloat(valor),
        description: descricao,
        payment_method_id: 'pix',
        date_of_expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
        payer: {
          first_name: nome.split(' ')[0],
          last_name:  nome.split(' ').slice(1).join(' ') || nome.split(' ')[0],
          email:      email,
          phone: {
            area_code: zap ? zap.substring(0, 2) : '11',
            number:    zap ? zap.substring(2)    : '000000000',
          },
          identification: {
            type:   'CPF',
            number: '00000000000', // opcional — pode coletar CPF no form se quiser
          },
        },
        metadata: {
          plano,
          bumps: bumps || [],
          zap: zap || '',
        },
        notification_url: `${process.env.VERCEL_URL
          ? 'https://' + process.env.VERCEL_URL
          : process.env.NEXT_PUBLIC_BASE_URL || ''}/api/mp-webhook`,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.id) {
      console.error('[criar-pix] Erro MP:', JSON.stringify(data));
      return res.status(500).json({
        error: data.message || 'Erro ao criar cobrança PIX',
      });
    }

    const txInfo = data.point_of_interaction?.transaction_data;
    if (!txInfo?.qr_code || !txInfo?.qr_code_base64) {
      return res.status(500).json({ error: 'PIX não gerado pelo Mercado Pago' });
    }

    return res.status(200).json({
      payment_id: data.id,
      pix_code:   txInfo.qr_code,
      qr_image:   `data:image/png;base64,${txInfo.qr_code_base64}`,
      status:     data.status,
    });

  } catch (err) {
    console.error('[criar-pix] Exception:', err);
    return res.status(500).json({ error: 'Erro interno ao criar PIX' });
  }
}
