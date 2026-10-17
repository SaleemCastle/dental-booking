import { Tabs } from '../Constants'
import { AuthUser } from './auth-session'

export type Permission =
    | 'dashboard.view'
    | 'appointments.view'
    | 'appointments.create'
    | 'appointments.update'
    | 'appointments.delete'
    | 'patients.view'
    | 'patients.update'
    | 'patients.archive'
    | 'patients.medical.update'
    | 'clinical_notes.view'
    | 'treatments.view'
    | 'treatments.create'
    | 'treatments.update'
    | 'treatments.delete'
    | 'messages.view'
    | 'payments.view'
    | 'settings.view'

export type AppModule =
    | 'dashboard'
    | 'calendar'
    | 'patient_list'
    | 'treatments'
    | 'messages'
    | 'payment_information'
    | 'settings'

interface UserRole {
    name?: string
    slug?: string
    key?: string
}

interface UserPermission {
    name?: string
    slug?: string
    key?: string
    code?: string
}
interface PermissionExtraction {
    hasPermissionPayload: boolean
    permissions: Set<Permission>
}

export interface NavigationModule {
    id: AppModule
    label: Tabs
    href: {
        pathname: '/'
        query: { tab: AppModule }
    }
    permissions: Permission[]
}

const rolePermissions: Record<string, Permission[]> = {
    admin: [
        'dashboard.view',
        'appointments.view',
        'appointments.create',
        'appointments.update',
        'appointments.delete',
        'patients.view',
        'patients.update',
        'patients.archive',
        'patients.medical.update',
        'treatments.view',
        'treatments.create',
        'treatments.update',
        'treatments.delete',
        'messages.view',
        'payments.view',
        'settings.view',
    ],
    dentist: [
        'dashboard.view',
        'appointments.view',
        'patients.view',
        'patients.medical.update',
        'messages.view',
    ],
    receptionist: [
        'dashboard.view',
        'appointments.view',
        'patients.view',
        'patients.update',
        'patients.archive',
        'messages.view',
    ],
    billing: ['dashboard.view', 'payments.view'],
}

export const navigationModules: NavigationModule[] = [
    {
        id: 'dashboard',
        label: Tabs.Dashboard,
        href: { pathname: '/', query: { tab: 'dashboard' } },
        permissions: ['dashboard.view'],
    },
    {
        id: 'calendar',
        label: Tabs.Calendar,
        href: { pathname: '/', query: { tab: 'calendar' } },
        permissions: ['appointments.view'],
    },
    {
        id: 'patient_list',
        label: Tabs.PatientList,
        href: { pathname: '/', query: { tab: 'patient_list' } },
        permissions: ['patients.view'],
    },
    {
        id: 'treatments',
        label: Tabs.Treatments,
        href: { pathname: '/', query: { tab: 'treatments' } },
        permissions: ['treatments.view'],
    },
    {
        id: 'messages',
        label: Tabs.Messages,
        href: { pathname: '/', query: { tab: 'messages' } },
        permissions: ['messages.view'],
    },
    {
        id: 'payment_information',
        label: Tabs.PaymentInformation,
        href: { pathname: '/', query: { tab: 'payment_information' } },
        permissions: ['payments.view'],
    },
    {
        id: 'settings',
        label: Tabs.Settings,
        href: { pathname: '/', query: { tab: 'settings' } },
        permissions: ['settings.view'],
    },
]

const normalizeToken = (value: unknown) =>
    typeof value === 'string' ? value.trim().toLowerCase() : null

const getNamedValues = (
    values: unknown,
    keys: Array<keyof UserPermission | keyof UserRole>,
) => {
    if (!Array.isArray(values)) {
        return []
    }

    return values
        .map(value => {
            if (typeof value === 'string') {
                return normalizeToken(value)
            }

            if (!value || typeof value !== 'object') {
                return null
            }

            const record = value as Record<string, unknown>

            for (const key of keys) {
                const token = normalizeToken(record[key])

                if (token) {
                    return token
                }
            }

            return null
        })
        .filter((value): value is string => Boolean(value))
}

const addPermission = (permissions: Set<Permission>, value: unknown) => {
    const token = normalizeToken(value)

    if (token) {
        permissions.add(token as Permission)
    }
}

const addRolePermissions = (permissions: Set<Permission>, role: unknown) => {
    const token = normalizeToken(role)

    if (token) {
        rolePermissions[token]?.forEach(permission =>
            permissions.add(permission),
        )
    }
}

const addPermissionsFromCanMap = (
    permissions: Set<Permission>,
    canMap: unknown,
) => {
    if (!canMap || typeof canMap !== 'object' || Array.isArray(canMap)) {
        return false
    }

    Object.entries(canMap as Record<string, unknown>).forEach(
        ([permission, allowed]) => {
            if (allowed === true) {
                addPermission(permissions, permission)
            }
        },
    )

    return true
}

