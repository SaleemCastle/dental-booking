import { ApiError, apiClient } from '../lib/api'
import {
    AuthUser,
    ClinicMembership,
    CurrentClinic,
    getCurrentClinic,
    unwrapAuthUser,
} from '../lib/auth-session'

export interface ClinicSession {
    user: AuthUser
    currentTenant: CurrentClinic | null
}

// Account identity only. Platform authority is checked by the platform API,
// never inferred from clinic roles or a user response flag.
export const getPlatformIdentitySession = async (): Promise<ClinicSession> => {
    const user = unwrapAuthUser(await apiClient.getData<AuthUser>('/api/user'))
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0)
        throw new ApiError({
            statusCode: 0,
            code: 'INVALID_ACCOUNT_SESSION',
            message: 'Unable to verify your account.',
            errors: {},
        })
    return { user, currentTenant: null }
}

export const getClinicSession = async (): Promise<ClinicSession> => {
    const payload = await apiClient.getData<AuthUser>('/api/user')
    const user = unwrapAuthUser(payload)
    const invalidSession = () =>
        new ApiError({
            statusCode: 0,
            code: 'INVALID_CLINIC_SESSION',
            message: 'Unable to verify the current clinic session.',
            errors: {},
        })
    if (
        !user ||
        !Number.isSafeInteger(user.id) ||
        user.id <= 0 ||
        !Array.isArray(user.roles) ||
        !Array.isArray(user.permissions)
    )
        throw invalidSession()
    const memberships = await apiClient.getData<{
        tenants: ClinicMembership[]
    }>('/api/tenants')
    const currentTenant = getCurrentClinic(user, memberships?.tenants ?? [])
    if (!currentTenant) throw invalidSession()
    return { user, currentTenant }
}
