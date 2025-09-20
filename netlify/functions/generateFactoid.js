// netlify/functions/generateFactoid.js
import 'dotenv/config';
import OpenAI from 'openai';
import { OpenAI as PostHogOpenAI } from '@posthog/ai/openai';
import { PostHog } from 'posthog-node';
import admin from 'firebase-admin';
import {
    getAvailableModels,
    getRandomParameters,
    getDefaultParameters,
    mergeWithModelDefaults,
} from './modelConfig.js';
import { checkRateLimit, recordGeneration } from './checkRateLimit.js';

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

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const POSTHOG_PROJECT_API_KEY = process.env.POSTHOG_PROJECT_API_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
const POSTHOG_LLM_APP_NAME = process.env.POSTHOG_LLM_APP_NAME || 'factoid-generator';

const DEFAULT_CONTEXT_TOKEN_FALLBACK = 16000;
const PROMPT_TOKEN_BUFFER_MIN = 512;
const PROMPT_TOKEN_BUFFER_RATIO = 0.1;
const MAX_COMPLETION_TOKEN_CAP = 4096;
const MAX_COMPLETION_RATIO = 0.6;
const MIN_COMPLETION_TOKENS = 100;

class FactoidParsingError extends Error {
    constructor(message, details = null) {
        super(message);
        this.name = 'FactoidParsingError';
        this.statusCode = 422;
        this.details = details;
    }
}

function createPreview(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string') {
        return value.slice(0, 200);
    }

    try {
        return JSON.stringify(value, null, 2).slice(0, 200);
    } catch (error) {
        return '[unserializable preview]';
    }
}

function parseJsonContent(rawContent) {
    if (typeof rawContent !== 'string') {
        return null;
    }

    const trimmed = rawContent.trim();
    if (!trimmed) {
        return null;
    }

    const attempts = [];

    // If wrapped in a code fence, try just the inner content first
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
        attempts.push(fenceMatch[1].trim());
    }

    attempts.push(trimmed);

    // Attempt to find the first balanced JSON object inside the content
    const jsonSubstring = findFirstJsonSubstring(trimmed);
    if (jsonSubstring) {
        attempts.push(jsonSubstring.trim());
    }

    for (const attempt of attempts) {
        if (!attempt) {
            continue;
        }
        try {
            return JSON.parse(attempt);
        } catch (error) {
            // Continue trying other candidates
        }
    }

    return null;
}

function findFirstJsonSubstring(content) {
    let inString = false;
    let escapeNext = false;
    let depth = 0;
    let startIndex = -1;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if (inString) {
            if (escapeNext) {
                escapeNext = false;
            } else if (char === '\\') {
                escapeNext = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') {
            if (depth === 0) {
                startIndex = i;
            }
            depth++;
        } else if (char === '}') {
            if (depth > 0) {
                depth--;
                if (depth === 0 && startIndex !== -1) {
                    return content.slice(startIndex, i + 1);
                }
            }
        }
    }

    return null;
}

function estimateTokenCountFromText(text) {
    if (!text) {
        return 0;
    }
    return Math.ceil(text.length / 4);
}

function getExampleLimitForContext(contextTokens) {
    const ctx = contextTokens ?? DEFAULT_CONTEXT_TOKEN_FALLBACK;
    if (ctx <= 4096) {
        return 12;
    }
    if (ctx <= 8192) {
        return 18;
    }
    if (ctx <= 16384) {
        return 25;
    }
    if (ctx <= 32768) {
        return 40;
    }
    if (ctx <= 65536) {
        return 60;
    }
    if (ctx <= 131072) {
        return 80;
    }
    return 100;
}

function clampParametersForContext(parameters, contextTokens, promptText) {
    const effectiveContext = contextTokens ?? DEFAULT_CONTEXT_TOKEN_FALLBACK;
    const promptTokens = estimateTokenCountFromText(promptText);
    const bufferFromRatio = Math.floor(effectiveContext * PROMPT_TOKEN_BUFFER_RATIO);
    const promptBuffer = Math.max(PROMPT_TOKEN_BUFFER_MIN, bufferFromRatio);
    const residualBudget = Math.max(
        MIN_COMPLETION_TOKENS,
        effectiveContext - promptTokens - promptBuffer
    );
    const ratioBudget = Math.max(
        MIN_COMPLETION_TOKENS,
        Math.floor(effectiveContext * MAX_COMPLETION_RATIO)
    );
    const requestedMax = typeof parameters.max_tokens === 'number'
        ? parameters.max_tokens
        : MIN_COMPLETION_TOKENS;
    const safeMaxTokens = Math.max(
        MIN_COMPLETION_TOKENS,
        Math.min(requestedMax, residualBudget, ratioBudget, MAX_COMPLETION_TOKEN_CAP)
    );

    return {
        ...parameters,
        max_tokens: safeMaxTokens,
    };
}

function validateFactoidPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new FactoidParsingError('Model response was not a JSON object.', {
            payloadPreview: createPreview(payload),
        });
    }

    const cleaned = {
        factoidText: typeof payload.factoidText === 'string' ? payload.factoidText.trim() : '',
        factoidSubject: typeof payload.factoidSubject === 'string' ? payload.factoidSubject.trim() : '',
        factoidEmoji: typeof payload.factoidEmoji === 'string' ? payload.factoidEmoji.trim() : '',
    };

    const errors = [];

    if (!cleaned.factoidText) {
        errors.push('factoidText must be a non-empty string');
    }
    if (!cleaned.factoidSubject) {
        errors.push('factoidSubject must be a non-empty string');
    }
    if (!cleaned.factoidEmoji) {
        errors.push('factoidEmoji must be a non-empty string');
    }

    if (errors.length) {
        throw new FactoidParsingError('Generated factoid did not match the expected schema.', {
            errors,
            payloadPreview: createPreview(payload),
        });
    }

    return cleaned;
}

function createClients() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('Missing OPENROUTER_API_KEY environment variable');
    }

    if (!POSTHOG_PROJECT_API_KEY) {
        return {
            openaiClient: new OpenAI({
                apiKey,
                baseURL: OPENROUTER_BASE_URL,
            }),
            posthogClient: null,
        };
    }

    const posthogClient = new PostHog(POSTHOG_PROJECT_API_KEY, {
        host: POSTHOG_HOST,
    });

    const openaiClient = new PostHogOpenAI({
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        posthog: posthogClient,
    });

    return { openaiClient, posthogClient };
}

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
    let posthogClient = null;
    let openaiClient = null;

    try {
        // Check rate limit first
        const rateLimitStatus = await checkRateLimit(event);
        
        if (!rateLimitStatus.isAllowed) {
            return {
                statusCode: 429,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                    'Access-Control-Allow-Methods': 'OPTIONS, POST',
                    'Retry-After': rateLimitStatus.resetTime ? Math.ceil((rateLimitStatus.resetTime - Date.now()) / 1000) : 3600
                },
                body: JSON.stringify({ 
                    error: 'Rate limit exceeded',
                    message: `You have reached the limit of ${rateLimitStatus.limit} free factoid generations per hour. Please try again later or upgrade to generate more.`,
                    rateLimitInfo: {
                        currentUsage: rateLimitStatus.currentUsage,
                        limit: rateLimitStatus.limit,
                        remainingGenerations: rateLimitStatus.remainingGenerations,
                        resetTime: rateLimitStatus.resetTime
                    }
                }),
            };
        }

        // Parse request body to get model and parameter preferences
        const body = event.body ? JSON.parse(event.body) : {};
        const useRandomParams = body.useRandomParams !== false; // Default to true
        const customParams = body.parameters || {};

        const availableModels = await getAvailableModels();
        if (!availableModels.length) {
            throw new Error('No models available from OpenRouter');
        }

        const modelIds = new Set(availableModels.map((model) => model.id));

        let selectedModel = body.model;
        if (!selectedModel || !modelIds.has(selectedModel)) {
            if (selectedModel && !modelIds.has(selectedModel)) {
                console.warn(`Requested model ${selectedModel} unavailable. Selecting a random model.`);
            }
            const randomIndex = Math.floor(Math.random() * availableModels.length);
            selectedModel = availableModels[randomIndex].id;
        }

        const modelConfig = availableModels.find((model) => model.id === selectedModel);
        if (!modelConfig) {
            throw new Error(`Model ${selectedModel} configuration not found`);
        }

        const parameters = useRandomParams
            ? await getRandomParameters(selectedModel)
            : mergeWithModelDefaults(await getDefaultParameters(selectedModel), customParams);

        const prefersFunctionTools = /openai\/gpt-4o(:|$)/.test(selectedModel);

        const clients = createClients();
        openaiClient = clients.openaiClient;
        posthogClient = clients.posthogClient;

        // Fetch some recent factoids to provide as examples
        const exampleLimit = getExampleLimitForContext(modelConfig.contextTokens);
        const factoidsSnapshot = await db
            .collection('factoids')
            .orderBy('createdAt', 'desc')
            .limit(exampleLimit)
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

        const adjustedParameters = clampParametersForContext(parameters, modelConfig.contextTokens, prompt);

        const parametersForLogging = {
            ...adjustedParameters,
            functionMode: modelConfig.supportsFunctionCalling && !prefersFunctionTools ? 'function_call' : prefersFunctionTools ? 'tools' : 'none',
        };

        console.log(`Using model: ${selectedModel} (${modelConfig.name || modelConfig.id})`);
        console.log(`Parameters:`, parametersForLogging);

        let factoidText, factoidSubject, factoidEmoji;
        let response;

        const requestHeaders = event.headers || {};
        const sharedPosthogOptions = posthogClient
            ? {
                  posthogDistinctId: rateLimitStatus.clientIP || POSTHOG_LLM_APP_NAME,
                  posthogTraceId: requestHeaders['x-nf-request-id'] || requestHeaders['x-request-id'],
                  posthogProperties: {
                      requestSource: 'netlify-generateFactoid',
                      modelKey: selectedModel,
                      modelName: modelConfig.name,
                      provider: modelConfig.provider,
                      parameterStrategy: useRandomParams ? 'random' : 'custom',
                  },
              }
            : {};

        // Generate factoid based on model capabilities
        if (modelConfig.supportsFunctionCalling && !prefersFunctionTools) {
            // Use function calling for models that support it
            const completionParams = {
                model: selectedModel,
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
                ...adjustedParameters,
                ...sharedPosthogOptions,
            };

            response = await openaiClient.chat.completions.create(completionParams);

            const functionCall = response.choices[0].message.function_call;
            if (functionCall && functionCall.arguments) {
                let parsedArguments;
                try {
                    parsedArguments = JSON.parse(functionCall.arguments);
                } catch (parseError) {
                    throw new FactoidParsingError('Model returned malformed JSON during function call.', {
                        rawPreview: createPreview(functionCall.arguments),
                    });
                }

                const validated = validateFactoidPayload(parsedArguments);
                factoidText = validated.factoidText;
                factoidSubject = validated.factoidSubject;
                factoidEmoji = validated.factoidEmoji;
            } else {
                throw new FactoidParsingError('Model did not return a function call payload.');
            }
        } else {
            // Use structured prompt for models that don't support function calling
            const structuredPrompt = `${prompt}

Please respond in the following JSON format:
{
  "factoidText": "Your factoid text here",
  "factoidSubject": "Subject category",
  "factoidEmoji": "🎯"
}`;

            const completionParams = {
                model: selectedModel,
                messages: [{ role: 'user', content: structuredPrompt.trim() }],
                ...adjustedParameters,
                ...sharedPosthogOptions,
            };

            response = await openaiClient.chat.completions.create(completionParams);

            const content = response.choices[0].message.content;
            const parsed = parseJsonContent(content);
            if (!parsed) {
                throw new FactoidParsingError('Model response did not contain valid JSON.', {
                    rawPreview: createPreview(content),
                });
            }

            const validated = validateFactoidPayload(parsed);
            factoidText = validated.factoidText;
            factoidSubject = validated.factoidSubject;
            factoidEmoji = validated.factoidEmoji;
        }

        // Log the generated factoid for debugging purposes
        console.log(`Subject: ${factoidSubject}`);
        console.log(`Emoji: ${factoidEmoji}`);
        console.log(`Generated Factoid: ${factoidText}`);

        // Prepare generation metadata
        const generationMetadata = {
            model: selectedModel,
            modelName: modelConfig.name,
            provider: modelConfig.provider,
            parameters: adjustedParameters,
            timestamp: new Date().toISOString(),
            costPer1kTokens: modelConfig.costPer1kTokens,
        };

        // Save the generated factoid to Firestore with metadata
        const docRef = await db.collection('factoids').add({
            text: factoidText,
            subject: factoidSubject,
            emoji: factoidEmoji,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            votesUp: 0,
            votesDown: 0,
            generationMetadata: generationMetadata,
        });

        // Record this generation for rate limiting
        await recordGeneration(event);

        // Get updated rate limit status for response
        const updatedRateLimitStatus = await checkRateLimit(event);

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
                generationMetadata,
                rateLimitInfo: {
                    currentUsage: updatedRateLimitStatus.currentUsage,
                    limit: updatedRateLimitStatus.limit,
                    remainingGenerations: updatedRateLimitStatus.remainingGenerations,
                    resetTime: updatedRateLimitStatus.resetTime
                }
            }),
        };
    } catch (error) {
        console.error('Error generating factoid:', error);
        const isParsingError = error instanceof FactoidParsingError;
        return {
            statusCode: isParsingError ? error.statusCode : 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
                'Access-Control-Allow-Methods': 'OPTIONS, POST',
            },
            body: JSON.stringify(
                isParsingError
                    ? {
                          error: 'The AI response was invalid and could not be parsed into a factoid. Please try again.',
                          details: error.details || null,
                      }
                    : { error: 'Internal Server Error' }
            ),
        };
    } finally {
        if (posthogClient) {
            try {
                await posthogClient.shutdown();
            } catch (shutdownError) {
                console.warn('Failed to flush PostHog events', shutdownError);
            }
        }
    }
}
