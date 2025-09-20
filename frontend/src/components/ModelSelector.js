// frontend/src/components/ModelSelector.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useModels } from "../hooks/useModels";

function ModelSelector({ 
  selectedModel, 
  onModelChange, 
  parameters, 
  onParametersChange, 
  useRandomParams, 
  onUseRandomParamsChange,
  API_BASE_URL 
}) {
  const { models, isLoading, error } = useModels(API_BASE_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasAutoSelected = useRef(false);

  const handleModelChange = (event) => {
    onModelChange(event.target.value);
  };

  const getDefaultParametersForModel = useCallback((modelConfig) => {
    if (!modelConfig?.parameters) {
      return {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000,
      };
    }

    const { parameters: params } = modelConfig;
    const maxTokens = params.maxTokens ? Math.min(params.maxTokens, 1000) : 1000;

    return {
      temperature: params.temperature?.default ?? 0.7,
      top_p: params.topP?.default ?? 0.9,
      max_tokens: maxTokens,
    };
  }, []);

  const getRandomParametersForModel = useCallback((modelConfig) => {
    if (!modelConfig?.parameters) {
      return {
        temperature: parseFloat((Math.random() * 1.9 + 0.1).toFixed(2)),
        top_p: parseFloat((Math.random() * 0.9 + 0.1).toFixed(2)),
        max_tokens: 1000,
      };
    }

    const { parameters: params } = modelConfig;

    const randomBetween = (min, max) => {
      if (typeof min !== "number" || typeof max !== "number") {
        return null;
      }
      return min + Math.random() * (max - min);
    };

    const temperature = randomBetween(params.temperature?.min, params.temperature?.max);
    const topP = randomBetween(params.topP?.min, params.topP?.max);
    const maxTokensLimit = params.maxTokens ? Math.min(params.maxTokens, 1000) : 1000;

    return {
      temperature: parseFloat((temperature ?? 0.7).toFixed(2)),
      top_p: parseFloat((topP ?? 0.9).toFixed(2)),
      max_tokens: maxTokensLimit,
    };
  }, []);

  const handleParameterChange = (param, value) => {
    const parsedValue = param === "max_tokens" ? parseInt(value, 10) : parseFloat(value);
    const newParams = { ...parameters, [param]: parsedValue };
    onParametersChange(newParams);
  };

  const handleUseRandomChange = (event) => {
    const shouldUseRandom = event.target.checked;
    onUseRandomParamsChange(shouldUseRandom);

    if (shouldUseRandom) {
      onParametersChange({});
    } else if (selectedModelConfig) {
      onParametersChange(getDefaultParametersForModel(selectedModelConfig));
    }
  };

  const selectedModelConfig = useMemo(
    () => models.find((m) => m.id === selectedModel),
    [models, selectedModel]
  );

  const randomizeModel = useCallback(() => {
    if (!models.length) {
      return;
    }

    const randomModel = models[Math.floor(Math.random() * models.length)];
    hasAutoSelected.current = true;
    onModelChange(randomModel.id);

    if (!useRandomParams) {
      onParametersChange(getRandomParametersForModel(randomModel));
    }
  }, [models, onModelChange, onParametersChange, useRandomParams, getRandomParametersForModel]);

  useEffect(() => {
    if (!selectedModel) {
      hasAutoSelected.current = false;
    }
  }, [selectedModel]);

  const randomizeParameters = useCallback(() => {
    if (!selectedModelConfig) {
      return;
    }

    onParametersChange(getRandomParametersForModel(selectedModelConfig));
  }, [selectedModelConfig, getRandomParametersForModel, onParametersChange]);

  useEffect(() => {
    if (!isLoading && !error && models.length > 0 && !hasAutoSelected.current) {
      randomizeModel();
    }
  }, [isLoading, error, models, randomizeModel]);

  useEffect(() => {
    if (!useRandomParams && selectedModelConfig) {
      onParametersChange((currentParams) => {
        if (!currentParams || Object.keys(currentParams).length === 0) {
          return getDefaultParametersForModel(selectedModelConfig);
        }
        return currentParams;
      });
    }
  }, [useRandomParams, selectedModelConfig, getDefaultParametersForModel, onParametersChange]);

  if (isLoading) {
    return <div className="model-selector loading">Loading models...</div>;
  }

  if (error) {
    return <div className="model-selector error">Error loading models: {error}</div>;
  }

  return (
    <div className="model-selector">
      <div className="model-selector-top">
        <div>
          <h3>Model Selection</h3>
          <p className="model-selector-hint">Pick the model you want or let us surprise you.</p>
        </div>
        <button
          type="button"
          className="toggle-advanced"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide advanced controls' : 'Show advanced controls'}
        </button>
      </div>

      <div className="model-selector-control-group">
        <label htmlFor="model-select">AI Model</label>
        <div className="model-selector-control">
          <select
            id="model-select"
            value={selectedModel}
            onChange={handleModelChange}
            className="model-dropdown"
          >
            <option value="">Random Model</option>
            {models.map((model) => {
              const costLabel = model.costPer1kTokens != null
                ? `$${model.costPer1kTokens}/1k tokens`
                : 'Cost unknown';
              return (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider}) · {costLabel}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="randomize-button"
            onClick={randomizeModel}
            disabled={isLoading || !!error || !models.length}
          >
            <span aria-hidden="true">🎲</span>
            <span> Surprise me</span>
          </button>
        </div>
      </div>

      <label className="random-params-toggle">
        <input
          type="checkbox"
          checked={useRandomParams}
          onChange={handleUseRandomChange}
        />
        Use random parameters for more variety
      </label>

      {selectedModelConfig && (
        <div className="model-info-card">
          <h4>Selected Model</h4>
          <dl>
            <div>
              <dt>Provider</dt>
              <dd>{selectedModelConfig.provider}</dd>
            </div>
            <div>
              <dt>Function Calling</dt>
              <dd>{selectedModelConfig.supportsFunctionCalling ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>{selectedModelConfig.costPer1kTokens != null ? `$${selectedModelConfig.costPer1kTokens} per 1k tokens` : 'Unknown'}</dd>
            </div>
          </dl>
        </div>
      )}

      {showAdvanced && !useRandomParams && selectedModelConfig && (
        <div className="parameter-panel">
          <div className="parameter-panel-header">
            <h4>Advanced parameters</h4>
            <button
              type="button"
              className="randomize-button"
              onClick={randomizeParameters}
            >
              <span aria-hidden="true">🎯</span>
              <span> Randomize</span>
            </button>
          </div>

          <div className="parameter-group">
            <div className="parameter-label">
              <span>Temperature</span>
              <span className="parameter-value">{parameters.temperature ?? selectedModelConfig.parameters?.temperature?.default ?? 0.7}</span>
            </div>
            <input
              id="temperature"
              type="range"
              min={selectedModelConfig.parameters?.temperature?.min ?? 0.1}
              max={selectedModelConfig.parameters?.temperature?.max ?? 2.0}
              step={0.1}
              value={parameters.temperature ?? selectedModelConfig.parameters?.temperature?.default ?? 0.7}
              onChange={(e) => handleParameterChange('temperature', e.target.value)}
            />
            <small>Lower values are focused, higher values are more creative.</small>
          </div>

          <div className="parameter-group">
            <div className="parameter-label">
              <span>Top P</span>
              <span className="parameter-value">{parameters.top_p ?? selectedModelConfig.parameters?.topP?.default ?? 0.9}</span>
            </div>
            <input
              id="top_p"
              type="range"
              min={selectedModelConfig.parameters?.topP?.min ?? 0.1}
              max={selectedModelConfig.parameters?.topP?.max ?? 1.0}
              step={0.1}
              value={parameters.top_p ?? selectedModelConfig.parameters?.topP?.default ?? 0.9}
              onChange={(e) => handleParameterChange('top_p', e.target.value)}
            />
            <small>Adjusts diversity of the generated wording.</small>
          </div>

          <div className="parameter-group">
            <div className="parameter-label">
              <span>Max Tokens</span>
              <span className="parameter-value">{parameters.max_tokens ?? Math.min(selectedModelConfig.parameters?.maxTokens ?? 1000, 1000)}</span>
            </div>
            <input
              id="max_tokens"
              type="range"
              min="100"
              max={Math.min(selectedModelConfig.parameters?.maxTokens ?? 1000, 1000)}
              step="50"
              value={parameters.max_tokens ?? Math.min(selectedModelConfig.parameters?.maxTokens ?? 1000, 1000)}
              onChange={(e) => handleParameterChange('max_tokens', e.target.value)}
            />
            <small>The upper limit for how long the model can respond.</small>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelSelector;
