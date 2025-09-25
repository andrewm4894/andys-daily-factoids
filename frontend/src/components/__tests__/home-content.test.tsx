import React from 'react'
import { render, screen, fireEvent, waitFor } from '@/test-utils'
import { HomeContent } from '../home-content'
import * as api from '../../lib/api'
import type { Factoid } from '../../lib/types'

// Mock the API functions
jest.mock('../../lib/api', () => ({
  fetchRandomFactoids: jest.fn(),
}))

// Mock the child components to isolate HomeContent testing
jest.mock('../generate-factoid-form', () => ({
  GenerateFactoidForm: ({ models, onShuffle, shuffleLoading, onGenerationError }: any) => (
    <div data-testid="generate-factoid-form">
      <button onClick={onShuffle} disabled={shuffleLoading}>
        {shuffleLoading ? 'Shuffling...' : 'Shuffle'}
      </button>
      <button onClick={() => onGenerationError('Test error')}>
        Trigger Error
      </button>
      <button onClick={() => onGenerationError(null)}>
        Clear Error
      </button>
      <span data-testid="models-count">{models.length}</span>
    </div>
  ),
}))

jest.mock('../factoid-card', () => ({
  FactoidCard: ({ factoid, isAlternate, colorIndex }: any) => (
    <div data-testid={`factoid-card-${factoid.id}`}>
      <span data-testid="factoid-text">{factoid.text}</span>
      <span data-testid="is-alternate">{isAlternate.toString()}</span>
      <span data-testid="color-index">{colorIndex}</span>
    </div>
  ),
}))

const mockFetchRandomFactoids = api.fetchRandomFactoids as jest.MockedFunction<typeof api.fetchRandomFactoids>