const extractUserPermissions = (user: AuthUser): PermissionExtraction => {
    const permissions = new Set<Permission>()
    let hasPermissionPayload = false

    if ('permissions' in user) {
        hasPermissionPayload = true
        getNamedValues(user.permissions, [
            'name',
            'slug',
            'key',
            'code',
        ]).forEach(permission => addPermission(permissions, permission))
    }

    if ('abilities' in user) {
        hasPermissionPayload = true
        getNamedValues(user.abilities, [
            'name',
            'slug',
            'key',
            'code',
        ]).forEach(permission => addPermission(permissions, permission))
    }

    if ('can' in user) {
        hasPermissionPayload = addPermissionsFromCanMap(permissions, user.can)
    }

    if ('roles' in user) {
        hasPermissionPayload = true
        getNamedValues(user.roles, ['name', 'slug', 'key']).forEach(role =>
            addRolePermissions(permissions, role),
        )

        if (Array.isArray(user.roles)) {
            user.roles.forEach(role => {
                if (role && typeof role === 'object') {
                    const record = role as Record<string, unknown>
                    getNamedValues(record.permissions, [
                        'name',
                        'slug',
                        'key',
                        'code',
                    ]).forEach(permission =>
                        addPermission(permissions, permission),
                    )
                }
            })
        }
    }

    ;['role', 'roleName', 'role_name'].forEach(field => {
        if (field in user) {
            hasPermissionPayload = true
            const role = user[field]

            if (typeof role === 'string') {
                addRolePermissions(permissions, role)
                return
            }

            if (role && typeof role === 'object') {
                const record = role as Record<string, unknown>
                const roleName = record.name ?? record.slug ?? record.key

                addRolePermissions(permissions, roleName)
                getNamedValues(record.permissions, [
                    'name',
                    'slug',
                    'key',
                    'code',
                ]).forEach(permission => addPermission(permissions, permission))
            }
        }
    })

    return { hasPermissionPayload, permissions }
}

const getLegacyFallbackPermissions = () => {
    const permissions = new Set<Permission>()

    navigationModules.forEach(module => {
        // Legacy sessions have no catalog authorization information.
        if (module.id === 'treatments') {
            return
        }

        module.permissions.forEach(permission => permissions.add(permission))
    })

    return permissions
}

export const getUserPermissionSet = (user: AuthUser | null) => {
    const permissions = new Set<Permission>()

    if (!user) {
        return permissions
    }

    if (user.isSuperAdmin === true || user.is_super_admin === true) {
        rolePermissions.admin.forEach(permission => permissions.add(permission))
        navigationModules.forEach(module => {
            module.permissions.forEach(permission =>
                permissions.add(permission),
            )
        })

        return permissions
    }

    const extracted = extractUserPermissions(user)

    if (!extracted.hasPermissionPayload) {
        return getLegacyFallbackPermissions()
    }

    extracted.permissions.forEach(permission => permissions.add(permission))

    return permissions
}

// Clinical-note writes deliberately bypass general permission and wildcard
// grants. Provider records are unrelated to authenticated user identities.
export const getClinicalNotePermissions = (user: AuthUser | null) => {
    if (!user) return { canView: false, canWrite: false }
    const roles = new Set(getNamedValues(user.roles, ['name', 'slug', 'key']))
    ;['role', 'roleName', 'role_name'].forEach(field => {
        getNamedValues([user[field]], ['name', 'slug', 'key']).forEach(role =>
            roles.add(role),
        )
    })
    const canWrite =
        roles.has('admin') ||
        (roles.has('dentist') && !roles.has('receptionist'))
    const permissions = extractUserPermissions(user).permissions as Set<string>
    const canView =
        canWrite ||
        [
            'clinical_notes.view',
            'clinical_notes.*',
            '*.view',
            '*',
        ].some(permission => permissions.has(permission))
    return { canView, canWrite }
}

export const canAccessModule = (
    user: AuthUser | null,
    module: NavigationModule,
) => {
    const permissions = getUserPermissionSet(user)

    return module.permissions.every(permission => permissions.has(permission))
}

export const getAuthorizedNavigationModules = (user: AuthUser | null) =>
    navigationModules.filter(module => canAccessModule(user, module))

export const findModuleById = (moduleId: string) =>
    navigationModules.find(module => module.id === moduleId)

export const getFirstAuthorizedModuleId = (user: AuthUser | null) =>
    getAuthorizedNavigationModules(user)[0]?.id ?? null

export const canAccessModuleId = (user: AuthUser | null, moduleId: string) => {
    const appModule = findModuleById(moduleId)

    return appModule ? canAccessModule(user, appModule) : false
}
