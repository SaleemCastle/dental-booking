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
    unwrapAuthUser,
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
        const user = await apiClient.getData<AuthUser>('/api/user')

        return unwrapAuthUser(user)
    } catch (error) {
        throw normalizeAxiosError(error)
    }
}

const clearBrowserSessionState = () => {
    if (typeof window === 'undefined') {
        return
    }

    try {
        window.localStorage.removeItem('auth:user')
        window.sessionStorage.removeItem('auth:user')
    } catch {
        // Storage may be unavailable in private browsing contexts.
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
    const clearSession = useCallback(() => {
        clearBrowserSessionState()

        return mutate(null, false)
    }, [mutate])

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
