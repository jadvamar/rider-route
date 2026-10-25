import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuthPage from './AuthPage';

const auth = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn() }));
vi.mock('@/store/useAuthStore', () => ({ useAuthStore: () => auth }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('shows and hides the password without changing its value or submitting the form', () => {
  render(<MemoryRouter><AuthPage /></MemoryRouter>);
  const password = screen.getByPlaceholderText('Password');
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'rider@example.com' } });
  fireEvent.change(password, { target: { value: 'test-password' } });
  expect(password).toHaveAttribute('type', 'password');
  expect(password).toHaveAttribute('minlength', '8');

  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(password).toHaveValue('test-password');
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(password).toHaveAttribute('type', 'password');
  expect(password).toHaveValue('test-password');
  expect(auth.login).not.toHaveBeenCalled();
  expect(auth.signup).not.toHaveBeenCalled();
});

it('hides the password when switching modes and supports toggling on signup', () => {
  render(<MemoryRouter><AuthPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
  expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password');

  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password');
});

it('switches to signup for an unregistered email and keeps the email but clears the password', async () => {
  auth.login.mockRejectedValueOnce(new Error('Email not registered'));
  render(<MemoryRouter><AuthPage /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Email')).toHaveValue('new@example.com');
  expect(screen.getByPlaceholderText('Password')).toHaveValue('');
  expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password');
  expect(screen.getByText('No account found for this email. Create an account to continue.')).toBeInTheDocument();
  expect(auth.signup).not.toHaveBeenCalled();
});

it.each(['Invalid email or password', 'Failed to fetch'])('keeps the login form for %s', async (message) => {
  auth.login.mockRejectedValueOnce(new Error(message));
  render(<MemoryRouter><AuthPage /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'rider@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('Email')).toHaveValue('rider@example.com');
  expect(auth.signup).not.toHaveBeenCalled();
});