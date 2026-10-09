import type { ApiError } from './api'

export type AuthSessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthUser {
    email_verified_at?: string | null
    [key: string]: unknown
}

interface WrappedAuthUser {
    user?: AuthUser
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

export const unwrapAuthUser = (
    payload: AuthUser | WrappedAuthUser | null,
): AuthUser | null => {
    if (!payload) {
        return null
    }

    if ('user' in payload && payload.user && typeof payload.user === 'object') {
        return payload.user as AuthUser
    }

    return payload as AuthUser
}

export const getAuthUserDisplayName = (user: AuthUser | null) => {
    if (!user) {
        return 'Account'
    }

    const name = user.name ?? user.fullName

    if (typeof name === 'string' && name.length > 0) {
        return name
    }

    const firstName = typeof user.firstName === 'string' ? user.firstName : ''
    const lastName = typeof user.lastName === 'string' ? user.lastName : ''
    const fullName = `${firstName} ${lastName}`.trim()

    if (fullName.length > 0) {
        return fullName
    }

    return typeof user.email === 'string' && user.email.length > 0
        ? user.email
        : 'Account'
}

export const getAuthUserEmail = (user: AuthUser | null) =>
    user && typeof user.email === 'string' ? user.email : null

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
