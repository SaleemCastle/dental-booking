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
    currentTenant: CurrentClinic
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
