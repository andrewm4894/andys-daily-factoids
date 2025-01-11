import 'dotenv/config';
import { OpenAI } from 'openai';
import admin from 'firebase-admin';

// Set up Firebase Admin using environment variables
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Set up OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

(async () => {
  try {
    // Fetch the last 250 factoids (with at least one up vote) from the database
    const factoidsSnapshot = await db.collection('factoids')
      .where('votesUp', '>', 0)
      .orderBy('createdAt', 'desc')
      .limit(250)
      .get();

    const factoids = factoidsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        text: data.text
      };
    });

    // Create the multi-line prompt
    const examples = factoids.map(factoid => `- ${factoid.text}`).join('\n');
    const prompt = `
      Here are some examples of interesting factoids:

      ${examples}

      Please provide a new, concise, interesting fact in one sentence, along with its subject and an emoji that represents the fact.
      - Do not repeat any of the provided examples.
      - Do not start with "Did you know" - we just want the fact's, no boiler plate as it gets repetitive.
      - Minimal commentary, just the facts.
      - Don't tell us what the factoid "showcases" as that's often considered commentary too.
      - No commentary about what the fact "reflects" or "highlights" as tjats also usually commentary we don't want.
      - Bonus points if it's unlike anything in the examples above.
      - Try to come up with something new thats not similar to any of the examples.
      - The response should return three fields: 
        1. "factoidText": The text of the factoid.
        2. "factoidSubject": The subject or category of the factoid.
        3. "factoidEmoji": An emoji that represents the factoid.

      Think about novel and intriguing facts that people might not know.
    `;

    // Use function calling to structure the response
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt.trim() }],
      functions: [{
        name: "generate_factoid",
        description: "Generate an interesting factoid with its subject and an emoji.",
        parameters: {
          type: "object",
          properties: {
            factoidText: { type: "string", description: "The text of the factoid." },
            factoidSubject: { type: "string", description: "The subject of the factoid." },
            factoidEmoji: { type: "string", description: "An emoji representing the factoid." }
          },
          required: ["factoidText", "factoidSubject", "factoidEmoji"]
        }
      }],
      function_call: { name: "generate_factoid" }
    });

    const { factoidText, factoidSubject, factoidEmoji } = JSON.parse(response.choices[0].message.function_call.arguments);

    // Save the generated factoid to Firestore
    const docRef = await db.collection('factoids').add({
      text: factoidText,
      subject: factoidSubject,
      emoji: factoidEmoji,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      votesUp: 0,
      votesDown: 0,
    });

    console.log(`Factoid generated and stored. ID: ${docRef.id}`);
    console.log(`Subject: ${factoidSubject}`);
    console.log(`Factoid: ${factoidText}`);
    console.log(`Emoji: ${factoidEmoji}`);
  } catch (error) {
    console.error('Error generating factoid:', error);
    process.exit(1);
  }
})();