describe('HomeContent', () => {
  const mockModels = ['gpt-4', 'gpt-3.5-turbo', 'claude-3']
  
  const createMockFactoid = (overrides: Partial<Factoid> = {}): Factoid => ({
    id: 'factoid-1',
    text: 'This is a fascinating fact about the universe.',
    subject: 'Science',
    emoji: '🌌',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    votes_up: 5,
    votes_down: 1,
    generation_metadata: {
      model: 'gpt-4',
      temperature: 0.7,
    },
    cost_usd: 0.0015,
    ...overrides,
  })

  const mockFactoids = [
    createMockFactoid({ id: 'factoid-1', text: 'First factoid' }),
    createMockFactoid({ id: 'factoid-2', text: 'Second factoid' }),
    createMockFactoid({ id: 'factoid-3', text: 'Third factoid' }),
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchRandomFactoids.mockResolvedValue([])
  })

  describe('Initial Rendering', () => {
    it('should render with initial factoids', () => {
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      expect(screen.getByTestId('generate-factoid-form')).toBeInTheDocument()
      expect(screen.getByTestId('models-count')).toHaveTextContent('3')
      
      expect(screen.getByTestId('factoid-card-factoid-1')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-factoid-2')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-factoid-3')).toBeInTheDocument()
    })

    it('should pass models to GenerateFactoidForm', () => {
      render(<HomeContent initialFactoids={[]} models={mockModels} />)
      
      expect(screen.getByTestId('models-count')).toHaveTextContent('3')
    })

    it('should show empty state when no factoids', () => {
      render(<HomeContent initialFactoids={[]} models={mockModels} />)
      
      expect(screen.getByText('No factoids yet. Generate one to get started!')).toBeInTheDocument()
      expect(screen.queryByTestId('factoid-card-factoid-1')).not.toBeInTheDocument()
    })

    it('should not show error message initially', () => {
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText('Factoid generation failed')).not.toBeInTheDocument()
    })
  })

  describe('FactoidCard Rendering', () => {
    it('should render factoids with correct alternation and color indices', () => {
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      // First factoid (index 0): not alternate, color index 0
      const firstCard = screen.getByTestId('factoid-card-factoid-1')
      expect(firstCard.querySelector('[data-testid="is-alternate"]')).toHaveTextContent('false')
      expect(firstCard.querySelector('[data-testid="color-index"]')).toHaveTextContent('0')
      
      // Second factoid (index 1): alternate, color index 1
      const secondCard = screen.getByTestId('factoid-card-factoid-2')
      expect(secondCard.querySelector('[data-testid="is-alternate"]')).toHaveTextContent('true')
      expect(secondCard.querySelector('[data-testid="color-index"]')).toHaveTextContent('1')
      
      // Third factoid (index 2): not alternate, color index 2
      const thirdCard = screen.getByTestId('factoid-card-factoid-3')
      expect(thirdCard.querySelector('[data-testid="is-alternate"]')).toHaveTextContent('false')
      expect(thirdCard.querySelector('[data-testid="color-index"]')).toHaveTextContent('2')
    })

    it('should handle color index wrapping for more than 6 factoids', () => {
      const manyFactoids = Array.from({ length: 8 }, (_, i) =>
        createMockFactoid({ id: `factoid-${i + 1}`, text: `Factoid ${i + 1}` })
      )
      
      render(<HomeContent initialFactoids={manyFactoids} models={mockModels} />)
      
      // 7th factoid should have color index 0 (6 % 6 = 0)
      const seventhCard = screen.getByTestId('factoid-card-factoid-7')
      expect(seventhCard.querySelector('[data-testid="color-index"]')).toHaveTextContent('0')
      
      // 8th factoid should have color index 1 (7 % 6 = 1)
      const eighthCard = screen.getByTestId('factoid-card-factoid-8')
      expect(eighthCard.querySelector('[data-testid="color-index"]')).toHaveTextContent('1')
    })
  })

  describe('Initial Factoids Update', () => {
    it('should update factoids when initialFactoids prop changes', () => {
      const { rerender } = render(<HomeContent initialFactoids={[mockFactoids[0]]} models={mockModels} />)
      
      expect(screen.getByTestId('factoid-card-factoid-1')).toBeInTheDocument()
      expect(screen.queryByTestId('factoid-card-factoid-2')).not.toBeInTheDocument()
      
      rerender(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      expect(screen.getByTestId('factoid-card-factoid-1')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-factoid-2')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-factoid-3')).toBeInTheDocument()
    })

    it('should show empty state when initialFactoids becomes empty', () => {
      const { rerender } = render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      expect(screen.queryByText('No factoids yet. Generate one to get started!')).not.toBeInTheDocument()
      
      rerender(<HomeContent initialFactoids={[]} models={mockModels} />)
      
      expect(screen.getByText('No factoids yet. Generate one to get started!')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should show error message when generation fails', async () => {
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      const triggerErrorButton = screen.getByText('Trigger Error')
      fireEvent.click(triggerErrorButton)
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText('Factoid generation failed')).toBeInTheDocument()
        expect(screen.getByText('Test error')).toBeInTheDocument()
      })
    })

    it('should clear error message when generation succeeds', async () => {
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      // First, show an error
      const triggerErrorButton = screen.getByText('Trigger Error')
      fireEvent.click(triggerErrorButton)
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
      
      // Then clear the error
      const clearErrorButton = screen.getByText('Clear Error')
      fireEvent.click(clearErrorButton)
      
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(screen.queryByText('Factoid generation failed')).not.toBeInTheDocument()
      })
    })

    it('should have proper accessibility attributes for error message', async () => {
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      const triggerErrorButton = screen.getByText('Trigger Error')
      fireEvent.click(triggerErrorButton)
      
      await waitFor(() => {
        const errorAlert = screen.getByRole('alert')
        expect(errorAlert).toHaveClass('rounded-md', 'border', 'border-rose-200', 'bg-rose-50')
        expect(errorAlert).toHaveTextContent('Factoid generation failed')
        expect(errorAlert).toHaveTextContent('Test error')
      })
    })
  })

  describe('Shuffle Functionality', () => {
    it('should pass shuffle loading state to GenerateFactoidForm', async () => {
      const newFactoids = [createMockFactoid({ id: 'new-factoid', text: 'New factoid' })]
      mockFetchRandomFactoids.mockResolvedValue(newFactoids)
      
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      const shuffleButton = screen.getByText('Shuffle')
      fireEvent.click(shuffleButton)
      
      // Should show loading state
      expect(screen.getByText('Shuffling...')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.getByText('Shuffle')).toBeInTheDocument()
      })
    })

    it('should not shuffle if already shuffling', async () => {
      mockFetchRandomFactoids.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      const shuffleButton = screen.getByText('Shuffle')
      
      // Click multiple times rapidly
      fireEvent.click(shuffleButton)
      fireEvent.click(shuffleButton)
      fireEvent.click(shuffleButton)
      
      // Should only call API once
      expect(mockFetchRandomFactoids).toHaveBeenCalledTimes(1)
    })

    it('should restore initial factoids when current factoids are empty', async () => {
      const { rerender } = render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      // First, clear the factoids by updating initialFactoids
      rerender(<HomeContent initialFactoids={[]} models={mockModels} />)
      
      const shuffleButton = screen.getByText('Shuffle')
      fireEvent.click(shuffleButton)
      
      // Should not call the API since factoids.length === 0
      expect(mockFetchRandomFactoids).not.toHaveBeenCalled()
      
      // Instead should restore initialFactoids (empty in this case)
      expect(screen.getByText('No factoids yet. Generate one to get started!')).toBeInTheDocument()
    })

    it('should fetch new random factoids on successful shuffle', async () => {
      const newFactoids = [
        createMockFactoid({ id: 'new-1', text: 'New factoid 1' }),
        createMockFactoid({ id: 'new-2', text: 'New factoid 2' }),
      ]
      mockFetchRandomFactoids.mockResolvedValue(newFactoids)
      
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      const shuffleButton = screen.getByText('Shuffle')
      fireEvent.click(shuffleButton)
      
      await waitFor(() => {
        expect(screen.getByTestId('factoid-card-new-1')).toBeInTheDocument()
        expect(screen.getByTestId('factoid-card-new-2')).toBeInTheDocument()
      })
      
      expect(mockFetchRandomFactoids).toHaveBeenCalledWith(50)
      expect(screen.queryByTestId('factoid-card-factoid-1')).not.toBeInTheDocument()
    })

    it('should shuffle locally when API returns empty results', async () => {
      mockFetchRandomFactoids.mockResolvedValue([])
      
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      // Store original order
      const originalOrder = mockFactoids.map(f => f.id)
      
      const shuffleButton = screen.getByText('Shuffle')
      fireEvent.click(shuffleButton)
      
      await waitFor(() => {
        expect(screen.getByText('Shuffle')).toBeInTheDocument()
      })
      
      // Should still have the same factoids (though potentially reordered)
      expect(screen.getByTestId('factoid-card-factoid-1')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-factoid-2')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-factoid-3')).toBeInTheDocument()
      
      expect(mockFetchRandomFactoids).toHaveBeenCalledWith(50)
    })

    it('should shuffle locally when API call fails', async () => {
      mockFetchRandomFactoids.mockRejectedValue(new Error('API Error'))
      
      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      const shuffleButton = screen.getByText('Shuffle')
      fireEvent.click(shuffleButton)
      
      await waitFor(() => {
        expect(screen.getByText('Shuffle')).toBeInTheDocument()
      })
      
      // Should still have the same factoids (though potentially reordered)
      expect(screen.getByTestId('factoid-card-factoid-1')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-factoid-2')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-factoid-3')).toBeInTheDocument()
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to shuffle factoids', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('Local Shuffle Algorithm', () => {
    it('should shuffle factoids randomly', async () => {
      // Use a larger array to make shuffling more evident
      const manyFactoids = Array.from({ length: 10 }, (_, i) =>
        createMockFactoid({ id: `factoid-${i + 1}`, text: `Factoid ${i + 1}` })
      )
      
      mockFetchRandomFactoids.mockResolvedValue([])
      
      render(<HomeContent initialFactoids={manyFactoids} models={mockModels} />)
      
      // Get initial order
      const initialCards = manyFactoids.map(f => screen.getByTestId(`factoid-card-${f.id}`))
      const initialTexts = initialCards.map(card => 
        card.querySelector('[data-testid="factoid-text"]')?.textContent
      )
      
      const shuffleButton = screen.getByText('Shuffle')
      fireEvent.click(shuffleButton)
      
      await waitFor(() => {
        expect(screen.getByText('Shuffle')).toBeInTheDocument()
      })
      
      // Get new order
      const shuffledCards = manyFactoids.map(f => screen.getByTestId(`factoid-card-${f.id}`))
      const shuffledTexts = shuffledCards.map(card => 
        card.querySelector('[data-testid="factoid-text"]')?.textContent
      )
      
      // All factoids should still be present
      expect(shuffledTexts).toHaveLength(10)
      expect(shuffledTexts.sort()).toEqual(initialTexts.sort())
      
      // Note: We can't reliably test that order changed due to randomness,
      // but we can test that all elements are still present
    })
  })

  describe('Component Integration', () => {
    it('should pass correct props to GenerateFactoidForm', () => {
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      const form = screen.getByTestId('generate-factoid-form')
      expect(form).toBeInTheDocument()
      
      // Models are passed correctly
      expect(screen.getByTestId('models-count')).toHaveTextContent('3')
      
      // Shuffle button should work
      const shuffleButton = screen.getByText('Shuffle')
      expect(shuffleButton).not.toBeDisabled()
    })

    it('should pass correct props to FactoidCard components', () => {
      render(<HomeContent initialFactoids={mockFactoids} models={mockModels} />)
      
      mockFactoids.forEach((factoid, index) => {
        const card = screen.getByTestId(`factoid-card-${factoid.id}`)
        expect(card.querySelector('[data-testid="factoid-text"]')).toHaveTextContent(factoid.text)
        expect(card.querySelector('[data-testid="is-alternate"]')).toHaveTextContent((index % 2 === 1).toString())
        expect(card.querySelector('[data-testid="color-index"]')).toHaveTextContent((index % 6).toString())
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty models array', () => {
      render(<HomeContent initialFactoids={mockFactoids} models={[]} />)
      
      expect(screen.getByTestId('models-count')).toHaveTextContent('0')
      expect(screen.getByTestId('generate-factoid-form')).toBeInTheDocument()
    })

    it('should handle factoids with missing properties gracefully', () => {
      const incompleteFactoid = createMockFactoid({
        id: 'incomplete',
        text: '',
        subject: '',
      })
      
      render(<HomeContent initialFactoids={[incompleteFactoid]} models={mockModels} />)
      
      expect(screen.getByTestId('factoid-card-incomplete')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-incomplete').querySelector('[data-testid="factoid-text"]'))
        .toHaveTextContent('')
    })

    it('should handle very long factoid texts', () => {
      const longTextFactoid = createMockFactoid({
        id: 'long-text',
        text: 'A'.repeat(1000),
      })
      
      render(<HomeContent initialFactoids={[longTextFactoid]} models={mockModels} />)
      
      expect(screen.getByTestId('factoid-card-long-text')).toBeInTheDocument()
      expect(screen.getByTestId('factoid-card-long-text').querySelector('[data-testid="factoid-text"]'))
        .toHaveTextContent('A'.repeat(1000))
    })
  })
})
