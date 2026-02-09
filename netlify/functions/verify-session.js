const Stripe = require("stripe");

exports.handler = async (event) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "STRIPE_SECRET_KEY não configurada no Netlify." }) };
    }

    const session_id = event.queryStringParameters?.session_id;
    if (!session_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "session_id ausente." }) };
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // payment_status costuma ser: 'paid', 'unpaid', 'no_payment_required'
    return {
      statusCode: 200,
      body: JSON.stringify({
        id: session.id,
        payment_status: session.payment_status,
        status: session.status,
        amount_total: session.amount_total,
        currency: session.currency,
        customer_email: session.customer_details?.email || null,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
