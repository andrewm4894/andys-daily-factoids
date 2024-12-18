// netlify/functions/getFactoids.js
import admin from 'firebase-admin';

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

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' }, // Allow CORS
      body: JSON.stringify({ error: 'Method not allowed. Use GET.' }),
    };
  }

  try {
    const snapshot = await db.collection('factoids').orderBy('createdAt', 'desc').limit(500).get();
    const factoids = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' }, // Allow CORS
      body: JSON.stringify(factoids),
    };
  } catch (error) {
    console.error('Error fetching factoids:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }, // Allow CORS
      body: JSON.stringify({ error: 'Failed to fetch factoids' }),
    };
  }
};
