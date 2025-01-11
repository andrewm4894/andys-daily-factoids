// netlify/functions/verifyPayment.js
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const { sessionId } = JSON.parse(event.body);
    if (!sessionId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing sessionId" }),
      };
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Check payment status
    // "paid" indicates the payment was successful
    if (session.payment_status === "paid") {
      return {
        statusCode: 200,
        body: JSON.stringify({ paymentStatus: "paid" }),
      };
    } else {
      // Could be "unpaid", "no_payment_required" or something else
      return {
        statusCode: 200,
        body: JSON.stringify({ paymentStatus: session.payment_status }),
      };
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
