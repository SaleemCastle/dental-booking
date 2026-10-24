const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'auth-session.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
}).outputText

const moduleRef = { exports: {} }
new Function('exports', 'module', compiled)(moduleRef.exports, moduleRef)

const {
    canRunProtectedApi,
    getAuthUserDisplayName,
    getAuthRoleLabel,
    getCurrentClinic,
    getAuthUserEmail,
    getAuthRouteRedirect,
    resolveSessionStatus,
    unwrapAuthUser,
} = moduleRef.exports

assert.equal(resolveSessionStatus(undefined), 'loading')
assert.equal(resolveSessionStatus(null), 'unauthenticated')
assert.equal(resolveSessionStatus({ id: 1, name: 'Jane' }), 'authenticated')
assert.equal(
    resolveSessionStatus(undefined, { statusCode: 401 }),
    'unauthenticated',
)

assert.equal(canRunProtectedApi('loading'), false)
assert.equal(canRunProtectedApi('unauthenticated'), false)
assert.equal(canRunProtectedApi('authenticated'), true)
assert.equal(canRunProtectedApi('error'), false)

for (const statusCode of [0, 403, 422, 500]) {
    assert.equal(
        resolveSessionStatus({ id: 7, permissions: ['*'] }, { statusCode }),
        'error',
    )
    assert.equal(
        getAuthRouteRedirect({
            middleware: 'auth',
            currentPath: '/',
            status: 'error',
            user: null,
            errorStatusCode: statusCode,
        }),
        null,
    )
}
assert.equal(
    resolveSessionStatus({ id: 7 }, { statusCode: 401 }),
    'unauthenticated',
)
assert.equal(
    resolveSessionStatus({ id: 7 }, { statusCode: 409 }),
    'unauthenticated',
)
const clinics = [
    { id: 2, name: 'Other clinic', slug: 'other', active: true },
    { id: 37, name: 'Pearl Clinic', slug: 'default-clinic', active: true },
]
assert.deepEqual(getCurrentClinic({ current_tenant_id: 37 }, clinics), {
    id: 37,
    name: 'Pearl Clinic',
    slug: 'default-clinic',
})
for (const current_tenant_id of [undefined, null, 1, 0, -1, '37', 1.5])
    assert.equal(getCurrentClinic({ current_tenant_id }, clinics), null)
assert.equal(
    getCurrentClinic({ current_tenant_id: 37 }, [
        { ...clinics[1], active: false },
    ]),
    null,
)
assert.equal(getCurrentClinic({ current_tenant_id: 37 }, null), null)
assert.equal(
    getAuthRoleLabel({
        roles: [{ slug: 'admin', name: 'Administrator' }],
        role: 'Platform Super Admin',
    }),
    'Clinic Admin',
)

assert.deepEqual(unwrapAuthUser({ user: { id: 1, name: 'Jane Doe' } }), {
    id: 1,
    name: 'Jane Doe',
})
assert.equal(getAuthUserDisplayName({ name: 'Jane Doe' }), 'Jane Doe')
assert.equal(
    getAuthUserDisplayName({ firstName: 'Jane', lastName: 'Doe' }),
    'Jane Doe',
)
assert.equal(
    getAuthUserDisplayName({ email: 'jane@example.com' }),
    'jane@example.com',
)
assert.equal(
    getAuthUserEmail({ email: 'jane@example.com' }),
    'jane@example.com',
)

assert.equal(
    getAuthRouteRedirect({
        middleware: 'auth',
        currentPath: '/',
        status: 'loading',
        user: null,
    }),
    null,
)

assert.equal(
    getAuthRouteRedirect({
        middleware: 'auth',
        currentPath: '/',
        status: 'unauthenticated',
        user: null,
        errorStatusCode: 401,
    }),
    '/login',
)

assert.equal(
    getAuthRouteRedirect({
        middleware: 'auth',
        currentPath: '/',
        status: 'unauthenticated',
        user: null,
        errorStatusCode: 409,
    }),
    '/verify-email',
)

assert.equal(
    getAuthRouteRedirect({
        middleware: 'guest',
        redirectIfAuthenticated: '/',
        currentPath: '/login',
        status: 'authenticated',
        user: { id: 1 },
    }),
    '/',
)

assert.equal(
    getAuthRouteRedirect({
        middleware: 'auth',
        redirectIfAuthenticated: '/',
        currentPath: '/verify-email',
        status: 'authenticated',
        user: { id: 1, email_verified_at: '2026-10-09T12:00:00Z' },
    }),
    '/',
)

const postLogoutStatus = resolveSessionStatus(null)

assert.equal(postLogoutStatus, 'unauthenticated')
assert.equal(canRunProtectedApi(postLogoutStatus), false)
assert.equal(
    getAuthRouteRedirect({
        middleware: 'auth',
        currentPath: '/dashboard',
        status: postLogoutStatus,
        user: null,
    }),
    '/login',
)

console.log('Auth session state tests passed.')
