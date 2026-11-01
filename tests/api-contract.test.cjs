const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'api-contract.ts')
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
    normalizeApiErrorPayload,
    normalizeApiResponsePayload,
    normalizeFieldErrors,
} = moduleRef.exports

const success = normalizeApiResponsePayload(
    {
        success: true,
        statusCode: 200,
        message: 'Patients loaded',
        code: 'PATIENTS_INDEXED',
        data: [{ id: 1, firstName: 'Jane' }],
        errors: {},
        meta: { currentPage: 1, total: 1 },
        requestId: 'req_123',
    },
    { statusCode: 200, statusText: 'OK' },
)

assert.equal(success.success, true)
assert.equal(success.code, 'PATIENTS_INDEXED')
assert.equal(success.requestId, 'req_123')
assert.equal(success.meta.total, 1)
assert.equal(success.data[0].firstName, 'Jane')

const validation = normalizeApiErrorPayload(
    {
        success: false,
        statusCode: 422,
        message: 'Validation failed',
        code: 'PATIENT_EMAIL_INVALID',
        errors: { email: 'The email must be valid.' },
        requestId: 'req_456',
    },
    { statusCode: 422, statusText: 'Unprocessable Entity' },
)

assert.equal(validation.statusCode, 422)
assert.equal(validation.code, 'PATIENT_EMAIL_INVALID')
assert.deepEqual(validation.errors.email, ['The email must be valid.'])
assert.equal(validation.requestId, 'req_456')

const legacy = normalizeApiResponsePayload(
    { status: 'passwords.sent' },
    { statusCode: 200, statusText: 'OK' },
)

assert.equal(legacy.success, true)
assert.deepEqual(legacy.data, { status: 'passwords.sent' })

assert.deepEqual(normalizeFieldErrors(['Try again later']), {
    _error: ['Try again later'],
})

console.log('API contract normalization tests passed.')

async function testAxiosClient() {
    const axios = require('axios')
    const apiSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'lib', 'api.ts'),
        'utf8',
    )
    const apiCompiled = ts.transpileModule(apiSource, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            esModuleInterop: true,
        },
    }).outputText
    const apiModule = { exports: {} }
    new Function('exports', 'module', 'require', apiCompiled)(
        apiModule.exports,
        apiModule,
        id => (id === './api-contract' ? moduleRef.exports : require(id)),
    )
    const { http, apiClient, apiRequestWithSignal, ensureCsrfCookie, ApiError } =
        apiModule.exports
    assert.equal(http.defaults.withCredentials, true)
    assert.equal(http.defaults.withXSRFToken, true)
    assert.equal(http.defaults.xsrfCookieName, 'XSRF-TOKEN')
    assert.equal(http.defaults.xsrfHeaderName, 'X-XSRF-TOKEN')
    http.defaults.adapter = async config => {
        assert.equal(config.url, '/sanctum/csrf-cookie')
        assert.equal(config.headers.get('Accept'), 'application/json')
        return { config, data: '', status: 204, statusText: '', headers: {} }
    }
    assert.equal((await ensureCsrfCookie()).statusCode, 204)

    for (const mode of ['helper', 'config', 'raw']) {
        const controller = new AbortController()
        let started
        const ready = new Promise(resolve => (started = resolve))
        const config = {
            url: '/api/patients',
            signal: controller.signal,
            adapter: config =>
                new Promise((resolve, reject) => {
                    assert.equal(config.signal, controller.signal)
                    assert.equal(config.cancelToken, undefined)
                    config.signal.addEventListener('abort', () =>
                        reject(new axios.CanceledError('cancelled', config)),
                    )
                    started()
                }),
        }
        const pending =
            mode === 'helper'
                ? apiRequestWithSignal(config, controller.signal)
                : mode === 'config'
                ? apiClient.request(config)
                : http.request(config)
        const rejected = assert.rejects(pending, error => {
            assert.equal(error.name, 'AbortError')
            assert.equal(error instanceof ApiError, false)
            return true
        })
        await ready
        controller.abort()
        await rejected
    }

    const controller = new AbortController()
    controller.abort()
    let dispatched = false
    const config = {
        url: '/api/patients',
        signal: controller.signal,
        adapter: () => {
            dispatched = true
            throw new Error('Pre-aborted requests must not reach the adapter')
        },
    }
    await assert.rejects(apiRequestWithSignal(config), { name: 'AbortError' })
    await assert.rejects(apiClient.request(config), { name: 'AbortError' })
    assert.equal(dispatched, false)

    const response = await apiClient.get('/api/patients', {
        adapter: async config => ({
            config,
            data: { success: true, data: [{ id: 1 }], meta: { total: 1 } },
            status: 200,
            statusText: 'OK',
            headers: new axios.AxiosHeaders({ 'X-Request-Id': 'axios-123' }),
        }),
    })
    assert.deepEqual(response.data, [{ id: 1 }])
    assert.equal(response.meta.total, 1)
    assert.equal(response.requestId, 'axios-123')
    for (const binary of [false, true]) {
        await assert.rejects(
            apiClient.get('/api/patients', {
                adapter: async config => {
                    const payload = { errors: { email: 'Invalid email' } }
                    throw new axios.AxiosError('Validation failed', 'ERR_BAD_REQUEST', config, {}, {
                        config,
                        data: binary ? new Blob([JSON.stringify(payload)]) : payload,
                        status: 422,
                        statusText: '',
                        headers: new axios.AxiosHeaders({ 'X-Request-Id': 'error-123' }),
                    })
                },
            }),
            error => {
                assert.ok(error instanceof ApiError)
                assert.equal(error.statusCode, 422)
                assert.equal(error.code, 'VALIDATION_ERROR')
                assert.deepEqual(error.errors, { email: ['Invalid email'] })
                assert.equal(error.requestId, 'error-123')
                return true
            },
        )
    }
    console.log('Modern Axios transport and cancellation tests passed.')
}

testAxiosClient().catch(error => {
    console.error(error)
    process.exitCode = 1
})
