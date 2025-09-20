// frontend/src/components/ModelSelector.js
import React, { useState, useEffect } from "react";
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

  const handleModelChange = (event) => {
    onModelChange(event.target.value);
  };

  const handleParameterChange = (param, value) => {
    const newParams = { ...parameters, [param]: parseFloat(value) };
    onParametersChange(newParams);
  };

  const handleUseRandomChange = (event) => {
    onUseRandomParamsChange(event.target.checked);
  };

  const selectedModelConfig = models.find(m => m.id === selectedModel);

  if (isLoading) {
    return <div className="model-selector loading">Loading models...</div>;
  }

  if (error) {
    return <div className="model-selector error">Error loading models: {error}</div>;
  }

  return (
    <div className="model-selector">
      <div className="model-selector-header">
        <h3>Model Selection</h3>
        <button 
          className="toggle-advanced"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Options
        </button>
      </div>

      <div className="model-selection">
        <label htmlFor="model-select">
          <strong>AI Model:</strong>
        </label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={handleModelChange}
          className="model-dropdown"
        >
          <option value="">Random Model</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} ({model.provider}) - ${model.costPer1kTokens}/1k tokens
            </option>
          ))}
        </select>
      </div>

      <div className="random-params-toggle">
        <label>
          <input
            type="checkbox"
            checked={useRandomParams}
            onChange={handleUseRandomChange}
          />
          Use random parameters for more variety
        </label>
      </div>

      {showAdvanced && !useRandomParams && selectedModelConfig && (
        <div className="parameter-controls">
          <h4>Parameters</h4>
          
          <div className="parameter-group">
            <label htmlFor="temperature">
              Temperature: {parameters.temperature || 0.7}
            </label>
            <input
              id="temperature"
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={parameters.temperature || 0.7}
              onChange={(e) => handleParameterChange('temperature', e.target.value)}
            />
            <small>Controls randomness (0.1 = more focused, 2.0 = more creative)</small>
          </div>

          <div className="parameter-group">
            <label htmlFor="top_p">
              Top P: {parameters.top_p || 0.9}
            </label>
            <input
              id="top_p"
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={parameters.top_p || 0.9}
              onChange={(e) => handleParameterChange('top_p', e.target.value)}
            />
            <small>Controls diversity of word choices</small>
          </div>

          <div className="parameter-group">
            <label htmlFor="max_tokens">
              Max Tokens: {parameters.max_tokens || 1000}
            </label>
            <input
              id="max_tokens"
              type="range"
              min="100"
              max="2000"
              step="50"
              value={parameters.max_tokens || 1000}
              onChange={(e) => handleParameterChange('max_tokens', e.target.value)}
            />
            <small>Maximum length of generated text</small>
          </div>
        </div>
      )}

      {selectedModelConfig && (
        <div className="model-info">
          <h4>Selected Model Info</h4>
          <p><strong>Provider:</strong> {selectedModelConfig.provider}</p>
          <p><strong>Function Calling:</strong> {selectedModelConfig.supportsFunctionCalling ? 'Yes' : 'No'}</p>
          <p><strong>Cost:</strong> ${selectedModelConfig.costPer1kTokens} per 1k tokens</p>
        </div>
      )}
    </div>
  );
}

export default ModelSelector;