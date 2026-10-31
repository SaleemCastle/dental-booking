import { ApiError, apiRequestWithSignal, PaginationMeta } from '../lib/api'

export interface TenantProfile {
    id: number
    name: string
    slug: string
    active: boolean
    status: 'active' | 'suspended'
    timezone: string
    currency: string
    contact_email: string | null
    contact_phone?: string | null
    address?: string | null
    branding?: {
        display_name?: string | null
        primary_color?: string | null
        logo_url?: string | null
    } | null
}
export interface ProvisionTenantInput {
    idempotency_key: string
    name: string
    slug: string
    contact_email: string
    timezone: string
    currency: string
    contact_phone?: string
    address?: string
    branding?: {
        display_name?: string
        primary_color?: string
        logo_url?: string
    }
    admin: { name: string; email: string; password: string }
}
const invalid = () =>
    new ApiError({
        statusCode: 0,
        code: 'INVALID_PLATFORM_RESPONSE',
        message:
            'The platform API returned an invalid clinic profile. Please retry.',
        errors: {},
    })
const profile = (value: TenantProfile): TenantProfile => {
    if (
        !value ||
        !Number.isSafeInteger(value.id) ||
        value.id <= 0 ||
        typeof value.name !== 'string' ||
        typeof value.slug !== 'string' ||
        typeof value.active !== 'boolean' ||
        value.status !== (value.active ? 'active' : 'suspended') ||
        typeof value.timezone !== 'string' ||
        typeof value.currency !== 'string'
    )
        throw invalid()
    return value
}
// Platform requests intentionally have no clinic header or client role fallback.
export const listPlatformTenants = async (page = 1, signal?: AbortSignal) => {
    const response = await apiRequestWithSignal<{ tenants: TenantProfile[] }>(
        {
            method: 'get',
            url: '/api/platform/tenants',
            params: { page },
        },
        signal,
    )
    if (!Array.isArray(response.data?.tenants)) throw invalid()
    const meta = response.meta?.pagination as PaginationMeta | undefined
    return {
        tenants: response.data.tenants.map(profile),
        meta: meta ?? response.meta ?? {},
    }
}
export const getPlatformTenant = async (id: number, signal?: AbortSignal) => {
    const response = await apiRequestWithSignal<{ tenant: TenantProfile }>(
        {
            method: 'get',
            url: `/api/platform/tenants/${id}`,
        },
        signal,
    )
    const tenant = profile(response.data?.tenant)
    if (tenant.id !== id) throw invalid()
    return tenant
}
export const provisionPlatformTenant = async (data: ProvisionTenantInput) => {
    const response = await apiRequestWithSignal<{
        tenant: TenantProfile
        initial_admin_id: number
    }>({
        method: 'post',
        url: '/api/platform/tenants',
        data,
    })
    const tenant = profile(response.data?.tenant)
    if (
        !Number.isSafeInteger(response.data?.initial_admin_id) ||
        response.data.initial_admin_id <= 0
    )
        throw invalid()
    return {
        tenant,
        initialAdminId: response.data.initial_admin_id,
        replayed: response.statusCode === 200,
    }
}
export const setPlatformTenantStatus = async (
    id: number,
    status: TenantProfile['status'],
) => {
    const response = await apiRequestWithSignal<{ tenant: TenantProfile }>({
        method: 'patch',
        url: `/api/platform/tenants/${id}/status`,
        data: { status },
    })
    const tenant = profile(response.data?.tenant)
    if (tenant.id !== id || tenant.status !== status) throw invalid()
    return tenant
}
