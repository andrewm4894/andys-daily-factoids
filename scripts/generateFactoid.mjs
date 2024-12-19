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
    // Fetch the last 100 factoids from the database
    const factoidsSnapshot = await db.collection('factoids')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const factoids = factoidsSnapshot.docs.map(doc => doc.data().text);

    // Create the multi-line prompt
    const examples = factoids.join('\n');
    const prompt = `
      Here are some examples of interesting educational facts:

      ${examples}

      Please provide a new, short, interesting educational fact in one or two sentences, along with its subject.
      - The fact should not repeat any of the provided examples.
      - Do not start with "Did you know" - we just want the fact's, no boiler plate as it gets repetitive.
      - The response should return two fields: 
        1. "factoidText": The text of the factoid.
        2. "factoidSubject": The subject or category of the factoid.

      Think about novel and intriguing facts that people might not know.
    `;

    // Use function calling to structure the response
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt.trim() }],
      functions: [{
        name: "generate_factoid",
        description: "Generate an interesting factoid with its subject.",
        parameters: {
          type: "object",
          properties: {
            factoidText: { type: "string", description: "The text of the factoid." },
            factoidSubject: { type: "string", description: "The subject of the factoid." }
          },
          required: ["factoidText", "factoidSubject"]
        }
      }],
      function_call: { name: "generate_factoid" }
    });

    const { factoidText, factoidSubject } = JSON.parse(response.choices[0].message.function_call.arguments);

    // Save the generated factoid to Firestore
    const docRef = await db.collection('factoids').add({
      text: factoidText,
      subject: factoidSubject,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      votesUp: 0,
      votesDown: 0,
    });

    console.log(`Factoid generated and stored. ID: ${docRef.id}`);
    console.log(`Subject: ${factoidSubject}`);
    console.log(`Factoid: ${factoidText}`);
  } catch (error) {
    console.error('Error generating factoid:', error);
    process.exit(1);
  }
})();
