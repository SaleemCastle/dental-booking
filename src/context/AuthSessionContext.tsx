import React, {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useMemo,
} from 'react'
import useSWR from 'swr'
import { ApiError, apiClient, normalizeAxiosError } from '../lib/api'
import {
    AuthSessionStatus,
    AuthUser,
    resolveSessionStatus,
} from '../lib/auth-session'

interface AuthSessionContextValue {
    user: AuthUser | null
    error?: ApiError
    status: AuthSessionStatus
    isLoading: boolean
    isAuthenticated: boolean
    isUnauthenticated: boolean
    refreshSession: () => Promise<AuthUser | null | undefined>
    clearSession: () => Promise<AuthUser | null | undefined>
}

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(
    undefined,
)

const fetchSessionUser = async () => {
    try {
        return await apiClient.getData<AuthUser>('/api/user')
    } catch (error) {
        throw normalizeAxiosError(error)
    }
}

export const AuthSessionProvider = ({ children }: { children: ReactNode }) => {
    const { data: user, error, mutate } = useSWR<AuthUser | null, ApiError>(
        '/api/user',
        fetchSessionUser,
        {
            shouldRetryOnError: false,
            revalidateOnFocus: false,
        },
    )

    const status = resolveSessionStatus(user, error)

    const refreshSession = useCallback(() => mutate(), [mutate])
    const clearSession = useCallback(() => mutate(null, false), [mutate])

    const value = useMemo<AuthSessionContextValue>(
        () => ({
            user: user ?? null,
            error,
            status,
            isLoading: status === 'loading',
            isAuthenticated: status === 'authenticated',
            isUnauthenticated: status === 'unauthenticated',
            refreshSession,
            clearSession,
        }),
        [clearSession, error, refreshSession, status, user],
    )

    return (
        <AuthSessionContext.Provider value={value}>
            {children}
        </AuthSessionContext.Provider>
    )
}

export const useAuthSession = () => {
    const context = useContext(AuthSessionContext)

    if (!context) {
        throw new Error(
            'useAuthSession must be used inside AuthSessionProvider',
        )
    }

    return context
}
