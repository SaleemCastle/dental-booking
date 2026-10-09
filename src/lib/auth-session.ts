import type { ApiError } from './api'

export type AuthSessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthUser {
    email_verified_at?: string | null
    [key: string]: unknown
}

interface AuthRouteDecisionProps {
    middleware?: string
    redirectIfAuthenticated?: string
    currentPath: string
    status: AuthSessionStatus
    user: AuthUser | null
    errorStatusCode?: number
}

export const resolveSessionStatus = (
    user: AuthUser | null | undefined,
    error?: ApiError,
): AuthSessionStatus => {
    if (user) {
        return 'authenticated'
    }

    if (error || user === null) {
        return 'unauthenticated'
    }

    return 'loading'
}

export const canRunProtectedApi = (status: AuthSessionStatus) =>
    status === 'authenticated'

export const getAuthRouteRedirect = ({
    middleware,
    redirectIfAuthenticated,
    currentPath,
    status,
    user,
    errorStatusCode,
}: AuthRouteDecisionProps) => {
    if (status === 'loading') {
        return null
    }

    if (middleware === 'guest' && redirectIfAuthenticated && user) {
        return redirectIfAuthenticated
    }

    if (currentPath === '/verify-email' && user?.email_verified_at) {
        return redirectIfAuthenticated ?? '/'
    }

    if (middleware !== 'auth' || status !== 'unauthenticated') {
        return null
    }

    if (errorStatusCode === 409 && currentPath !== '/verify-email') {
        return '/verify-email'
    }

    if (errorStatusCode !== 409) {
        return '/login'
    }

    return null
}
