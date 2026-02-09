const Stripe = require("stripe");

exports.handler = async (event) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey) {
    return { statusCode: 500, body: "STRIPE_SECRET_KEY não configurada." };
  }
  if (!webhookSecret) {
    return { statusCode: 500, body: "STRIPE_WEBHOOK_SECRET não configurada." };
  }

  const stripe = new Stripe(stripeKey);

  try {
    const sig = event.headers["stripe-signature"];
    const stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);

    // Evento mais comum para checkout: quando finaliza
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      // Aqui é onde você colocaria: salvar pedido no banco / liberar download / enviar email etc.
      // Por enquanto, deixamos logado (você vê em Netlify > Functions > Logs)
      console.log("[stripe webhook] checkout.session.completed", {
        id: session.id,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        customer_email: session.customer_details?.email || null,
      });
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("[stripe webhook] erro:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }
};
