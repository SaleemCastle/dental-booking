import type { ManagedRole, ManagedUser } from '../services/user-management'

export const sameAssignments = (before: number[], after: number[]) =>
    before.length === after.length && before.every(id => after.includes(id))

export const userStatus = (user: ManagedUser) =>
    user.status ||
    (user.email_verified_at ? 'Email verified' : 'Email unverified')

export const filterManagedUsers = (
    users: ManagedUser[],
    search: string,
    role: string,
    status: string,
) => {
    const needle = search.trim().toLowerCase()
    return users.filter(
        user =>
            `${user.name} ${user.email}`.toLowerCase().includes(needle) &&
            (!role || user.roles.some(item => item.slug === role)) &&
            (!status || userStatus(user) === status),
    )
}

export const adminRemovalError = (
    target: ManagedUser,
    ids: number[],
    roles: ManagedRole[],
    users: ManagedUser[],
) => {
    const adminRole = roles.find(role => role.slug === 'admin')
    const wasAdmin = target.roles.some(role => role.slug === 'admin')
    if (!wasAdmin || (adminRole && ids.includes(adminRole.id))) return ''
    if (target.required_admin || target.can_remove_admin === false)
        return 'This account is a required administrator. Its admin role cannot be removed.'
    // /api/users returns the full collection, independently of visible filters.
    if (
        !users.some(
            user =>
                user.id !== target.id &&
                user.roles.some(role => role.slug === 'admin'),
        )
    )
        return 'Assign another administrator before removing the last admin role.'
    return ''
}
