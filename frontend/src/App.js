// frontend/src/App.js
import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import { getStripe } from "./stripe";

import "./App.css";

import { useFactoids } from "./hooks/useFactoids";
import { useGenerateFactoid } from "./hooks/useGenerateFactoid";

import Header from "./components/Header";
import Loader from "./components/Loader";
import ErrorMessage from "./components/ErrorMessage";
import FactoidCard from "./components/FactoidCard";

import { customModalStyles } from "./styles/ModalStyles"; // optional

function App() {
  const API_BASE_URL =
    process.env.REACT_APP_API_BASE_URL || "https://andys-daily-factoids.com";

  // Stripe price ID for “pay per factoid”
  const priceId = "price_1QgDv7RiHmpzPgOD6eti4W83";

  // Track loading states
  const [isProcessing, setIsProcessing] = useState(false);
  const [modalIsOpen, setModalIsOpen] = useState(false);

  // Hooks for factoids
  const {
    factoids,
    loading,
    error,
    fetchFactoids,
    voteFactoid,
    shuffleFactoids,
  } = useFactoids(API_BASE_URL);

  // Hooks for generating a new factoid
  const {
    isGenerating,
    generatedFactoid,
    generateFactoid,
    setGeneratedFactoid,
  } = useGenerateFactoid(API_BASE_URL);

  // When the user comes back from Stripe, we check the URL for a session_id.
  // If present, we assume payment was successful and then generate a factoid.
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const sessionId = queryParams.get("session_id");
    const canceled = queryParams.get("canceled");

    // If user just got back from successful Stripe checkout:
    if (sessionId && !canceled) {
      // Generate a new factoid
      generateFactoid().then(() => {
        // Once generated, open the modal
        setModalIsOpen(true);

        // Optionally, clean up the URL so it doesn't permanently show session_id
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }
  }, [generateFactoid]);

  // Handle the “Generate Factoid” button. This first creates a Stripe Checkout Session,
  // then redirects the user to Stripe for payment.
  const handlePayAndGenerateFactoid = async () => {
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

      // Redirect to Stripe Checkout
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

  // Closes the modal and refreshes the factoids list
  const handleCloseModal = () => {
    setModalIsOpen(false);
    setGeneratedFactoid(null);
    fetchFactoids();
  };

  // === Loading states ===
  if (loading) {
    return (
      <div className="App">
        <Header />
        <Loader message="Loading factoids..." />
      </div>
    );
  }

  // === Error state ===
  if (error) {
    return (
      <div className="App">
        <Header />
        <ErrorMessage error={error} />
      </div>
    );
  }

  // === Main UI ===
  return (
    <div className="App">
      <Header />

      <div className="factoid-list">
        <div className="button-container">
          <button
            className="factoid-button generate-button"
            onClick={handlePayAndGenerateFactoid}
            disabled={isProcessing || isGenerating}
          >
            {isProcessing
              ? "Processing Payment..."
              : isGenerating
              ? "Generating...🪄"
              : "Generate Factoid 🧙"}
          </button>
          <button
            className="factoid-button transparent-button"
            title="shuffle"
            onClick={shuffleFactoids}
          >
            🔀
          </button>
        </div>

        {factoids.length > 0 ? (
          factoids.map((factoid) => (
            <FactoidCard
              key={factoid.id}
              factoid={factoid}
              onVote={voteFactoid}
            />
          ))
        ) : (
          <p>No factoids available.</p>
        )}
      </div>

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={handleCloseModal}
        contentLabel="Generated Factoid Modal"
        style={customModalStyles}
      >
        {isGenerating ? (
          <p>Generating a new factoid...🪄</p>
        ) : generatedFactoid ? (
          <>
            <h2>New Factoid Generated!</h2>
            <FactoidCard
              factoid={{
                id: generatedFactoid.id,
                text: generatedFactoid.factoidText,
                subject: generatedFactoid.factoidSubject,
                emoji: generatedFactoid.factoidEmoji,
                votesUp: 0,
                votesDown: 0,
              }}
              onVote={() => {}}
              initiallyRevealed={true}
            />
            <p>
              <em>
                Close and refresh the page to see this new factoid on the
                homepage.
              </em>
            </p>
          </>
        ) : (
          <p>Something went wrong, please try again.</p>
        )}
        <button onClick={handleCloseModal}>Close</button>
      </Modal>
    </div>
  );
}

export default App;
