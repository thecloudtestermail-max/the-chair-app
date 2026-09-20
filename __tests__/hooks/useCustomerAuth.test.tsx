// __tests__/hooks/useCustomerAuth.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { mockFetch, mockFetchOnce } from '../helpers/fetchMock';

const originalFetch = global.fetch;

describe('useCustomerAuth', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('checks /api/customer-auth/me on mount and sets `customer` when signed in', async () => {
    mockFetchOnce({ customerId: '1', name: 'Jamie', email: 'jamie@example.test' });
    const { result } = renderHook(() => useCustomerAuth());
    expect(result.current.customer).toBeUndefined(); // "still checking" sentinel
    await waitFor(() => expect(result.current.customer).not.toBeUndefined());
    expect(result.current.customer?.name).toBe('Jamie');
  });

  it('sets `customer` to null when the me check 401s', async () => {
    mockFetchOnce({ message: 'Not signed in' }, 401);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.customer).toBeNull());
  });

  it('requireSignIn runs the action immediately when already signed in', async () => {
    mockFetchOnce({ customerId: '1', name: 'Jamie', email: 'jamie@example.test' });
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.customer).toBeTruthy());

    const action = vi.fn();
    act(() => result.current.requireSignIn(action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.signInOpen).toBe(false);
  });

  it('requireSignIn opens the sign-in modal (does not run the action yet) when not signed in', async () => {
    mockFetchOnce({ message: 'Not signed in' }, 401);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.customer).toBeNull());

    const action = vi.fn();
    act(() => result.current.requireSignIn(action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.signInOpen).toBe(true);
  });

  it('onSignedIn closes the modal, re-checks auth, and runs the pending action', async () => {
    const fetchMock = mockFetch({
      '/api/customer-auth/me': () => ({ status: 401, json: { message: 'Not signed in' } }),
    });
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.customer).toBeNull());

    const action = vi.fn();
    act(() => result.current.requireSignIn(action));
    expect(result.current.signInOpen).toBe(true);

    // Simulate a successful sign-in: the next /me call now succeeds.
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ customerId: '1', name: 'Jamie', email: 'jamie@example.test' }),
    }));

    act(() => result.current.onSignedIn());
    expect(result.current.signInOpen).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.customer?.name).toBe('Jamie'));
  });

  it('signOut calls the unified logout endpoint and clears `customer`', async () => {
    const fetchMock = mockFetch({
      '/api/customer-auth/me': () => ({ json: { customerId: '1', name: 'Jamie', email: 'jamie@example.test' } }),
      '/api/auth/logout': () => ({ json: { message: 'Logged out' } }),
    });
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.customer?.name).toBe('Jamie'));

    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.customer).toBeNull();
    // One sign-out for everyone: it ends the staff session too.
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });
});
