// netlify/functions/modelConfig.js

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
let cachedModels = null;
let cachedAt = 0;

const DEFAULT_PARAMETER_TEMPLATE = {
  temperature: { min: 0.1, max: 2.0, default: 0.7 },
  topP: { min: 0.1, max: 1.0, default: 0.9 },
  maxTokens: { min: 100, max: 1000, default: 750 },
};

const MODEL_PRESETS = {
  'openai/gpt-4o-mini': {
    displayName: 'GPT-4o Mini',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.00015,
    parameters: {
      temperature: { min: 0.1, max: 1.2, default: 0.7 },
      topP: { min: 0.1, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 750 },
    },
  },
  'openai/gpt-4o': {
    displayName: 'GPT-4o',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.005,
    parameters: {
      temperature: { min: 0.1, max: 1.2, default: 0.7 },
      topP: { min: 0.1, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 750 },
    },
  },
  'openai/gpt-3.5-turbo': {
    displayName: 'GPT-3.5 Turbo',
    supportsFunctionCalling: true,
    costPer1kTokens: 0.0005,
    parameters: {
      temperature: { min: 0.1, max: 1.5, default: 0.8 },
      topP: { min: 0.1, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 750 },
    },
  },
  'anthropic/claude-3-5-sonnet': {
    displayName: 'Claude 3.5 Sonnet',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.003,
    parameters: {
      temperature: { min: 0.0, max: 1.0, default: 0.7 },
      topP: { min: 0.0, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 600 },
    },
  },
  'anthropic/claude-3-haiku': {
    displayName: 'Claude 3 Haiku',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.00025,
    parameters: {
      temperature: { min: 0.0, max: 1.0, default: 0.7 },
      topP: { min: 0.0, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 600 },
    },
  },
  'google/gemini-pro-1.5': {
    displayName: 'Gemini Pro 1.5',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.00125,
    parameters: {
      temperature: { min: 0.0, max: 2.0, default: 0.7 },
      topP: { min: 0.0, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 750 },
    },
  },
  'meta-llama/llama-3.1-8b-instruct': {
    displayName: 'Llama 3.1 8B Instruct',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.0002,
    parameters: {
      temperature: { min: 0.0, max: 1.5, default: 0.7 },
      topP: { min: 0.0, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 700 },
    },
  },
  'meta-llama/llama-3.1-70b-instruct': {
    displayName: 'Llama 3.1 70B Instruct',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.0009,
    parameters: {
      temperature: { min: 0.0, max: 1.5, default: 0.7 },
      topP: { min: 0.0, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 700 },
    },
  },
  'mistralai/mistral-7b-instruct': {
    displayName: 'Mistral 7B Instruct',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.0002,
    parameters: {
      temperature: { min: 0.0, max: 1.5, default: 0.7 },
      topP: { min: 0.0, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 600 },
    },
  },
  'mistralai/mixtral-8x7b-instruct': {
    displayName: 'Mixtral 8x7B Instruct',
    supportsFunctionCalling: false,
    costPer1kTokens: 0.00027,
    parameters: {
      temperature: { min: 0.0, max: 1.5, default: 0.7 },
      topP: { min: 0.0, max: 1.0, default: 0.9 },
      maxTokens: { min: 100, max: 1000, default: 700 },
    },
  },
};

function baseModelKey(modelId) {
  if (!modelId) {
    return null;
  }
  const [withoutColon] = modelId.split(':');
  return withoutColon.replace(/-\d{4,}$/g, '');
}

