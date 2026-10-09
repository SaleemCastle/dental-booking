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

const admin = { roles: ['admin'] }
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
        'messages',
        'payment_information',
        'settings',
    ],
)

assert.deepEqual(
    getAuthorizedNavigationModules(receptionist).map(module => module.id),
    ['dashboard', 'calendar', 'patient_list', 'messages'],
)

assert.deepEqual(
    getAuthorizedNavigationModules(billing).map(module => module.id),
    ['dashboard', 'payment_information'],
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
        'messages',
        'payment_information',
        'settings',
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

console.log('Permission mapping tests passed.')
