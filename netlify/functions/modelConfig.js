// Model configuration for multi-provider factoid generation
export const MODEL_CONFIGS = {
  // OpenAI Models
  'openai/gpt-4o-mini': {
    provider: 'OpenAI',
    name: 'GPT-4o Mini',
    maxTokens: 4096,
    temperature: { min: 0.1, max: 2.0, default: 0.7 },
    topP: { min: 0.1, max: 1.0, default: 0.9 },
    supportsFunctionCalling: true,
    costPer1kTokens: 0.00015, // Approximate
  },
  'openai/gpt-4o': {
    provider: 'OpenAI',
    name: 'GPT-4o',
    maxTokens: 4096,
    temperature: { min: 0.1, max: 2.0, default: 0.7 },
    topP: { min: 0.1, max: 1.0, default: 0.9 },
    supportsFunctionCalling: true,
    costPer1kTokens: 0.005,
  },
  'openai/gpt-3.5-turbo': {
    provider: 'OpenAI',
    name: 'GPT-3.5 Turbo',
    maxTokens: 4096,
    temperature: { min: 0.1, max: 2.0, default: 0.7 },
    topP: { min: 0.1, max: 1.0, default: 0.9 },
    supportsFunctionCalling: true,
    costPer1kTokens: 0.0005,
  },

  // Anthropic Models
  'anthropic/claude-3-5-sonnet-20241022': {
    provider: 'Anthropic',
    name: 'Claude 3.5 Sonnet',
    maxTokens: 4096,
    temperature: { min: 0.0, max: 1.0, default: 0.7 },
    topP: { min: 0.0, max: 1.0, default: 0.9 },
    supportsFunctionCalling: false,
    costPer1kTokens: 0.003,
  },
  'anthropic/claude-3-haiku-20240307': {
    provider: 'Anthropic',
    name: 'Claude 3 Haiku',
    maxTokens: 4096,
    temperature: { min: 0.0, max: 1.0, default: 0.7 },
    topP: { min: 0.0, max: 1.0, default: 0.9 },
    supportsFunctionCalling: false,
    costPer1kTokens: 0.00025,
  },

  // Google Models
  'google/gemini-pro-1.5': {
    provider: 'Google',
    name: 'Gemini Pro 1.5',
    maxTokens: 8192,
    temperature: { min: 0.0, max: 2.0, default: 0.7 },
    topP: { min: 0.0, max: 1.0, default: 0.9 },
    supportsFunctionCalling: false,
    costPer1kTokens: 0.00125,
  },

  // Meta Models
  'meta-llama/llama-3.1-8b-instruct': {
    provider: 'Meta',
    name: 'Llama 3.1 8B',
    maxTokens: 8192,
    temperature: { min: 0.0, max: 2.0, default: 0.7 },
    topP: { min: 0.0, max: 1.0, default: 0.9 },
    supportsFunctionCalling: false,
    costPer1kTokens: 0.0002,
  },
  'meta-llama/llama-3.1-70b-instruct': {
    provider: 'Meta',
    name: 'Llama 3.1 70B',
    maxTokens: 8192,
    temperature: { min: 0.0, max: 2.0, default: 0.7 },
    topP: { min: 0.0, max: 1.0, default: 0.9 },
    supportsFunctionCalling: false,
    costPer1kTokens: 0.0009,
  },

  // Mistral Models
  'mistralai/mistral-7b-instruct': {
    provider: 'Mistral',
    name: 'Mistral 7B',
    maxTokens: 8192,
    temperature: { min: 0.0, max: 2.0, default: 0.7 },
    topP: { min: 0.0, max: 1.0, default: 0.9 },
    supportsFunctionCalling: false,
    costPer1kTokens: 0.0002,
  },
  'mistralai/mixtral-8x7b-instruct': {
    provider: 'Mistral',
    name: 'Mixtral 8x7B',
    maxTokens: 32768,
    temperature: { min: 0.0, max: 2.0, default: 0.7 },
    topP: { min: 0.0, max: 1.0, default: 0.9 },
    supportsFunctionCalling: false,
    costPer1kTokens: 0.00027,
  },
};

// Function to get a random model
export function getRandomModel() {
  const modelIds = Object.keys(MODEL_CONFIGS);
  return modelIds[Math.floor(Math.random() * modelIds.length)];
}

// Function to get random parameters for a model
export function getRandomParameters(modelId) {
  const config = MODEL_CONFIGS[modelId];
  if (!config) {
    throw new Error(`Model ${modelId} not found in configuration`);
  }

  const temperature = Math.random() * (config.temperature.max - config.temperature.min) + config.temperature.min;
  const topP = Math.random() * (config.topP.max - config.topP.min) + config.topP.min;
  
  return {
    temperature: parseFloat(temperature.toFixed(2)),
    top_p: parseFloat(topP.toFixed(2)),
    max_tokens: Math.min(1000, config.maxTokens), // Limit for factoid generation
  };
}

// Function to get default parameters for a model
export function getDefaultParameters(modelId) {
  const config = MODEL_CONFIGS[modelId];
  if (!config) {
    throw new Error(`Model ${modelId} not found in configuration`);
  }

  return {
    temperature: config.temperature.default,
    top_p: config.topP.default,
    max_tokens: Math.min(1000, config.maxTokens),
  };
}

// Function to get all available models for UI
export function getAvailableModels() {
  return Object.entries(MODEL_CONFIGS).map(([id, config]) => ({
    id,
    name: config.name,
    provider: config.provider,
    supportsFunctionCalling: config.supportsFunctionCalling,
    costPer1kTokens: config.costPer1kTokens,
  }));
}