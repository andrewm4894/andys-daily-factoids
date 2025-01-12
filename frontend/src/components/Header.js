// frontend/src/components/Header.js
import React from "react";

const Header = () => {
  return (
    <header className="App-header">
      <h1>Andy's Daily Factoids 🤯</h1>
      <a
        href="https://github.com/andrewm4894/andys-daily-factoids/blob/main/netlify/functions/generateFactoid.js"
        target="_blank"
        rel="noopener noreferrer"
      >
        (llm powered of course)
      </a>
    </header>
  );
};

export default Header;
