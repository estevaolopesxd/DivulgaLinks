import { useState, useCallback } from 'react';
import { authApi } from '../services/api';
import type { AuthUser } from '../types';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);

  const isAuthenticated = Boolean(token);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  }, []);

  const updateUser = useCallback((updatedUser: AuthUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    setUser(updatedUser);
  }, []);

  return {
    token,
    user,
    isAuthenticated,
    login,
    logout,
    updateUser,
  };
}
