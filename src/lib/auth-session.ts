import type { ApiError } from './api'

export type AuthSessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthUser {
    email_verified_at?: string | null
    [key: string]: unknown
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
