"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { NGO, AuthToken, LoginRequest, RegisterRequest } from '@/lib/types';
import { apiClient } from '@/lib/api';

interface AuthContextType {
  user: NGO | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (registrationData: RegisterRequest) => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<NGO | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('auth_token');
      
      if (savedToken) {
        try {
          apiClient.setToken(savedToken);
          const userData = await apiClient.getCurrentUser();
          setUser(userData);
          setToken(savedToken);
        } catch (err) {
          // Token is invalid, clear it
          localStorage.removeItem('auth_token');
          apiClient.clearToken();
        }
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      setError(null);
      setIsLoading(true);
      
      const authData = await apiClient.login(credentials);
      const userData = await apiClient.getCurrentUser();
      
      setToken(authData.access_token);
      setUser(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (registrationData: RegisterRequest) => {
    try {
      setError(null);
      setIsLoading(true);
      
      const accountData = await apiClient.register(registrationData);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    apiClient.clearToken();
    setUser(null);
    setToken(null);
    setError(null);
  };

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    register,
    logout,
    error,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
