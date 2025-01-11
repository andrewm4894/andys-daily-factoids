// frontend/src/App.js
import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import "./App.css";
import FactoidCard from "./components/FactoidCard";

function App() {
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [factoids, setFactoids] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedFactoid, setGeneratedFactoid] = useState(null);

    const API_BASE_URL =
        process.env.REACT_APP_API_BASE_URL || "https://andys-daily-factoids.com";

    // === Fetch existing factoids on page load ===
    useEffect(() => {
        const fetchFactoids = async () => {
            setLoading(true);
            try {
                const response = await fetch(
                    `${API_BASE_URL}/.netlify/functions/getFactoids`
                );
                if (!response.ok) {
                    throw new Error(`Error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                setFactoids(data);
            } catch (err) {
                console.error("Failed to fetch factoids:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchFactoids();
    }, [API_BASE_URL]);

    // === Voting logic ===
    const handleVote = async (id, voteType) => {
        try {
            const response = await fetch(
                `${API_BASE_URL}/.netlify/functions/voteFactoid`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ factoidId: id, voteType }),
                }
            );
            if (!response.ok) {
                throw new Error(`Vote failed: ${response.status} ${response.statusText}`);
            }
            const updatedFactoid = await response.json();
            setFactoids((prev) =>
                prev.map((f) => (f.id === updatedFactoid.id ? updatedFactoid : f))
            );
        } catch (err) {
            console.error("Failed to vote:", err);
            alert("Failed to register your vote. Please try again.");
        }
    };

    // === Shuffle factoids ===
    const shuffleFactoids = () => {
        const shuffled = [...factoids].sort(() => Math.random() - 0.5);
        setFactoids(shuffled);
    };

    // === Generate new factoid (calls Netlify) ===
    const handleGenerateFactoid = async () => {
        setIsGenerating(true);
        setGeneratedFactoid(null);
        try {
            const response = await fetch(
                `${API_BASE_URL}/.netlify/functions/generateFactoid`,
                {
                    method: "POST",
                    headers: {
                        "x-api-key": process.env.REACT_APP_FUNCTIONS_API_KEY || "",
                    },
                }
            );
            if (!response.ok) {
                throw new Error(
                    `Error generating factoid: ${response.status} ${response.statusText}`
                );
            }
            const data = await response.json();
            // data: { id, factoidText, factoidSubject, factoidEmoji }
            setGeneratedFactoid(data);
            setModalIsOpen(true);
        } catch (err) {
            console.error("Failed to generate factoid:", err);
            alert("Failed to generate factoid. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    // === Loading / error states ===
    if (loading) {
        return (
            <div className="App">
                <header className="App-header">
                    <h1>Andy's Daily Factoids 🤯</h1>
                    <p>(llm powered of course)</p>
                </header>
                <p>Loading factoids...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="App">
                <header className="App-header">
                    <h1>Andy's Daily Factoids 🤯</h1>
                    <p>(llm powered of course)</p>
                </header>
                <p style={{ color: "red" }}>Error: {error}</p>
            </div>
        );
    }

    // === Main UI ===
    return (
        <div className="App">
            <header className="App-header">
                <h1>Andy's Daily Factoids 🤯</h1>
                <a
                    href="https://github.com/andrewm4894/andys-daily-factoids/blob/main/scripts/generateFactoid.mjs"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    (llm powered of course)
                </a>
            </header>

            <div className="factoid-list">
                <div className="button-container">
                    <button
                        className="factoid-button generate-button"
                        onClick={handleGenerateFactoid}
                        disabled={isGenerating}
                    >
                        {isGenerating ? "Generating...🪄" : "Generate Factoid 🧙"}
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
                        <FactoidCard factoid={factoid} onVote={handleVote} key={factoid.id} />
                    ))
                ) : (
                    <p>No factoids available.</p>
                )}
            </div>

            {/*
        Modal that appears after generateFactoid is done. 
        The user can close it. If they refresh the page, 
        they will see the newly created factoid on the homepage.
      */}
            <Modal
                isOpen={modalIsOpen}
                onRequestClose={() => setModalIsOpen(false)}
                contentLabel="Generated Factoid Modal"
                style={{
                    content: {
                        color: "#333",
                        top: "50%",
                        left: "50%",
                        right: "auto",
                        bottom: "auto",
                        marginRight: "-50%",
                        transform: "translate(-50%, -50%)",
                        padding: "20px",
                        borderRadius: "10px",
                        border: "1px solid #ccc",
                        background: "#fff",
                        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
                        width: "80%",
                        maxWidth: "700px",
                        minHeight: "300px",
                        overflow: "auto",
                    },
                    overlay: {
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                    },
                }}
            >
                {isGenerating ? (
                    <p>Generating a new factoid...🪄</p>
                ) : generatedFactoid ? (
                    <>
                        <h2>New Factoid Generated!</h2>
                        {/* Reuse FactoidCard to show what we got back */}
                        <FactoidCard
                            factoid={{
                                id: generatedFactoid.id,
                                text: generatedFactoid.factoidText,
                                subject: generatedFactoid.factoidSubject,
                                emoji: generatedFactoid.factoidEmoji,
                                // Hardcode new factoid vote counts (0)
                                votesUp: 0,
                                votesDown: 0,
                            }}
                            // We'll pass a no-op for onVote, since we want the user
                            // to refresh before actually voting.
                            onVote={() => { }}
                            initiallyRevealed={true}
                        />
                        <p>
                            <em>
                                Close and refresh the page to see this new factoid on the homepage.
                            </em>
                        </p>
                    </>
                ) : (
                    <p>Something went wrong, please try again.</p>
                )}
                <button onClick={() => setModalIsOpen(false)}>Close</button>
            </Modal>
        </div>
    );
}

export default App;
