import admin from 'firebase-admin';
import { OpenAI } from 'openai';

// Initialize Firebase Admin SDK if not initialized
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  // Require secret token
  const providedToken = event.queryStringParameters?.token;
  const validToken = process.env.GENERATE_FACTOID_SECRET;
  
  if (providedToken !== validToken) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Forbidden: invalid token.' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  try {
    const prompt = "Provide a short, interesting educational fact in one sentence.";
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: 0.7,
    });

    const factoidText = response.choices[0].message.content.trim();

    const docRef = await db.collection('factoids').add({
      text: factoidText,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      votesUp: 0,
      votesDown: 0,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Factoid generated and stored',
        factoid: factoidText,
        id: docRef.id,
      }),
    };
  } catch (error) {
    console.error('Error generating factoid:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate and store factoid' }),
    };
  }
};
