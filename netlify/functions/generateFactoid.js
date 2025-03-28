// netlify/functions/generateFactoid.js
import 'dotenv/config';
import { OpenAI } from 'openai';
import admin from 'firebase-admin';

// Get Firebase credentials from environment variables
const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

// Initialize Firebase Admin if not already initialized
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

// Function to generate a new factoid
export async function handler(event) {
    // Handle the preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*', // Allow all domains
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, POST',
            },
            body: JSON.stringify({}),
        };
    }

    const API_KEY = process.env.FUNCTIONS_API_KEY;

    // Check for valid API key
    const providedKey = event.headers['x-api-key'];
    if (!providedKey || providedKey !== API_KEY) {
        return {
            statusCode: 401,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, POST',
            },
            body: JSON.stringify({ error: 'Unauthorized' }),
        };
    }

    try {

        // Fetch some recent factoids to provide as examples
        const factoidsSnapshot = await db
            .collection('factoids')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();

        const factoids = factoidsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                text: data.text,
                votesUp: data.votesUp,
                votesDown: data.votesDown,
            };
        });

        const examples = factoids.map((factoid) => `- ${factoid.text} (votes up = ${factoid.votesUp}, votes down = ${factoid.votesDown})`).join('\n');
        
        // Prompt to generate a new factoid
        const prompt = `
Here are some examples of interesting factoids (note the votes up and down counts which comes from user feedback):

## Examples:

${examples}

Please provide a new, concise, interesting fact in one sentence, along with its subject and an emoji that represents the fact.
- Do not repeat any of the provided examples.
- Do not start with "Did you know" - we just want the fact's, no boilerplate as it gets repetitive.
- Minimal commentary, just the facts.
- Don't tell us what the factoid "showcases" as that's often considered commentary too.
- No commentary about what the fact "reflects" or "highlights" as that's also usually commentary we don't want.
- Things not to mention:
  - jellyfish
  - octopus
  - whales
- Bonus points if it's unlike anything in the examples above.
- Try to come up with something new that's not similar to any of the examples or something that's more novel than usual facts we come across on the internet.
- The response should return three fields: 
  1. "factoidText": The text of the factoid.
  2. "factoidSubject": The subject or category of the factoid.
  3. "factoidEmoji": An emoji that represents the factoid.

Think about novel and intriguing facts that people might not know.
    `;

        // Use function calling to structure the response
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt.trim() }],
            functions: [
                {
                    name: 'generate_factoid',
                    description: 'Generate an interesting factoid with its subject and an emoji.',
                    parameters: {
                        type: 'object',
                        properties: {
                            factoidText: { type: 'string', description: 'The text of the factoid.' },
                            factoidSubject: { type: 'string', description: 'The subject of the factoid.' },
                            factoidEmoji: { type: 'string', description: 'An emoji representing the factoid.' },
                        },
                        required: ['factoidText', 'factoidSubject', 'factoidEmoji'],
                    },
                },
            ],
            function_call: { name: 'generate_factoid' },
        });

        // Parse the response to get the generated factoid
        const { factoidText, factoidSubject, factoidEmoji } = JSON.parse(
            response.choices[0].message.function_call.arguments
        );

        // Log the generated factoid for debugging purposes
        console.log(`Subject: ${factoidSubject}`);
        console.log(`Emoji: ${factoidEmoji}`);
        console.log(`Generated Factoid: ${factoidText}`);

        // Save the generated factoid to Firestore
        const docRef = await db.collection('factoids').add({
            text: factoidText,
            subject: factoidSubject,
            emoji: factoidEmoji,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            votesUp: 0,
            votesDown: 0,
        });

        // Return the generated factoid as a JSON response (with CORS)
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, POST',
            },
            body: JSON.stringify({
                id: docRef.id,
                factoidText,
                factoidSubject,
                factoidEmoji,
            }),
        };
    } catch (error) {
        console.error('Error generating factoid:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, POST',
            },
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
}
