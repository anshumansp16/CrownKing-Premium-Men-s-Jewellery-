'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { User, AuthResponse } from '@/types';
import { useLoading } from './LoadingContext';
import { saveToken, saveUser, getToken, getUser, clearTokens } from '@/utils/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Cache settings
const AUTH_CACHE_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<AuthResponse | void>;
    register: (name: string, email: string, password: string) => Promise<AuthResponse | void>;
    logout: () => void;
    forgotPassword: (email: string) => Promise<void>;
    resetPassword: (token: string, password: string) => Promise<void>;
    updateProfile: (userData: Partial<User>) => Promise<void>;
    isAuthenticated: boolean;
    setUser: (user: User | null) => void;
    setIsAuthenticated: (isAuthenticated: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const router = useRouter();
    const { startLoading } = useLoading();
    const lastAuthCheck = useRef<number>(0);

    // Optimized auth status check with caching
    const checkAuthStatus = useCallback(async (force = false) => {
        try {
            const token = getToken();
            const cachedUser = getUser();
            const now = Date.now();

            // If no token, not authenticated
            if (!token) {
                setIsAuthenticated(false);
                setUser(null);
                setIsLoading(false);
                return false;
            }

            // Use cached user if valid and not forcing refresh
            if (
                !force &&
                cachedUser &&
                lastAuthCheck.current > 0 &&
                now - lastAuthCheck.current < AUTH_CACHE_TIME
            ) {
                setUser(cachedUser);
                setIsAuthenticated(true);
                setIsLoading(false);
                return true;
            }

            // Fetch fresh user data
            const response = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
                setIsAuthenticated(true);
                saveUser(userData);
                lastAuthCheck.current = now;
                setIsLoading(false);
                return true;
            } else {
                // Token is invalid or expired
                clearTokens();
                setUser(null);
                setIsAuthenticated(false);
                setIsLoading(false);
                return false;
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            setIsLoading(false);
            return false;
        }
    }, []);

    // Check auth status on initial load
    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Login failed');
            }

            const data: AuthResponse = await response.json();
            saveToken(data.token);
            saveUser(data.user);
            setUser(data.user);
            setIsAuthenticated(true);
            lastAuthCheck.current = Date.now();
            return data;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(error.message);
            }
            throw new Error('Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (name: string, email: string, password: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, password }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Registration failed');
            }

            const data: AuthResponse = await response.json();
            saveToken(data.token);
            saveUser(data.user);
            setUser(data.user);
            setIsAuthenticated(true);
            lastAuthCheck.current = Date.now();
            return data;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(error.message);
            }
            throw new Error('Registration failed');
        } finally {
            setIsLoading(false);
        }
    };

    const logout = useCallback(() => {
        clearTokens();
        setUser(null);
        setIsAuthenticated(false);
        lastAuthCheck.current = 0;
        startLoading(); // Start loading before navigation
        router.push('/auth/login');
    }, [router, startLoading]);

    const forgotPassword = async (email: string) => {
        try {
            const response = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to send reset instructions');
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(error.message);
            }
            throw new Error('Failed to send reset instructions');
        }
    };

    const resetPassword = async (token: string, password: string) => {
        try {
            const response = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, password }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Password reset failed');
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(error.message);
            }
            throw new Error('Password reset failed');
        }
    };

    const updateProfile = async (userData: Partial<User>) => {
        try {
            const token = localStorage.getItem('token');

            if (!token) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(`${API_URL}/users/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(userData),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Profile update failed');
            }

            const data = await response.json();
            const updatedUser = data.data;

            // Update local storage and state
            localStorage.setItem('user', JSON.stringify(updatedUser));
            setUser(updatedUser);
            lastAuthCheck.current = Date.now();

            return updatedUser;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(error.message);
            }
            throw new Error('Profile update failed');
        }
    };

    // Memoized context value to prevent unnecessary renders
    const contextValue = React.useMemo(() => ({
        user,
        isLoading,
        login,
        register,
        logout,
        forgotPassword,
        resetPassword,
        updateProfile,
        isAuthenticated,
        setUser: (newUser: User | null) => {
            setUser(newUser);
            if (newUser) {
                saveUser(newUser);
                lastAuthCheck.current = Date.now();
            }
        },
        setIsAuthenticated,
    }), [
        user,
        isLoading,
        login,
        register,
        logout,
        forgotPassword,
        resetPassword,
        updateProfile,
        isAuthenticated,
    ]);

    return (
        <AuthContext.Provider value={contextValue}>
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