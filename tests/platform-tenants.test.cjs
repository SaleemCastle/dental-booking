const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const compile = (file, mocks = {}) => {
    const output = ts.transpileModule(fs.readFileSync(`src/${file}`, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText
    const module = { exports: {} }
    new Function('module', 'exports', 'require', output)(
        module,
        module.exports,
        id => (id in mocks ? mocks[id] : require(id)),
    )
    return module.exports
}
class ApiError extends Error {
    constructor(shape) {
        super(shape.message)
        Object.assign(this, shape)
    }
}
const requests = []
let response, failure
const service = compile('services/platform-tenants.ts', {
    '../lib/api': {
        ApiError,
        apiRequestWithSignal: async (config, signal) => {
            requests.push({ config, signal })
            if (failure) throw failure
            return response
        },
    },
})
const tenant = {
    id: 51,
    name: 'Independent Clinic',
    slug: 'independent',
    active: true,
    status: 'active',
    timezone: 'America/Bogota',
    currency: 'COP',
    contact_email: 'clinic@example.com',
}
;(async () => {
    const signal = new AbortController().signal
    response = {
        data: { tenants: [tenant] },
        meta: { pagination: { currentPage: 2, lastPage: 3 } },
    }
    assert.deepEqual(await service.listPlatformTenants(2, signal), {
        tenants: [tenant],
        meta: { currentPage: 2, lastPage: 3 },
    })
    assert.deepEqual(requests.pop(), {
        config: {
            method: 'get',
            url: '/api/platform/tenants',
            params: { page: 2 },
        },
        signal,
    })
    response = { data: { tenant } }
    assert.deepEqual(await service.getPlatformTenant(51), tenant)
    await assert.rejects(service.getPlatformTenant(52), {
        code: 'INVALID_PLATFORM_RESPONSE',
    })
    const payload = {
        idempotency_key: 'stable-key',
        admin: { password: 'unique-secret-123' },
    }
    for (const statusCode of [201, 200]) {
        response = { statusCode, data: { tenant, initial_admin_id: 13 } }
        const result = await service.provisionPlatformTenant(payload)
        assert.equal(result.replayed, statusCode === 200)
        assert.equal(
            requests.at(-1).config.data,
            payload,
            'Retry sends the original object unchanged',
        )
        assert.equal('admin' in result, false)
    }
    const suspended = { ...tenant, active: false, status: 'suspended' }
    response = { data: { tenant: suspended } }
    assert.deepEqual(
        await service.setPlatformTenantStatus(51, 'suspended'),
        suspended,
    )
    assert.deepEqual(requests.at(-1).config.data, { status: 'suspended' })
    assert.equal(requests.at(-1).config.url, '/api/platform/tenants/51/status')
    for (const statusCode of [401, 403, 409, 422, 500, 0]) {
        failure = new ApiError({
            statusCode,
            errors: { 'admin.email': ['Already used'] },
            message: 'Denied',
        })
        await assert.rejects(
            service.provisionPlatformTenant(payload),
            error => error === failure,
        )
    }
    failure = null
    response = { data: { tenants: [{ ...tenant, active: false }] } }
    await assert.rejects(service.listPlatformTenants(), {
        code: 'INVALID_PLATFORM_RESPONSE',
    })
    assert.ok(
        requests.every(
            ({ config }) => !config.headers && !config.params?.tenant_id,
        ),
        'No clinic selection on platform requests',
    )
    const identityCalls = []
    const { getPlatformIdentitySession } = compile('services/session.ts', {
        '../lib/auth-session': compile('lib/auth-session.ts'),
        '../lib/api': {
            ApiError,
            apiClient: {
                getData: async path => {
                    identityCalls.push(path)
                    return { id: 42, name: 'Operator' }
                },
            },
        },
    })
    assert.deepEqual(await getPlatformIdentitySession(), {
        user: { id: 42, name: 'Operator' },
        currentTenant: null,
    })
    assert.deepEqual(
        identityCalls,
        ['/api/user'],
        'Operator identity requires no clinic membership and grants no clinic context',
    )
    const clinicRequests = []
    let memberships = [{ ...tenant, id: 2, name: 'Other clinic' }, tenant]
    const { getCurrentClinicProfile } = compile('services/clinic-profile.ts', {
        '../lib/permissions': {
            canManageUsers: user =>
                user?.roles?.some(role => role.slug === 'admin'),
        },
        '../lib/api': {
            ApiError,
            apiRequestWithSignal: async config => {
                clinicRequests.push(config)
                return { data: { tenants: memberships } }
            },
        },
    })
    const admin = { id: 12, current_tenant_id: 51, roles: [{ slug: 'admin' }] }
    const clinic = { id: 51, name: tenant.name, slug: tenant.slug }
    assert.deepEqual(await getCurrentClinicProfile(admin, clinic), tenant)
    assert.deepEqual(clinicRequests, [{ method: 'get', url: '/api/tenants' }])
    for (const user of [
        null,
        { permissions: ['*'] },
        { ...admin, current_tenant_id: 2 },
    ])
        await assert.rejects(getCurrentClinicProfile(user, clinic), {
            statusCode: 403,
        })
    assert.equal(
        clinicRequests.length,
        1,
        'Denied access makes no profile request',
    )
    for (const values of [
        [memberships[0]],
        [{ ...tenant, active: false }],
        null,
    ]) {
        memberships = values
        await assert.rejects(getCurrentClinicProfile(admin, clinic), {
            code: 'INVALID_CLINIC_PROFILE',
        })
    }
    console.log(
        'Platform tenant service, error, retry and account isolation checks passed.',
    )
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
