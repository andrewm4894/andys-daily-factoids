// scripts/generateFactoid.mjs
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: './frontend/.env' });

async function generateFactoid() {
  const NETLIFY_FUNCTION_URL = process.env.NETLIFY_FUNCTION_URL || "https://andys-daily-factoids.com/.netlify/functions/generateFactoid";
  const FUNCTIONS_API_KEY = process.env.FUNCTIONS_API_KEY;

  if (!NETLIFY_FUNCTION_URL || !FUNCTIONS_API_KEY) {
    console.error("Error: Missing NETLIFY_FUNCTION_URL or FUNCTIONS_API_KEY in environment variables.");
    process.exit(1);
  }

  try {
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': FUNCTIONS_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`Error: Failed to generate factoid. Status: ${response.status}`);
      const errorText = await response.text();
      console.error(`Response: ${errorText}`);
      process.exit(1);
    }

    const factoid = await response.json();
    console.log("Factoid generated successfully:");
    console.log(`ID: ${factoid.id}`);
    console.log(`Factoid: ${factoid.factoidText}`);
    console.log(`Subject: ${factoid.factoidSubject}`);
    console.log(`Emoji: ${factoid.factoidEmoji}`);
  } catch (error) {
    console.error("Error: Unable to generate factoid.", error);
    process.exit(1);
  }
}

// Execute the script
generateFactoid();
