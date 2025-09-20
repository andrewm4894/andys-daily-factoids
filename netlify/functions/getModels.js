// netlify/functions/getModels.js
import 'dotenv/config';
import { getAvailableModels } from './modelConfig.js';

// Function to get available models
export async function handler(event) {
    // Handle the preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, GET',
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
                'Access-Control-Allow-Methods': 'OPTIONS, GET',
            },
            body: JSON.stringify({ error: 'Unauthorized' }),
        };
    }

    try {
        const models = await getAvailableModels();

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, GET',
            },
            body: JSON.stringify({ models }),
        };
    } catch (error) {
        console.error('Error getting models:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, GET',
            },
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
}
