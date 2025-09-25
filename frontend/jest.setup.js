import "@testing-library/jest-dom";

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return "";
  },
}));

// Mock Stripe
jest.mock("@stripe/stripe-js", () => ({
  loadStripe: jest.fn(() =>
    Promise.resolve({
      redirectToCheckout: jest.fn(() => Promise.resolve({ error: null })),
    })
  ),
}));

// Mock window.location for tests
delete window.location;
window.location = {
  ...window.location,
  assign: jest.fn(),
  href: "http://localhost:3000",
  origin: "http://localhost:3000",
};

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve()),
  },
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock EventSource for SSE testing
global.EventSource = jest.fn().mockImplementation(() => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn(),
}));

// Mock react-markdown and remark-gfm
jest.mock("react-markdown", () => {
  return function ReactMarkdown({ children }) {
    return children;
  };
});

jest.mock("remark-gfm", () => {
  return function remarkGfm() {
    return {};
  };
});

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();
