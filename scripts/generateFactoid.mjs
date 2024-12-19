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
    const prompt = "Provide a short, interesting educational fact in one or two sentences. Think about some novel and intriguing facts that people might not know.";
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
