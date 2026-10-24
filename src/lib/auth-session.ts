import type { ApiError } from './api'

export type AuthSessionStatus =
    | 'loading'
    | 'authenticated'
    | 'unauthenticated'
    | 'error'

export interface CurrentClinic {
    id: number
    name: string
    slug: string
}

export interface ClinicMembership extends CurrentClinic {
    active: boolean
}

export interface AuthRole {
    id?: number
    tenant_id?: number
    slug?: string
    name?: string
    permissions?: unknown[]
}

export interface AuthUser {
    id?: number
    current_tenant_id?: number
    roles?: Array<AuthRole | string>
    permissions?: unknown[]
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
    // SWR can retain its last successful data after revalidation fails.
    // Never keep using that identity or its clinic grants after an error.
    if (error) {
        return error.statusCode === 401 || error.statusCode === 409
            ? 'unauthenticated'
            : 'error'
    }

    if (user) {
        return 'authenticated'
    }

    if (user === null) {
        return 'unauthenticated'
    }

    return 'loading'
}

export const canRunProtectedApi = (status: AuthSessionStatus) =>
    status === 'authenticated'

// Match only the server-selected ID, never the first membership or an ID from
// browser storage, query parameters, login responses, or a user selector.
export const getCurrentClinic = (
    user: AuthUser,
    memberships: ClinicMembership[],
): CurrentClinic | null => {
    if (
        !Number.isSafeInteger(user.current_tenant_id) ||
        user.current_tenant_id <= 0
    )
        return null
    const clinic = (Array.isArray(memberships) ? memberships : []).find(
        membership =>
            membership.id === user.current_tenant_id &&
            membership.active === true &&
            typeof membership.name === 'string' &&
            membership.name.trim().length > 0 &&
            typeof membership.slug === 'string',
    )
    return clinic
        ? { id: clinic.id, name: clinic.name, slug: clinic.slug }
        : null
}

export const getAuthRoleLabel = (user: AuthUser | null) => {
    const role = user?.roles?.[0]
    if (role && typeof role === 'object') {
        if (role.slug === 'admin') return 'Clinic Admin'
        return role.name || role.slug || 'Team member'
    }
    if (role === 'admin') return 'Clinic Admin'
    return typeof role === 'string' && role ? role : 'Team member'
}

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
    if (status === 'loading' || status === 'error') {
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
