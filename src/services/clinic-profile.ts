import { ApiError, apiRequestWithSignal } from '../lib/api'
import type { AuthUser, CurrentClinic } from '../lib/auth-session'
import { canManageUsers } from '../lib/permissions'
import type { TenantProfile } from './platform-tenants'

export const getCurrentClinicProfile = async (
    user: AuthUser | null,
    clinic: CurrentClinic | null,
) => {
    if (
        !canManageUsers(user) ||
        !clinic ||
        user.current_tenant_id !== clinic.id
    )
        throw new ApiError({
            statusCode: 403,
            code: 'FORBIDDEN',
            message: 'Clinic administrator access is required.',
            errors: {},
        })
    const response = await apiRequestWithSignal<{ tenants: TenantProfile[] }>({
        method: 'get',
        url: '/api/tenants',
    })
    const tenant = Array.isArray(response.data?.tenants)
        ? response.data.tenants.find(
              item => item.id === clinic.id && item.active === true,
          )
        : null
    if (
        !tenant ||
        tenant.status !== 'active' ||
        typeof tenant.name !== 'string' ||
        typeof tenant.slug !== 'string' ||
        typeof tenant.timezone !== 'string' ||
        typeof tenant.currency !== 'string'
    )
        throw new ApiError({
            statusCode: 0,
            code: 'INVALID_CLINIC_PROFILE',
            message:
                'Unable to verify the current clinic profile. Refresh your session and try again.',
            errors: {},
        })
    return tenant
}
