const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const compileModule = (sourcePath, requireMap = {}) => {
    const source = fs.readFileSync(sourcePath, 'utf8')
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText
    const moduleRef = { exports: {} }
    const localRequire = id => {
        if (id in requireMap) {
            return requireMap[id]
        }

        return require(id)
    }

    new Function('exports', 'module', 'require', compiled)(
        moduleRef.exports,
        moduleRef,
        localRequire,
    )

    return moduleRef.exports
}

const constants = compileModule(
    path.join(__dirname, '..', 'src', 'Constants', 'index.tsx'),
)
const permissions = compileModule(
    path.join(__dirname, '..', 'src', 'lib', 'permissions.ts'),
    {
        '../Constants': constants,
    },
)

const {
    canAccessModuleId,
    getAuthorizedNavigationModules,
    getFirstAuthorizedModuleId,
    getUserPermissionSet,
} = permissions

const admin = { roles: [{ name: 'admin', slug: 'admin' }] }
const receptionist = { roles: [{ name: 'receptionist' }] }
const billing = { roles: ['billing'] }
const custom = {
    permissions: [{ name: 'patients.view' }, { code: 'messages.view' }],
}
const singularRole = { role: 'admin' }
const roleObjectWithPermissions = {
    role: {
        name: 'custom',
        permissions: [{ name: 'settings.view' }],
    },
}
const canMap = {
    can: {
        'dashboard.view': true,
        'settings.view': false,
        'patients.view': true,
    },
}
const legacyUser = { id: 1, name: 'Legacy User' }
const noPermissions = { roles: [], permissions: [] }

assert.deepEqual(
    getAuthorizedNavigationModules(admin).map(module => module.id),
    [
        'dashboard',
        'calendar',
        'patient_list',
        'treatments',
        'messages',
        'payment_information',
        'settings',
        'reports',
        'audit_logs',
        'user_management',
    ],
)

assert.deepEqual(
    getAuthorizedNavigationModules(receptionist).map(module => module.id),
    ['dashboard', 'calendar', 'patient_list', 'messages', 'reports'],
)

assert.deepEqual(
    getAuthorizedNavigationModules(billing).map(module => module.id),
    ['dashboard', 'payment_information', 'reports'],
)

assert.deepEqual(
    getAuthorizedNavigationModules(custom).map(module => module.id),
    ['patient_list', 'messages'],
)
assert.deepEqual(
    getAuthorizedNavigationModules(singularRole).map(module => module.id),
    [
        'dashboard',
        'calendar',
        'patient_list',
        'treatments',
        'messages',
        'payment_information',
        'settings',
        'reports',
    ],
)
assert.deepEqual(
    getAuthorizedNavigationModules(roleObjectWithPermissions).map(
        module => module.id,
    ),
    ['settings'],
)
assert.deepEqual(
    getAuthorizedNavigationModules(canMap).map(module => module.id),
    ['dashboard', 'patient_list'],
)
assert.deepEqual(
    getAuthorizedNavigationModules(legacyUser).map(module => module.id),
    [
        'dashboard',
        'calendar',
        'patient_list',
        'messages',
        'payment_information',
        'settings',
    ],
)

assert.equal(getFirstAuthorizedModuleId(custom), 'patient_list')
assert.equal(canAccessModuleId(custom, 'patient_list'), true)
assert.equal(canAccessModuleId(custom, 'payment_information'), false)
assert.equal(canAccessModuleId(noPermissions, 'dashboard'), false)
assert.equal(getAuthorizedNavigationModules(noPermissions).length, 0)
assert.equal(
    getUserPermissionSet({ isSuperAdmin: true }).has('settings.view'),
    true,
)
assert.equal(getUserPermissionSet(admin).has('patients.update'), true)
assert.equal(getUserPermissionSet(admin).has('patients.archive'), true)
assert.equal(getUserPermissionSet(admin).has('patients.medical.update'), true)
assert.equal(getUserPermissionSet(receptionist).has('patients.update'), true)
assert.equal(getUserPermissionSet(receptionist).has('patients.archive'), true)
assert.equal(
    getUserPermissionSet(receptionist).has('patients.medical.update'),
    false,
)
assert.equal(
    getUserPermissionSet({ roles: ['dentist'] }).has('patients.view'),
    true,
)
assert.equal(
    getUserPermissionSet({ roles: ['dentist'] }).has('patients.medical.update'),
    true,
)
assert.equal(
    getUserPermissionSet({ roles: ['dentist'] }).has('patients.archive'),
    false,
)

for (const user of [admin, singularRole]) {
    for (const permission of [
        'treatments.view',
        'treatments.create',
        'treatments.update',
        'treatments.delete',
    ]) {
        assert.equal(getUserPermissionSet(user).has(permission), true)
    }
    assert.equal(canAccessModuleId(user, 'treatments'), true)
}
for (const user of [
    null,
    legacyUser,
    noPermissions,
    receptionist,
    billing,
    { roles: ['dentist'] },
]) {
    assert.equal(canAccessModuleId(user, 'treatments'), false)
    assert.equal(getUserPermissionSet(user).has('treatments.create'), false)
    assert.equal(getUserPermissionSet(user).has('treatments.update'), false)
    assert.equal(getUserPermissionSet(user).has('treatments.delete'), false)
}
const treatmentViewer = { permissions: ['treatments.view'] }
assert.equal(canAccessModuleId(treatmentViewer, 'treatments'), true)
assert.equal(
    getUserPermissionSet(treatmentViewer).has('treatments.update'),
    false,
)
assert.equal(
    canAccessModuleId({ permissions: ['treatments.create'] }, 'treatments'),
    false,
)
assert.equal(
    canAccessModuleId({ can: { 'treatments.view': false } }, 'treatments'),
    false,
)

console.log('Permission mapping tests passed.')

const clinicAdmin = {
    current_tenant_id: 37,
    roles: [{ slug: 'admin', name: 'Clinic Admin' }],
    permissions: ['*'],
}
assert.equal(canAccessModuleId(clinicAdmin, 'treatments'), true)
assert.equal(permissions.getClinicalNotePermissions(clinicAdmin).canWrite, true)
const memberOnly = {
    ...clinicAdmin,
    current_tenant_id: 42,
    roles: [],
    permissions: [],
    role: 'admin',
    abilities: ['*'],
    can: { 'patients.view': true },
    isSuperAdmin: true,
    is_super_admin: true,
}
assert.deepEqual(getAuthorizedNavigationModules(memberOnly), [])
assert.deepEqual(permissions.getClinicalNotePermissions(memberOnly), {
    canView: false,
    canWrite: false,
})
assert.equal(getUserPermissionSet({ ...clinicAdmin, permissions: [] }).size, 0)
assert.equal(
    getUserPermissionSet({ current_tenant_id: 42, isSuperAdmin: true }).size,
    0,
)
assert.equal(
    permissions.canViewAuditLogs({ ...memberOnly, permissions: ['*'] }),
    false,
)
assert.equal(
    permissions.canManageUsers({ ...memberOnly, permissions: ['*'] }),
    false,
)
assert.equal(
    permissions.getClinicalNotePermissions({
        ...memberOnly,
        roles: [{ name: 'admin', slug: 'receptionist' }],
        permissions: ['*'],
    }).canWrite,
    false,
)
assert.equal(getUserPermissionSet(clinicAdmin).has('patients.update'), true)
console.log('Clinic-local permission isolation tests passed.')
