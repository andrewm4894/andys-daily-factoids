// frontend/src/components/RateLimitStatus.js
import React from "react";
import "./RateLimitStatus.css";

function RateLimitStatus({ 
  rateLimitInfo, 
  isCheckingRateLimit, 
  rateLimitError, 
  onRefresh 
}) {
  const getStatusIcon = () => {
    if (isCheckingRateLimit) return "⏳";
    if (rateLimitError) return "⚠️";
    if (rateLimitInfo.limitType === null) return "✅";
    return "🚫";
  };

  const getStatusColor = () => {
    if (isCheckingRateLimit) return "status-checking";
    if (rateLimitError) return "status-error";
    if (rateLimitInfo.limitType === null) {
      // Show green if global usage is low, yellow if medium, red if high
      const globalUsage = rateLimitInfo.globalLimits?.hourlyUsage || 0;
      const globalLimit = rateLimitInfo.globalLimits?.hourlyLimit || 500;
      const usagePercent = (globalUsage / globalLimit) * 100;
      
      if (usagePercent < 50) return "status-good";
      if (usagePercent < 80) return "status-warning";
      return "status-exceeded";
    }
    return "status-exceeded";
  };

  const getProgressPercentage = () => {
    if (!rateLimitInfo.globalLimits) return 0;
    return Math.round((rateLimitInfo.globalLimits.hourlyUsage / rateLimitInfo.globalLimits.hourlyLimit) * 100);
  };

  return (
    <div className={`rate-limit-status ${getStatusColor()}`}>
      <div className="rate-limit-header">
        <span className="status-icon">{getStatusIcon()}</span>
        <span className="status-title">Free Generations</span>
        {onRefresh && (
          <button 
            className="refresh-button"
            onClick={onRefresh}
            disabled={isCheckingRateLimit}
            title="Refresh status"
          >
            🔄
          </button>
        )}
      </div>
      
      {rateLimitError ? (
        <div className="error-message">
          <p>{rateLimitError.message}</p>
          {rateLimitError.rateLimitInfo && (
            <div className="error-details">
              <p>Usage: {rateLimitError.rateLimitInfo.currentUsage}/{rateLimitError.rateLimitInfo.limit}</p>
              {rateLimitError.rateLimitInfo.resetTime && (
                <p>Reset: {new Date(rateLimitError.rateLimitInfo.resetTime).toLocaleTimeString()}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rate-limit-content">
          <div className="usage-info">
            <span className="usage-text">
              Global: {rateLimitInfo.globalLimits?.hourlyUsage || 0} / {rateLimitInfo.globalLimits?.hourlyLimit || 500} per hour
            </span>
            <span className="remaining-text">
              Daily: {rateLimitInfo.globalLimits?.dailyUsage || 0} / {rateLimitInfo.globalLimits?.dailyLimit || 5000} per day
            </span>
          </div>
          
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>
          
          <div className="time-info">
            <span className="reset-time">
              Global rate limiting active
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default RateLimitStatus;
