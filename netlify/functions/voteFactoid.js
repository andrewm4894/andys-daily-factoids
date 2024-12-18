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
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  try {
    const { factoidId, voteType } = JSON.parse(event.body);

    if (!factoidId || !voteType || !['up', 'down'].includes(voteType)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid request body' }),
      };
    }

    const factoidRef = db.collection('factoids').doc(factoidId);
    const factoidSnap = await factoidRef.get();

    if (!factoidSnap.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Factoid not found' }),
      };
    }

    const increment = admin.firestore.FieldValue.increment(1);
    const updateData = voteType === 'up' ? { votesUp: increment } : { votesDown: increment };
    await factoidRef.update(updateData);

    const updatedFactoid = (await factoidRef.get()).data();
    updatedFactoid.id = factoidId;

    return {
      statusCode: 200,
      body: JSON.stringify(updatedFactoid),
    };
  } catch (error) {
    console.error('Error voting on factoid:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update factoid vote' }),
    };
  }
};
