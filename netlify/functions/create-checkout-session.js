const Stripe = require("stripe");

function getBaseUrl(event) {
  // Prefer explicit env var if set (recommended)
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const proto = (event.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (event.headers["x-forwarded-host"] || event.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}`.replace(/\/$/, "");
}

exports.handler = async (event) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "STRIPE_SECRET_KEY não configurada no Netlify." }) };
    }

    const stripe = new Stripe(stripeKey);
    const payload = JSON.parse(event.body || "{}");
    const { items } = payload || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Carrinho vazio." }) };
    }

    const line_items = items.map((i) => {
      const name = String(i.name || "Item").slice(0, 250);
      const unit_amount = Number(i.price || 0);
      const quantity = Number(i.quantity || 1);

      if (!Number.isInteger(unit_amount) || unit_amount <= 0) {
        throw new Error(`Preço inválido para "${name}".`);
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`Quantidade inválida para "${name}".`);
      }

      return {
        price_data: {
          currency: "brl",
          product_data: { name },
          unit_amount,
        },
        quantity,
      };
    });

    const baseUrl = getBaseUrl(event);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      // Habilita todos os métodos disponíveis automaticamente (cartão, Pix etc. conforme sua conta/país)
      automatic_payment_methods: { enabled: true },
      // Permite usar cupons/promotion codes criados no Stripe
      allow_promotion_codes: true,
      locale: "pt-BR",
      success_url: `${baseUrl}/?pagamento=sucesso&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?pagamento=cancelado`,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
