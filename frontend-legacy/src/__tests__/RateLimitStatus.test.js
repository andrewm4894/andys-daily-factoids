// tests/frontend/RateLimitStatus.test.js
import React from 'react';
import { render, screen } from '@testing-library/react';
import RateLimitStatus from '../components/RateLimitStatus';

describe('RateLimitStatus Component', () => {
  const defaultProps = {
    rateLimitInfo: {
      globalLimits: {
        hourlyUsage: 5,
        dailyUsage: 20,
        hourlyLimit: 50,
        dailyLimit: 200
      },
      ipLimits: {
        hourlyUsage: 2,
        minuteUsage: 1,
        hourlyLimit: 10,
        minuteLimit: 3
      },
      limitType: null,
      isLoading: false,
      error: null
    },
    isCheckingRateLimit: false,
    rateLimitError: null,
    onRefresh: jest.fn()
  };

  it('should render loading state', () => {
    render(
      <RateLimitStatus
        {...defaultProps}
        rateLimitInfo={{ ...defaultProps.rateLimitInfo, isLoading: true }}
        isCheckingRateLimit={true}
      />
    );

    // The component doesn't show "Checking usage..." text, just the loading icon
    expect(screen.getByText('⏳')).toBeInTheDocument();
    expect(screen.getByText('Free Generations')).toBeInTheDocument();
  });

  it('should render normal state with low usage', () => {
    render(<RateLimitStatus {...defaultProps} />);

    expect(screen.getByText('Global: 5 / 50 per hour')).toBeInTheDocument();
    expect(screen.getByText('Daily: 20 / 200 per day')).toBeInTheDocument();
    expect(screen.getByText('Global rate limiting active')).toBeInTheDocument();
    expect(screen.getByText('✅')).toBeInTheDocument();
  });

  it('should render warning state with high usage', () => {
    const highUsageProps = {
      ...defaultProps,
      rateLimitInfo: {
        ...defaultProps.rateLimitInfo,
        globalLimits: {
          hourlyUsage: 400, // 80% usage
          dailyUsage: 3000,
          hourlyLimit: 500,
          dailyLimit: 5000
        }
      }
    };

    render(<RateLimitStatus {...highUsageProps} />);

    expect(screen.getByText('Global: 400 / 500 per hour')).toBeInTheDocument();
    expect(screen.getByText('✅')).toBeInTheDocument(); // Still allowed
  });

  it('should render error state when global limit exceeded', () => {
    const exceededProps = {
      ...defaultProps,
      rateLimitInfo: {
        ...defaultProps.rateLimitInfo,
        limitType: 'global',
        globalLimits: {
          hourlyUsage: 50,
          dailyUsage: 100,
          hourlyLimit: 50,
          dailyLimit: 200
        }
      }
    };

    render(<RateLimitStatus {...exceededProps} />);

    expect(screen.getByText('🚫')).toBeInTheDocument();
    expect(screen.getByText('Global: 50 / 50 per hour')).toBeInTheDocument();
  });

  it('should render error state when IP limit exceeded', () => {
    const ipExceededProps = {
      ...defaultProps,
      rateLimitInfo: {
        ...defaultProps.rateLimitInfo,
        limitType: 'ip',
        ipLimits: {
          hourlyUsage: 10,
          minuteUsage: 3,
          hourlyLimit: 10,
          minuteLimit: 3
        }
      }
    };

    render(<RateLimitStatus {...ipExceededProps} />);

    expect(screen.getByText('🚫')).toBeInTheDocument();
  });

  it('should render rate limit error', () => {
    const errorProps = {
      ...defaultProps,
      rateLimitError: {
        message: 'Rate limit exceeded',
        rateLimitInfo: {
          currentUsage: 10,
          limit: 10,
          resetTime: Date.now() + 3600000
        }
      }
    };

    render(<RateLimitStatus {...errorProps} />);

    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
    expect(screen.getByText('Usage: 10/10')).toBeInTheDocument();
  });

  it('should call onRefresh when refresh button is clicked', () => {
    const mockOnRefresh = jest.fn();
    render(
      <RateLimitStatus
        {...defaultProps}
        onRefresh={mockOnRefresh}
      />
    );

    const refreshButton = screen.getByTitle('Refresh status');
    refreshButton.click();

    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });

  it('should disable refresh button when checking rate limit', () => {
    const mockOnRefresh = jest.fn();
    render(
      <RateLimitStatus
        {...defaultProps}
        onRefresh={mockOnRefresh}
        isCheckingRateLimit={true}
      />
    );

    const refreshButton = screen.getByTitle('Refresh status');
    expect(refreshButton).toBeDisabled();
  });

  it('should render progress bar with correct percentage', () => {
    render(<RateLimitStatus {...defaultProps} />);

    // Find the progress bar using test ID
    const progressFill = screen.getByTestId('progress-fill');
    expect(progressFill).toHaveStyle('width: 10%'); // 5/50 * 100 = 10%
  });

  it('should handle missing rate limit info gracefully', () => {
    const minimalProps = {
      ...defaultProps,
      rateLimitInfo: {
        isLoading: false,
        error: null,
        limitType: null
      }
    };

    render(<RateLimitStatus {...minimalProps} />);

    expect(screen.getByText('Global: 0 / 500 per hour')).toBeInTheDocument();
    expect(screen.getByText('Daily: 0 / 5000 per day')).toBeInTheDocument();
  });

  it('should show different status colors based on usage', () => {
    const { rerender } = render(<RateLimitStatus {...defaultProps} />);
    
    // Low usage - should have status-good class
    const statusDiv = screen.getByTestId('rate-limit-status');
    expect(statusDiv).toHaveClass('status-good');

    // High usage - should have status-exceeded class (80% is > 80% threshold)
    const highUsageProps = {
      ...defaultProps,
      rateLimitInfo: {
        ...defaultProps.rateLimitInfo,
        globalLimits: {
          hourlyUsage: 400, // 80% usage
          dailyUsage: 3000,
          hourlyLimit: 500,
          dailyLimit: 5000
        }
      }
    };

    rerender(<RateLimitStatus {...highUsageProps} />);
    const updatedStatusDiv = screen.getByTestId('rate-limit-status');
    expect(updatedStatusDiv).toHaveClass('status-exceeded');
  });
});
