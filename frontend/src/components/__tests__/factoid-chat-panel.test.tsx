import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@/test-utils'
import { FactoidChatPanel } from '../factoid-chat-panel'
import * as api from '../../lib/api'
import type { 
  Factoid, 
  ChatSessionResponse, 
  ChatMessage, 
  ChatRateLimitSnapshot,
  ChatSessionSummary,
  CheckoutSessionResponse 
} from '../../lib/types'

// Mock the API functions
jest.mock('../../lib/api', () => {
  // Create a proper ApiError class for testing
  class MockApiError extends Error {
    status: number
    data: any
    
    constructor(message: string, status: number, data: any) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.data = data
    }
  }

  return {
    ApiError: MockApiError,
    createChatSession: jest.fn(),
    sendChatMessage: jest.fn(),
    isChatRateLimitError: jest.fn(),
  }
})

// Mock window.open
Object.defineProperty(window, 'open', {
  value: jest.fn(),
  writable: true,
})

const mockCreateChatSession = api.createChatSession as jest.MockedFunction<typeof api.createChatSession>
const mockSendChatMessage = api.sendChatMessage as jest.MockedFunction<typeof api.sendChatMessage>
const mockIsChatRateLimitError = api.isChatRateLimitError as jest.MockedFunction<typeof api.isChatRateLimitError>

