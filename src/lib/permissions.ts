import { Tabs } from '../Constants'
import { AuthUser } from './auth-session'

export type Permission =
    | 'dashboard.view'
    | 'appointments.view'
    | 'appointments.create'
    | 'appointments.update'
    | 'appointments.delete'
    | 'provider_availabilities.view'
    | 'provider_availabilities.update'
    | 'patients.view'
    | 'patients.update'
    | 'patients.archive'
    | 'patients.medical.update'
    | 'dental_charts.view'
    | 'dental_charts.create'
    | 'treatment_plans.view'
    | 'treatment_plans.create'
    | 'treatment_plans.update'
    | 'clinical_notes.view'
    | 'patient_documents.view'
    | 'patient_documents.create'
    | 'patient_documents.archive'
    | 'patient_documents.delete'
    | 'tasks.view'
    | 'tasks.create'
    | 'tasks.update'
    | 'tasks.delete'
    | 'treatments.view'
    | 'treatments.create'
    | 'treatments.update'
    | 'treatments.delete'
    | 'messages.view'
    | 'payments.view'
    | 'payments.create'
    | 'invoices.view'
    | 'invoices.create'
    | 'invoices.update'
    | 'settings.view'

export type AppModule =
    | 'dashboard'
    | 'calendar'
    | 'patient_list'
    | 'treatments'
    | 'messages'
    | 'payment_information'
    | 'settings'
    | 'audit_logs'
    | 'user_management'

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
        'tasks.view',
        'tasks.create',
        'tasks.update',
        'tasks.delete',
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
    {
        id: 'audit_logs',
        label: Tabs.AuditLogs,
        href: { pathname: '/', query: { tab: 'audit_logs' } },
        // Audit access uses role slugs, independently of permission grants.
        permissions: [],
    },
    {
        id: 'user_management',
        label: Tabs.UserManagement,
        href: { pathname: '/', query: { tab: 'user_management' } },
        permissions: [],
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

    // Tenant sessions use only /api/user's flattened clinic-local grants.
    // Neither role defaults, legacy aliases nor account flags extend them.
    if ('current_tenant_id' in user) {
        getNamedValues(user.permissions, [
            'slug',
            'key',
            'code',
            'name',
        ]).forEach(permission => addPermission(permissions, permission))
        return { hasPermissionPayload: true, permissions }
    }

    if ('permissions' in user) {
        hasPermissionPayload = true
        getNamedValues(user.permissions, [
            'slug',
            'key',
            'code',
            'name',
        ]).forEach(permission => addPermission(permissions, permission))
    }

    if ('abilities' in user) {
        hasPermissionPayload = true
        getNamedValues(user.abilities, [
            'slug',
            'key',
            'code',
            'name',
        ]).forEach(permission => addPermission(permissions, permission))
    }

    if ('can' in user) {
        hasPermissionPayload =
            addPermissionsFromCanMap(permissions, user.can) ||
            hasPermissionPayload
    }

    // The API's flattened permissions are authoritative, including an empty
    // array after an admin removes a role's grants. Do not add legacy defaults.
    if (hasPermissionPayload) return { hasPermissionPayload, permissions }

    if ('roles' in user) {
        hasPermissionPayload = true
        if (Array.isArray(user.roles)) {
            user.roles.forEach(role => {
                if (typeof role === 'string')
                    addRolePermissions(permissions, role)
                if (role && typeof role === 'object') {
                    const record = role as Record<string, unknown>
                    if (!('permissions' in record))
                        addRolePermissions(
                            permissions,
                            record.slug ?? record.key ?? record.name,
                        )
                    getNamedValues(record.permissions, [
                        'slug',
                        'key',
                        'code',
                        'name',
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
                const roleName = record.slug ?? record.key ?? record.name

                if (!('permissions' in record))
                    addRolePermissions(permissions, roleName)
                getNamedValues(record.permissions, [
                    'slug',
                    'key',
                    'code',
                    'name',
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

    const extracted = extractUserPermissions(user)

    if (!extracted.hasPermissionPayload) {
        return getLegacyFallbackPermissions()
    }

    extracted.permissions.forEach(permission => permissions.add(permission))

    // Resolve M1 resource/action wildcards for the permissions used by the UI.
    // Clinical-note writes retain their separate role-only policy below.
    const knownPermissions = new Set<Permission>([
        ...Object.values(rolePermissions).flat(),
        'clinical_notes.view',
        'provider_availabilities.view',
        'provider_availabilities.update',
        'dental_charts.view',
        'patient_documents.view',
        'patient_documents.create',
        'patient_documents.archive',
        'patient_documents.delete',
        'dental_charts.create',
        'treatment_plans.view',
        'treatment_plans.create',
        'treatment_plans.update',
        'invoices.view',
        'invoices.create',
        'invoices.update',
        'payments.create',
    ])
    knownPermissions.forEach(permission => {
        if (
            Array.from(extracted.permissions as Set<string>).some(
                value =>
                    value === '*' ||
                    (value.endsWith('.*') &&
                        permission.startsWith(value.slice(0, -1))) ||
                    (value.startsWith('*.') &&
                        permission.endsWith(value.slice(1))),
            )
        )
            permissions.add(permission)
    })

    return permissions
}

export const getProviderAvailabilityPermissions = (user: AuthUser | null) => {
    const permissions = getUserPermissionSet(user)
    const clinicAdmin = Boolean(
        user &&
            'current_tenant_id' in user &&
            user.roles?.some(
                role => typeof role === 'object' && role?.slug === 'admin',
            ),
    )
    return {
        canView: clinicAdmin || permissions.has('provider_availabilities.view'),
        canUpdate:
            clinicAdmin || permissions.has('provider_availabilities.update'),
    }
}

// Clinical-note writes deliberately bypass general permission and wildcard
// grants. Provider records are unrelated to authenticated user identities.
export const getClinicalNotePermissions = (user: AuthUser | null) => {
    if (!user) return { canView: false, canWrite: false }
    const isClinicSession = 'current_tenant_id' in user
    const roles = new Set(
        getNamedValues(
            user.roles,
            isClinicSession ? ['slug'] : ['slug', 'key', 'name'],
        ),
    )
    if (!isClinicSession) {
        ;['role', 'roleName', 'role_name'].forEach(field => {
            getNamedValues(
                [user[field]],
                ['slug', 'key', 'name'],
            ).forEach(role => roles.add(role))
        })
    }
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

const getClinicalResourcePermissions = (
    user: AuthUser | null,
    resource: 'dental_charts' | 'treatment_plans' | 'patient_documents',
) => {
    if (!user) return { canView: false, canWrite: false }
    const isClinicSession = 'current_tenant_id' in user
    const roles = new Set(
        getNamedValues(
            user.roles,
            isClinicSession ? ['slug'] : ['slug', 'key', 'name'],
        ),
    )
    if (!isClinicSession) {
        ;['role', 'roleName', 'role_name'].forEach(field => {
            getNamedValues(
                [user[field]],
                ['slug', 'key', 'name'],
            ).forEach(role => roles.add(role))
        })
    }
    return {
        canView:
            roles.has('admin') ||
            roles.has('dentist') ||
            getUserPermissionSet(user).has(`${resource}.view`),
        canWrite:
            roles.has('admin') ||
            (roles.has('dentist') && !roles.has('receptionist')),
    }
}

export const getDentalChartPermissions = (user: AuthUser | null) =>
    getClinicalResourcePermissions(user, 'dental_charts')
export const getTreatmentPlanPermissions = (user: AuthUser | null) =>
    getClinicalResourcePermissions(user, 'treatment_plans')
export const getPatientDocumentPermissions = (user: AuthUser | null) =>
    getClinicalResourcePermissions(user, 'patient_documents')

// Only the role slugs returned by /api/user grant audit access. Display names,
// legacy role aliases, permission wildcards, and super-admin flags do not.
export const canViewAuditLogs = (user: AuthUser | null) => {
    return Boolean(
        user &&
            Array.isArray(user.roles) &&
            user.roles.some(
                role =>
                    role &&
                    typeof role === 'object' &&
                    ['admin', 'auditor'].includes(
                        (role as { slug?: string }).slug,
                    ),
            ),
    )
}

// Management requires the authenticated API's canonical admin role. Generic
// permission grants, legacy sessions and super-admin flags are insufficient.
export const canManageUsers = (user: AuthUser | null) =>
    Boolean(
        user &&
            Array.isArray(user.roles) &&
            user.roles.some(
                role =>
                    role &&
                    typeof role === 'object' &&
                    (role as { slug?: string }).slug === 'admin',
            ),
    )

export const canAccessModule = (
    user: AuthUser | null,
    module: NavigationModule,
) => {
    if (module.id === 'audit_logs') return canViewAuditLogs(user)
    if (module.id === 'user_management') return canManageUsers(user)
    if (module.id === 'payment_information') {
        const billing = getBillingPermissions(user)
        return (
            Object.values(billing).some(Boolean) ||
            getUserPermissionSet(user).has('payments.view')
        )
    }
    const permissions = getUserPermissionSet(user)

    return module.permissions.every(permission => permissions.has(permission))
}

export const getBillingPermissions = (user: AuthUser | null) => {
    const roles = new Set(
        getNamedValues(
            user?.roles,
            user && 'current_tenant_id' in user
                ? ['slug']
                : ['slug', 'key', 'name'],
        ),
    )
    const grants = user
        ? (extractUserPermissions(user).permissions as Set<string>)
        : new Set<string>()
    const allows = (permission: string) =>
        Array.from(grants).some(
            value =>
                value === permission ||
                value === '*' ||
                (value.endsWith('.*') &&
                    permission.startsWith(value.slice(0, -1))) ||
                (value.startsWith('*.') && permission.endsWith(value.slice(1))),
        )
    const write = roles.has('admin') || roles.has('billing')
    const read = write || roles.has('auditor')
    return {
        canViewInvoices: read || allows('invoices.view'),
        canCreateInvoice: write || allows('invoices.create'),
        canUpdateInvoice: write || allows('invoices.update'),
        canViewPayments: read || allows('payments.view'),
        canRecordPayment: write || allows('payments.create'),
    }
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
