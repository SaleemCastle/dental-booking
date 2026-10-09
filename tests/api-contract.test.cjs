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
