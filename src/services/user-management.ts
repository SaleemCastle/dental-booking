import { ApiError, apiRequestWithSignal } from '../lib/api'
import type { AuthUser } from '../lib/auth-session'
import { canManageUsers } from '../lib/permissions'

export interface RolePermission {
    id: number
    name: string
    slug: string
    description?: string | null
}
export interface ManagedRole {
    id: number
    name: string
    slug: string
    description?: string | null
    is_system?: boolean
    permissions: RolePermission[]
    assignable?: boolean
}
export interface ManagedUser {
    id: number
    name: string
    email: string
    email_verified_at: string | null
    roles: ManagedRole[]
    status?: string
    required_admin?: boolean
    can_remove_admin?: boolean
}

const request = async <T>(
    actor: AuthUser | null,
    url: string,
    method: 'get' | 'put' = 'get',
    data?: unknown,
    signal?: AbortSignal,
) => {
    if (!canManageUsers(actor))
        throw new ApiError({
            statusCode: actor ? 403 : 401,
            code: actor ? 'FORBIDDEN' : 'UNAUTHENTICATED',
            message:
                'User and role management is available to administrators only.',
            errors: {},
        })
    return (await apiRequestWithSignal<T>({ url, method, data }, signal)).data
}

export const getManagedUsers = async (
    actor: AuthUser,
    signal?: AbortSignal,
) => {
    const data = await request<{ users: ManagedUser[] }>(
        actor,
        '/api/users',
        'get',
        undefined,
        signal,
    )
    if (
        !Array.isArray(data?.users) ||
        data.users.some(user => !Array.isArray(user.roles))
    )
        throw new Error(
            'The user service did not return users with their current roles. Retry or contact support.',
        )
    return data.users
}
export const getManagedUser = async (
    actor: AuthUser,
    id: number,
    signal?: AbortSignal,
) => {
    const data = await request<{ user: ManagedUser }>(
        actor,
        `/api/users/${id}`,
        'get',
        undefined,
        signal,
    )
    if (data?.user?.id !== id || !Array.isArray(data.user.roles))
        throw new Error(
            'The user service did not return current role assignments.',
        )
    return data.user
}
export const getManagedRoles = async (
    actor: AuthUser,
    signal?: AbortSignal,
) => {
    const data = await request<{ roles: ManagedRole[] }>(
        actor,
        '/api/roles',
        'get',
        undefined,
        signal,
    )
    if (
        !Array.isArray(data?.roles) ||
        data.roles.some(role => !Array.isArray(role.permissions))
    )
        throw new Error('The role service returned an unexpected response.')
    return data.roles
}
export const getRolePermissions = async (
    actor: AuthUser,
    signal?: AbortSignal,
) => {
    const data = await request<{ permissions: RolePermission[] }>(
        actor,
        '/api/permissions',
        'get',
        undefined,
        signal,
    )
    if (!Array.isArray(data?.permissions))
        throw new Error(
            'The permission service returned an unexpected response.',
        )
    return data.permissions
}
export const updateUserRoles = async (
    actor: AuthUser,
    id: number,
    roleIds: number[],
) => {
    const data = await request<{ user: ManagedUser }>(
        actor,
        `/api/users/${id}/roles`,
        'put',
        { role_ids: roleIds },
    )
    if (data?.user?.id !== id || !Array.isArray(data.user.roles))
        throw new Error(
            'Roles were submitted, but the updated user could not be read. Refresh before retrying.',
        )
    return data.user
}
export const updateRolePermissions = async (
    actor: AuthUser,
    id: number,
    permissionIds: number[],
) => {
    const data = await request<{ role: ManagedRole }>(
        actor,
        `/api/roles/${id}/permissions`,
        'put',
        { permission_ids: permissionIds },
    )
    if (data?.role?.id !== id || !Array.isArray(data.role.permissions))
        throw new Error(
            'Permissions were submitted, but the updated role could not be read. Refresh before retrying.',
        )
    return data.role
}
