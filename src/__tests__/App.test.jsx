import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App Component', () => {
  it('renders main heading', () => {
    render(<App />);
    expect(screen.getByText(/FlipLedger/i)).toBeInTheDocument();
  });
});
