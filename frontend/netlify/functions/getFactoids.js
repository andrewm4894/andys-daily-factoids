const admin = require('firebase-admin');

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

exports.handler = async (event, context) => {
  const snapshot = await db.collection('factoids')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
  const factoids = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  return {
    statusCode: 200,
    body: JSON.stringify(factoids)
  };
};
