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

    // Create the prompt with the last 100 factoids
    const examples = factoids.join('\n');
    const prompt = `Here are some examples of interesting educational facts:\n${examples}\n\nProvide a short, interesting educational fact in one or two sentences. Do not repeat any of the provided facts. Think about some novel and intriguing facts that people might not know. Do not start with "Did you know" - we just want the fact's, no boiler plate as it gets repetitive.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    });

    const factoidText = response.choices[0].message.content.trim();

    const docRef = await db.collection('factoids').add({
      text: factoidText,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      votesUp: 0,
      votesDown: 0,
    });

    console.log(`Factoid generated and stored. ID: ${docRef.id}`);
    console.log(`Factoid: ${factoidText}`);
  } catch (error) {
    console.error('Error generating factoid:', error);
    process.exit(1);
  }
})();