// Helper to render with act
const renderWithAct = async (component: React.ReactElement) => {
  let renderResult: any
  await act(async () => {
    renderResult = render(component)
    // Wait a bit for async effects to complete
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  return renderResult
}

describe('FactoidChatPanel', () => {
  const mockFactoid: Factoid = {
    id: 'test-factoid-id',
    text: 'This is a fascinating fact about the universe that will blow your mind.',
    subject: 'Cosmology',
    emoji: '🌌',
    created_at: '2023-01-01T12:00:00Z',
    updated_at: '2023-01-01T12:00:00Z',
    votes_up: 10,
    votes_down: 2,
    generation_metadata: {
      model: 'gpt-4',
      temperature: 0.7,
    },
    cost_usd: 0.0015,
  }

  const mockSession: ChatSessionSummary = {
    id: 'session-123',
    status: 'active',
    model_key: 'gpt-4',
    factoid_id: 'test-factoid-id',
    created_at: '2023-01-01T12:00:00Z',
    last_activity_at: '2023-01-01T12:05:00Z',
  }

  const mockRateLimit: ChatRateLimitSnapshot = {
    per_minute: 10,
    current_window_requests: 3,
  }

  const mockUserMessage: ChatMessage = {
    id: 1,
    role: 'user',
    content: 'Tell me more about this factoid',
    created_at: '2023-01-01T12:01:00Z',
  }

  const mockAssistantMessage: ChatMessage = {
    id: 2,
    role: 'assistant',
    content: 'This factoid is fascinating because...',
    created_at: '2023-01-01T12:02:00Z',
  }

  const mockCheckoutSession: CheckoutSessionResponse = {
    checkout_url: 'https://checkout.stripe.com/test',
    session_id: 'cs_test_123',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsChatRateLimitError.mockReturnValue(false)
    
    // Default mock implementations
    mockCreateChatSession.mockResolvedValue({
      session: mockSession,
      messages: [],
      rate_limit: mockRateLimit,
    })
    mockSendChatMessage.mockResolvedValue({
      session: mockSession,
      messages: [],
      rate_limit: mockRateLimit,
    })
  })

  describe('Initial Rendering', () => {
    it('should render with factoid header and description', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)
      
      expect(screen.getByText('Cosmology 🌌')).toBeInTheDocument()
      expect(screen.getByText('Ask follow-up questions or request supporting sources.')).toBeInTheDocument()
    })

    it('should render close button with proper accessibility', async () => {
      const onClose = jest.fn()
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} onClose={onClose} />)
      
      const closeButton = screen.getByLabelText('Close chat')
      expect(closeButton).toBeInTheDocument()
      
      fireEvent.click(closeButton)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should handle factoid without subject', async () => {
      const factoidNoSubject = { ...mockFactoid, subject: '' }
      await renderWithAct(<FactoidChatPanel factoid={factoidNoSubject} />)
      
      expect(screen.getByText('Factoid Chat 🌌')).toBeInTheDocument()
    })

    it('should handle factoid without emoji', async () => {
      const factoidNoEmoji = { ...mockFactoid, emoji: '' }
      await renderWithAct(<FactoidChatPanel factoid={factoidNoEmoji} />)
      
      expect(screen.getByText('Cosmology')).toBeInTheDocument()
    })

    it('should handle factoid without subject or emoji', async () => {
      const factoidMinimal = { ...mockFactoid, subject: '', emoji: '' }
      await renderWithAct(<FactoidChatPanel factoid={factoidMinimal} />)
      
      expect(screen.getByText('Factoid Chat')).toBeInTheDocument()
    })

    it('should render message input with placeholder', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)
      
      const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
      expect(textarea).toBeInTheDocument()
    })

    it('should have send button initially disabled', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })
  })

  describe('Session Initialization', () => {
    it('should initialize session on mount', async () => {
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        expect(mockCreateChatSession).toHaveBeenCalledWith({ factoidId: 'test-factoid-id' })
      })

      await waitFor(() => {
        expect(screen.getByText('Ask anything about this factoid to get started.')).toBeInTheDocument()
      })
    })

    it('should handle session initialization failure', async () => {
      mockCreateChatSession.mockRejectedValue(new Error('Failed to connect'))

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        expect(screen.getByText('Failed to connect')).toBeInTheDocument()
      })
    })

    it('should handle ApiError during initialization', async () => {
      const apiError = new api.ApiError('Server error', 500, { detail: 'Internal server error' })
      mockCreateChatSession.mockRejectedValue(apiError)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })
    })

    it('should reset state when factoid changes', async () => {
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [mockUserMessage, mockAssistantMessage],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)

      const { rerender } = await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        expect(screen.getByText('This factoid is fascinating because...')).toBeInTheDocument()
      })

      // Change factoid and reset mock to return no messages for new factoid
      const newFactoid = { ...mockFactoid, id: 'new-factoid-id', subject: 'Physics' }
      mockCreateChatSession.mockResolvedValue({
        session: { ...mockSession, id: 'new-session' },
        messages: [],
        rate_limit: mockRateLimit,
      })

      await act(async () => {
        rerender(<FactoidChatPanel factoid={newFactoid} />)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      // Wait for state to update
      await waitFor(() => {
        expect(screen.queryByText('This factoid is fascinating because...')).not.toBeInTheDocument()
      })
    })
  })

  describe('Message Display', () => {
    beforeEach(async () => {
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [mockUserMessage, mockAssistantMessage],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)
    })

    it('should display messages with correct styling', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        const userMessage = screen.getByText('Tell me more about this factoid')
        const assistantMessage = screen.getByText('This factoid is fascinating because...')
        
        expect(userMessage).toBeInTheDocument()
        expect(assistantMessage).toBeInTheDocument()
        
        // Check user message styling
        expect(userMessage.closest('div')).toHaveClass('self-end', 'bg-indigo-50', 'text-indigo-900')
        
        // Check assistant message styling
        expect(assistantMessage.closest('div')).toHaveClass('self-start', 'bg-slate-100', 'text-slate-900')
      })
    })

    it('should display rate limit information', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        expect(screen.getByText('3/10 requests used this minute')).toBeInTheDocument()
      })
    })

    it('should handle complex message content', async () => {
      const complexMessage: ChatMessage = {
        id: 3,
        role: 'assistant',
        content: { text: 'Complex content', extra: 'data' },
        created_at: '2023-01-01T12:03:00Z',
      }
      
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [complexMessage],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        expect(screen.getByText('Complex content')).toBeInTheDocument()
      })
    })

    it('should filter out tool messages from display', async () => {
      const toolMessage: ChatMessage = {
        id: 6,
        role: 'tool',
        content: 'Tool result',
        created_at: '2023-01-01T12:06:00Z',
      }
      
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [mockUserMessage, toolMessage, mockAssistantMessage],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        expect(screen.getByText('Tell me more about this factoid')).toBeInTheDocument()
        expect(screen.getByText('This factoid is fascinating because...')).toBeInTheDocument()
        expect(screen.queryByText('Tool result')).not.toBeInTheDocument()
      })
    })
  })

  describe('Message Sending', () => {
    it('should enable send button when input has content', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
        
        fireEvent.change(textarea, { target: { value: 'Hello' } })
        
        const sendButton = screen.getByRole('button', { name: /send/i })
        expect(sendButton).not.toBeDisabled()
      })
    })

    it('should send message when form is submitted', async () => {
      const updatedResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [mockUserMessage, mockAssistantMessage],
        rate_limit: { ...mockRateLimit, current_window_requests: 4 },
      }
      mockSendChatMessage.mockResolvedValue(updatedResponse)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(async () => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
        const sendButton = screen.getByRole('button', { name: /send/i })
        
        fireEvent.change(textarea, { target: { value: 'Tell me more' } })
        
        await act(async () => {
          fireEvent.click(sendButton)
        })
      })

      await waitFor(() => {
        expect(mockSendChatMessage).toHaveBeenCalledWith({
          sessionId: 'session-123',
          message: 'Tell me more',
        })
      })
    })

    it('should clear input after sending message', async () => {
      const updatedResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [mockUserMessage],
        rate_limit: mockRateLimit,
      }
      mockSendChatMessage.mockResolvedValue(updatedResponse)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(async () => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi') as HTMLTextAreaElement
        
        fireEvent.change(textarea, { target: { value: 'Test message' } })
        expect(textarea.value).toBe('Test message')
        
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /send/i }))
        })
      })

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi') as HTMLTextAreaElement
        expect(textarea.value).toBe('')
      })
    })

    it('should prevent sending empty or whitespace-only messages', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(async () => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
        
        // Test empty message
        fireEvent.change(textarea, { target: { value: '' } })
        
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /send/i }))
        })
        expect(mockSendChatMessage).not.toHaveBeenCalled()
        
        // Test whitespace-only message
        fireEvent.change(textarea, { target: { value: '   \n  \t  ' } })
        
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /send/i }))
        })
        expect(mockSendChatMessage).not.toHaveBeenCalled()
      })
    })
  })

  describe('Error Handling', () => {
    it('should display error message when sending fails', async () => {
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)
      mockSendChatMessage.mockRejectedValue(new Error('Network error'))

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(async () => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
        
        fireEvent.change(textarea, { target: { value: 'Test message' } })
        
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /send/i }))
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('should handle API errors when sending messages', async () => {
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)
      
      const apiError = new api.ApiError('Server error', 500, { detail: 'Internal server error' })
      mockSendChatMessage.mockRejectedValue(apiError)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(async () => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
        
        fireEvent.change(textarea, { target: { value: 'Test message' } })
        
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /send/i }))
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })
    })
  })

  describe('Rate Limiting', () => {
    it('should handle rate limit errors with checkout session', async () => {
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)

      const rateLimitError = new api.ApiError('Rate limit exceeded', 429, {
        detail: 'Too many requests',
        rate_limit: { per_minute: 10, current_window_requests: 10 },
        checkout_session: mockCheckoutSession,
      })
      
      mockSendChatMessage.mockRejectedValue(rateLimitError)
      mockIsChatRateLimitError.mockReturnValue(true)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(async () => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
        
        fireEvent.change(textarea, { target: { value: 'Test message' } })
        
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /send/i }))
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Rate limit reached')).toBeInTheDocument()
        expect(screen.getByText('Upgrade with Factoid Chat to keep the conversation going.')).toBeInTheDocument()
        expect(screen.getByText('10/10 requests used this minute')).toBeInTheDocument()
        
        const checkoutButton = screen.getByText('Open checkout')
        expect(checkoutButton).toBeInTheDocument()
      })
    })

    it('should open checkout session in new window', async () => {
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)

      const rateLimitError = new api.ApiError('Rate limit exceeded', 429, {
        rate_limit: { per_minute: 10, current_window_requests: 10 },
        checkout_session: mockCheckoutSession,
      })
      
      mockSendChatMessage.mockRejectedValue(rateLimitError)
      mockIsChatRateLimitError.mockReturnValue(true)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(async () => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
        
        fireEvent.change(textarea, { target: { value: 'Test message' } })
        
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /send/i }))
        })
      })

      await waitFor(() => {
        const checkoutButton = screen.getByText('Open checkout')
        fireEvent.click(checkoutButton)
        
        expect(window.open).toHaveBeenCalledWith(
          'https://checkout.stripe.com/test',
          '_blank',
          'noopener'
        )
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading structure', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)
      
      const heading = screen.getByRole('heading', { level: 3 })
      expect(heading).toHaveTextContent('Cosmology 🌌')
    })

    it('should have proper button labels', async () => {
      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)
      
      const closeButton = screen.getByLabelText('Close chat')
      expect(closeButton).toBeInTheDocument()
    })

    it('should handle keyboard form submission', async () => {
      const mockResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [],
        rate_limit: mockRateLimit,
      }
      mockCreateChatSession.mockResolvedValue(mockResponse)
      
      const updatedResponse: ChatSessionResponse = {
        session: mockSession,
        messages: [mockUserMessage],
        rate_limit: mockRateLimit,
      }
      mockSendChatMessage.mockResolvedValue(updatedResponse)

      await renderWithAct(<FactoidChatPanel factoid={mockFactoid} />)

      await waitFor(async () => {
        const textarea = screen.getByPlaceholderText('Ask a question, request sources, or say hi')
        
        fireEvent.change(textarea, { target: { value: 'Test message' } })
        
        await act(async () => {
          fireEvent.submit(textarea.closest('form')!)
        })
      })

      await waitFor(() => {
        expect(mockSendChatMessage).toHaveBeenCalledWith({
          sessionId: 'session-123',
          message: 'Test message',
        })
      })
    })
  })
})