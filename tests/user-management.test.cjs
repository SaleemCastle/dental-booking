const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const compile = (file, mocks = {}) => {
    const output = ts.transpileModule(
        fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
        {
            fileName: file,
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                jsx: ts.JsxEmit.React,
                esModuleInterop: true,
            },
        },
    ).outputText
    const module = { exports: {} }
    new Function('module', 'exports', 'require', output)(
        module,
        module.exports,
        id => (id in mocks ? mocks[id] : require(id)),
    )
    return module.exports
}
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
const workflow = compile('lib/user-management.ts')
class ApiError extends Error {
    constructor(shape) {
        super(shape.message)
        Object.assign(this, shape)
    }
}
const adminRole = {
    id: 1,
    slug: 'admin',
    name: 'Administrator',
    permissions: [],
}
const dentistRole = { id: 2, slug: 'dentist', name: 'Dentist', permissions: [] }
const admin = { id: 1, roles: [adminRole] }
const target = {
    id: 2,
    name: 'Jane Doe',
    email: 'jane@clinic.test',
    roles: [dentistRole],
    email_verified_at: null,
}
const requests = []
let response, failure
const service = compile('services/user-management.ts', {
    '../lib/permissions': permissions,
    '../lib/api': {
        ApiError,
        apiRequestWithSignal: async (config, signal) => {
            requests.push({ ...config, signal })
            if (failure) throw failure
            return { data: response }
        },
    },
})
async function run() {
    const denied = [
        null,
        {},
        { permissions: ['*', 'users.manage'] },
        { isSuperAdmin: true },
        { roles: ['admin'] },
        { role: 'admin' },
        { roles: [{ name: 'admin', slug: 'dentist' }] },
        ...[
            'dentist',
            'hygienist',
            'receptionist',
            'billing',
            'auditor',
        ].map(slug => ({ roles: [{ slug }] })),
    ]
    for (const actor of denied) {
        assert.equal(permissions.canManageUsers(actor), false)
        assert.equal(
            permissions.canAccessModuleId(actor, 'user_management'),
            false,
        )
        assert.ok(
            !permissions
                .getAuthorizedNavigationModules(actor)
                .some(item => item.id === 'user_management'),
        )
        const before = requests.length
        for (const action of [
            () => service.getManagedUsers(actor),
            () => service.getManagedUser(actor, 2),
            () => service.getManagedRoles(actor),
            () => service.getRolePermissions(actor),
            () => service.updateUserRoles(actor, 2, [1]),
            () => service.updateRolePermissions(actor, 2, [1]),
        ])
            await assert.rejects(
                action,
                error => error.statusCode === (actor ? 403 : 401),
            )
        assert.equal(
            requests.length,
            before,
            'Unauthorized actions never make HTTP requests',
        )
    }
    assert.equal(permissions.canAccessModuleId(admin, 'user_management'), true)
    // Empty backend grants must override legacy role defaults after permission edits.
    assert.equal(
        permissions
            .getUserPermissionSet({ roles: [adminRole], permissions: [] })
            .has('patients.view'),
        false,
    )
    assert.equal(
        permissions
            .getUserPermissionSet({ roles: [adminRole] })
            .has('patients.view'),
        false,
    )
    assert.equal(
        permissions
            .getUserPermissionSet({
                roles: [adminRole],
                permissions: ['patients.view'],
            })
            .has('patients.view'),
        true,
    )
    assert.equal(
        permissions
            .getUserPermissionSet({
                roles: [
                    {
                        ...adminRole,
                        permissions: [
                            { slug: 'patients.view', name: 'View patients' },
                        ],
                    },
                ],
            })
            .has('patients.view'),
        true,
    )
    assert.equal(workflow.userStatus(target), 'Email unverified')
    assert.equal(
        workflow.userStatus({ ...target, email_verified_at: '2026-10-19' }),
        'Email verified',
    )
    assert.equal(
        workflow.userStatus({ ...target, status: 'suspended' }),
        'suspended',
    )
    assert.deepEqual(
        workflow.filterManagedUsers(
            [target],
            '  JANE@  ',
            'dentist',
            'Email unverified',
        ),
        [target],
    )
    assert.deepEqual(workflow.filterManagedUsers([target], '', 'admin', ''), [])
    assert.deepEqual(
        workflow.filterManagedUsers([target], '', '', 'Email verified'),
        [],
    )
    assert.equal(workflow.sameAssignments([1, 2], [2, 1]), true)
    assert.equal(workflow.sameAssignments([1], []), false)
    const adminTarget = { ...target, roles: [adminRole] }
    assert.match(
        workflow.adminRemovalError(adminTarget, [], [adminRole], [adminTarget]),
        /last admin/,
    )
    assert.match(
        workflow.adminRemovalError(
            { ...adminTarget, required_admin: true },
            [],
            [adminRole],
            [admin, adminTarget],
        ),
        /required/,
    )
    assert.match(
        workflow.adminRemovalError(
            { ...adminTarget, can_remove_admin: false },
            [],
            [adminRole],
            [admin, adminTarget],
        ),
        /required/,
    )
    assert.equal(
        workflow.adminRemovalError(
            adminTarget,
            [],
            [adminRole],
            [admin, adminTarget],
        ),
        '',
    )
    assert.equal(
        workflow.adminRemovalError(
            adminTarget,
            [1],
            [adminRole],
            [adminTarget],
        ),
        '',
    )
    assert.equal(
        workflow.adminRemovalError(target, [], [adminRole], [target]),
        '',
    )
    const signal = new AbortController().signal
    response = { users: [target] }
    assert.deepEqual(await service.getManagedUsers(admin, signal), [target])
    assert.equal(requests.at(-1).url, '/api/users')
    assert.equal(requests.at(-1).signal, signal)
    response = { user: target }
    assert.deepEqual(await service.getManagedUser(admin, 2), target)
    assert.equal(requests.at(-1).url, '/api/users/2')
    response = { roles: [adminRole, dentistRole] }
    assert.equal((await service.getManagedRoles(admin)).length, 2)
    assert.equal(requests.at(-1).url, '/api/roles')
    response = { permissions: [] }
    assert.deepEqual(await service.getRolePermissions(admin), [])
    assert.equal(requests.at(-1).url, '/api/permissions')
    for (const ids of [[1, 2], []]) {
        response = {
            user: {
                ...target,
                roles: ids.length ? [adminRole, dentistRole] : [],
            },
        }
        assert.deepEqual(
            (await service.updateUserRoles(admin, 2, ids)).roles,
            response.user.roles,
        )
        assert.deepEqual(requests.at(-1), {
            url: '/api/users/2/roles',
            method: 'put',
            data: { role_ids: ids },
            signal: undefined,
        })
        response = { role: dentistRole }
        await service.updateRolePermissions(admin, 2, ids)
        assert.deepEqual(requests.at(-1), {
            url: '/api/roles/2/permissions',
            method: 'put',
            data: { permission_ids: ids },
            signal: undefined,
        })
    }
    for (const statusCode of [401, 403, 404, 409, 422, 500]) {
        failure = new ApiError({
            statusCode,
            message: 'Backend rejected the assignment',
            code: 'LAST_ADMIN_REQUIRED',
            errors: { role_ids: ['Keep an administrator.'] },
            requestId: 'role-change-request',
        })
        await assert.rejects(
            () => service.updateUserRoles(admin, 2, []),
            error => error === failure,
        )
    }
    failure = null
    response = { users: [{ id: 2 }] }
    await assert.rejects(() => service.getManagedUsers(admin), /current roles/)
    console.log(
        'User management checks passed: admin-only access, authoritative permissions, filters/status, required/last-admin protection, documented endpoints, replacement payloads and centralized errors.',
    )
}
run().catch(error => {
    console.error(error)
    process.exitCode = 1
})
