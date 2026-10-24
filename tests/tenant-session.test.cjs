const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const compile = (file, imports = {}) => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', file),
        'utf8',
    )
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText
    const module = { exports: {} }
    new Function('exports', 'module', 'require', compiled)(
        module.exports,
        module,
        id => imports[id] ?? require(id),
    )
    return module.exports
}
const auth = compile('lib/auth-session.ts')
class ApiError extends Error {
    constructor(shape) {
        super(shape.message)
        Object.assign(this, shape)
    }
}
const calls = []
let user, tenants, failure
const { getClinicSession } = compile('services/session.ts', {
    '../lib/auth-session': auth,
    '../lib/api': {
        ApiError,
        apiClient: {
            getData: async (...args) => {
                calls.push(args)
                if (failure) throw failure
                return args[0] === '/api/user' ? user : { tenants }
            },
        },
    },
})
;(async () => {
    const clinic = {
        id: 37,
        name: 'Default Clinic',
        slug: 'default-clinic',
        active: true,
    }
    const foreign = { id: 2, name: 'Other Clinic', slug: 'other', active: true }
    user = {
        id: 91,
        current_tenant_id: 37,
        roles: [{ slug: 'admin' }],
        permissions: ['*'],
    }
    tenants = [foreign, clinic]
    const session = await getClinicSession()
    assert.deepEqual(session.currentTenant, {
        id: 37,
        name: 'Default Clinic',
        slug: 'default-clinic',
    })
    assert.deepEqual(
        calls,
        [['/api/user'], ['/api/tenants']],
        'No client-selected tenant header or query',
    )
    user = { ...user, roles: [], permissions: [] }
    assert.deepEqual(
        (await getClinicSession()).user.permissions,
        [],
        'Membership grants no default permissions',
    )
    for (const memberships of [
        [foreign],
        [],
        [{ ...clinic, active: false }],
        null,
    ]) {
        tenants = memberships
        await assert.rejects(getClinicSession(), {
            code: 'INVALID_CLINIC_SESSION',
        })
    }
    tenants = [clinic]
    const valid = user
    for (const malformed of [
        { ...valid, current_tenant_id: undefined },
        { ...valid, roles: undefined },
        { ...valid, permissions: undefined },
        { ...valid, id: undefined },
        null,
    ]) {
        user = malformed
        await assert.rejects(getClinicSession(), {
            code: 'INVALID_CLINIC_SESSION',
        })
    }
    user = valid
    for (const statusCode of [401, 403, 422, 500, 0]) {
        calls.length = 0
        failure = new ApiError({ statusCode, message: 'Unavailable' })
        await assert.rejects(getClinicSession(), error => error === failure)
        assert.deepEqual(
            calls,
            [['/api/user']],
            'No discovery or fallback after denied session',
        )
    }
    failure = null
    const { http, unauthorizedSessionEvent, forbiddenSessionEvent } = compile(
        'lib/api.ts',
        {
            './api-contract': compile('lib/api-contract.ts'),
        },
    )
    global.window = new EventTarget()
    window.localStorage = window.sessionStorage = { removeItem() {} }
    let unauthorized = 0,
        forbidden = 0
    window.addEventListener(unauthorizedSessionEvent, () => unauthorized++)
    window.addEventListener(forbiddenSessionEvent, () => forbidden++)
    const rejectRequest = async (url, status) => {
        await assert.rejects(
            http.get(url, {
                adapter: async config => {
                    throw {
                        config,
                        response: {
                            status,
                            data: { message: 'Denied' },
                            headers: {},
                        },
                    }
                },
            }),
            error => error.statusCode === status,
        )
    }
    await rejectRequest('/api/patients', 403)
    assert.equal(forbidden, 1)
    await rejectRequest('/api/user', 403)
    await rejectRequest('/api/tenants', 403)
    await rejectRequest('/api/patients', 422)
    assert.equal(
        forbidden,
        1,
        'Session denial cannot recursively refresh itself',
    )
    await rejectRequest('/api/patients', 401)
    assert.equal(unauthorized, 1)
    delete global.window
    console.log('Clinic session contract and central API error tests passed.')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
