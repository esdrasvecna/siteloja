const Stripe = require("stripe");

exports.handler = async (event) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const payload = JSON.parse(event.body || "{}");
    const { items, successUrl, cancelUrl } = payload || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Carrinho vazio." }) };
    }

    const line_items = items.map((i) => ({
      price_data: {
        currency: "brl",
        product_data: { name: String(i.name || "Item") },
        unit_amount: Number(i.price || 0),
      },
      quantity: Number(i.quantity || 1),
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
