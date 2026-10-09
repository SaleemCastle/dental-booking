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
    getAuthRouteRedirect,
    resolveSessionStatus,
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

console.log('Auth session state tests passed.')