function buildParametersFromTemplate(template, mode = 'default') {
  const ranges = template || DEFAULT_PARAMETER_TEMPLATE;
  const pick = (range) => {
    if (!range) {
      range = DEFAULT_PARAMETER_TEMPLATE.temperature;
    }
    if (mode === 'random') {
      const min = typeof range.min === 'number' ? range.min : 0.1;
      const max = typeof range.max === 'number' ? range.max : 1.0;
      const value = min + Math.random() * (max - min);
      return parseFloat(value.toFixed(2));
    }
    return range.default ?? 0.7;
  };

  const temperatureRange = ranges.temperature || DEFAULT_PARAMETER_TEMPLATE.temperature;
  const topPRange = ranges.topP || DEFAULT_PARAMETER_TEMPLATE.topP;
  const maxTokensRange = ranges.maxTokens || DEFAULT_PARAMETER_TEMPLATE.maxTokens;

  const temperature = pick(temperatureRange);
  const topP = pick(topPRange);
  let maxTokens;
  if (mode === 'random') {
    const min = maxTokensRange.min ?? 100;
    const max = maxTokensRange.max ?? 1000;
    maxTokens = Math.round(min + Math.random() * (max - min));
  } else {
    maxTokens = maxTokensRange.default ?? 750;
  }

  return {
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
  };
}

function buildFallbackModels() {
  return Object.entries(MODEL_PRESETS).map(([key, preset]) => ({
    id: key,
    name: preset.displayName || key,
    provider: key.split('/')[0],
    supportsFunctionCalling: preset.supportsFunctionCalling ?? false,
    costPer1kTokens: preset.costPer1kTokens ?? null,
    parameters: preset.parameters ?? DEFAULT_PARAMETER_TEMPLATE,
  }));
}

async function fetchOpenRouterModelList() {
  if (!process.env.OPENROUTER_API_KEY) {
    return buildFallbackModels();
  }

  if (cachedModels && Date.now() - cachedAt < DEFAULT_CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter model fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    const supportedKeys = new Set(Object.keys(MODEL_PRESETS));

    const mapped = (payload.data || [])
      .map((model) => {
        const baseKey = baseModelKey(model.id);
        if (!supportedKeys.has(baseKey)) {
          return null;
        }

        const preset = MODEL_PRESETS[baseKey];
        const pricing = model.pricing?.usd;
        const costPer1kTokens = pricing?.['input'] ?? pricing?.['output'] ?? pricing?.per_1k_input_tokens ?? preset.costPer1kTokens ?? null;

        return {
          id: model.id,
          name: model.name || preset.displayName || model.id,
          provider: baseKey.split('/')[0],
          supportsFunctionCalling: preset.supportsFunctionCalling ?? false,
          costPer1kTokens,
          parameters: preset.parameters ?? DEFAULT_PARAMETER_TEMPLATE,
          baseKey,
        };
      })
      .filter(Boolean);

    if (mapped.length === 0) {
      cachedModels = buildFallbackModels();
    } else {
      cachedModels = mapped;
    }
    cachedAt = Date.now();
    return cachedModels;
  } catch (error) {
    console.warn('Failed to fetch models from OpenRouter, using fallback list.', error);
    cachedModels = buildFallbackModels();
    cachedAt = Date.now();
    return cachedModels;
  }
}

export async function getAvailableModels() {
  return fetchOpenRouterModelList();
}

export async function getModelById(modelId) {
  const models = await fetchOpenRouterModelList();
  return models.find((model) => model.id === modelId) || null;
}

export async function getRandomModelId() {
  const models = await fetchOpenRouterModelList();
  if (!models.length) {
    throw new Error('No models available for selection');
  }
  const random = Math.floor(Math.random() * models.length);
  return models[random].id;
}

export async function getRandomParameters(modelId) {
  const model = await getModelById(modelId);
  const template = model?.parameters ?? DEFAULT_PARAMETER_TEMPLATE;
  return buildParametersFromTemplate(template, 'random');
}

export async function getDefaultParameters(modelId) {
  const model = await getModelById(modelId);
  const template = model?.parameters ?? DEFAULT_PARAMETER_TEMPLATE;
  return buildParametersFromTemplate(template, 'default');
}

export function mergeWithModelDefaults(defaultParams, customParams = {}) {
  return {
    ...defaultParams,
    ...customParams,
  };
}

export function clearModelCache() {
  cachedModels = null;
  cachedAt = 0;
}
