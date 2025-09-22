import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Andy\'s Daily Factoids header', () => {
  render(<App />);
  const headerElement = screen.getByText(/Andy's Daily Factoids/i);
  expect(headerElement).toBeInTheDocument();
});
