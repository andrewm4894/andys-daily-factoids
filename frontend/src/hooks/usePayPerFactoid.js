// frontend/src/hooks/usePayPerFactoid.js
import { useState, useEffect } from "react";
import { getStripe } from "../stripe";

export function usePayPerFactoid({ generateFactoid }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionVerified, setSessionVerified] = useState(false);
  const [hasVerifiedSession, setHasVerifiedSession] = useState(false);

  // Detect Stripe session on page load
  useEffect(() => {

    if (hasVerifiedSession) return; // skip if already ran

    const queryParams = new URLSearchParams(window.location.search);
    const sessionId = queryParams.get("session_id");
    const canceled = queryParams.get("canceled");

    if (sessionId && !canceled) {
        verifyPayment(sessionId).then((paid) => {
          if (paid) {
            generateFactoid().then(() => {
              setSessionVerified(true);
              setHasVerifiedSession(true);
    
              window.history.replaceState({}, document.title, window.location.pathname);
            });
          } else {
            alert("Payment not verified. Please try again.");
          }
        });
      }
    }, [generateFactoid, hasVerifiedSession]);

  // Creates a new Stripe Checkout Session and redirects for payment
  const handlePayAndGenerateFactoid = async (priceId) => {
    setIsProcessing(true);
    try {
      const response = await fetch("/.netlify/functions/createCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          successUrl:
            window.location.origin + "/?session_id={CHECKOUT_SESSION_ID}",
          cancelUrl: window.location.origin + "/?canceled=true",
        }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const stripe = await getStripe();
      const { error } = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });

      if (error) {
        console.warn("Stripe redirect failed", error);
        alert(error.message);
      }
    } catch (err) {
      console.error("Error creating checkout session:", err);
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper function to verify the Stripe session
  async function verifyPayment(sessionId) {
    try {
      const response = await fetch("/.netlify/functions/verifyPayment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const { paymentStatus, error } = await response.json();
      if (error) throw new Error(error);

      return paymentStatus === "paid";
    } catch (err) {
      console.error("Error verifying payment:", err);
      return false;
    }
  }

  return {
    isProcessing,
    sessionVerified,
    handlePayAndGenerateFactoid,
  };
}
