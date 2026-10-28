const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const compile = (file, dependencies = {}) => {
    const code = ts.transpileModule(
        fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
        {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                jsx: ts.JsxEmit.React,
            },
        },
    ).outputText
    const module = { exports: {} }
    new Function('module', 'exports', 'require', code)(
        module,
        module.exports,
        key => (key in dependencies ? dependencies[key] : require(key)),
    )
    return module.exports
}
const lib = compile('lib/reporting.ts')
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
const member = (grants = [], role = 'custom') => ({
    current_tenant_id: 37,
    roles: [{ slug: role }],
    permissions: grants,
})
const access = (grants, role) =>
    permissions.getReportingPermissions(member(grants, role))
for (const role of ['admin', 'billing', 'auditor', 'dentist', 'receptionist']) {
    const result = access([], role)
    assert.equal(result.billing, ['admin', 'billing', 'auditor'].includes(role))
    assert.equal(result.appointments, role === 'admin')
    assert.equal(result.treatments, role === 'admin')
    assert.equal(result.capacity, role === 'admin')
}
for (const grants of [
    [],
    ['reports.*'],
    ['invoices.view'],
    ['payments.view'],
    ['appointments.view'],
    ['treatments.view'],
])
    assert.equal(access(grants).billing, false)
assert.equal(access(['appointments.view']).treatments, false)
assert.equal(access(['treatments.view']).treatments, false)
for (const grants of [
    ['*'],
    ['*.view'],
    [
        'appointments.*',
        'treatments.*',
        'invoices.*',
        'payments.*',
        'provider_availabilities.*',
    ],
]) {
    const result = access(grants)
    for (const metric of [
        'appointments',
        'providers',
        'treatments',
        'billing',
        'capacity',
    ])
        assert.equal(result[metric], true)
}
assert.equal(access(['appointments.view']).capacity, false)
assert.equal(
    access(['appointments.view', 'provider_availabilities.view']).capacity,
    true,
)
assert.equal(
    permissions.canAccessModuleId(member(['reports.*']), 'reports'),
    false,
)
assert.equal(
    permissions.canAccessModuleId(member(['appointments.view']), 'reports'),
    true,
)
assert.equal(
    permissions.canAccessModuleId(member(['payments.view']), 'reports'),
    false,
)
assert.equal(
    permissions.getReportingPermissions({ id: 1, isSuperAdmin: true }).billing,
    false,
)
assert.equal(permissions.getReportingPermissions(null).appointments, false)
assert.equal(
    permissions.getReportingPermissions(member([], { name: 'admin' })).billing,
    false,
)
const filters = {
    date_from: '2026-10-01',
    date_to: '2026-10-31',
    dentist_id: '',
}
const valid = changes => lib.validateReportFilters({ ...filters, ...changes })
for (const value of [
    '2026-02-29',
    '2026-04-31',
    '2026-1-01',
    '2026-10-01T00:00:00Z',
    'today',
    '',
])
    assert.ok(valid({ date_from: value }).date_from, value)
assert.deepEqual(valid({ date_from: '2024-01-01', date_to: '2024-12-31' }), {})
assert.ok(valid({ date_from: '2024-01-01', date_to: '2025-01-01' }).date_to)
assert.deepEqual(valid({ date_from: '2026-10-31' }), {})
assert.ok(valid({ date_to: '2026-09-30' }).date_to)
for (const value of [' ', '0', '-1', '1.2', '1e2', '9007199254740992'])
    assert.ok(valid({ dentist_id: value }).dentist_id)
assert.deepEqual(valid({ dentist_id: '12' }), {})
assert.deepEqual(lib.defaultReportFilters(new Date('2026-11-01T00:30:00Z')), {
    date_from: '2026-11-01',
    date_to: '2026-11-01',
    dentist_id: '',
})
assert.equal(lib.reportAmount('199999999.98'), '199,999,999.98')
assert.equal(lib.reportAmount('0.30'), '0.30')
const requests = []
let reply
const service = compile('services/reporting.ts', {
    '../lib/reporting': lib,
    '../lib/api': {
        apiRequestWithSignal: async (request, signal) => {
            requests.push({ ...request, signal })
            return reply
        },
    },
})
const meta = { filters: { ...filters, dentist_id: null }, timezone: 'UTC' }
async function run() {
    // Shapes and expected values match ReportingService and ReportingApiTest.
    const by_status = Object.fromEntries(
        lib.reportStatuses.map(status => [status, 1]),
    )
    const appointments = {
        appointment_count: 6,
        by_status,
        by_date: [{ date: '2026-10-26', appointment_count: 6, by_status }],
    }
    reply = { data: appointments, meta }
    const controller = new AbortController()
    const options = { tenantId: 37, signal: controller.signal }
    const result = await service.getReport('appointments', filters, options)
    assert.deepEqual(result.data, appointments)
    assert.equal(
        result.data.appointment_count,
        Object.values(result.data.by_status).reduce(
            (sum, count) => sum + count,
            0,
        ),
    )
    assert.deepEqual(requests.at(-1).params, {
        date_from: filters.date_from,
        date_to: filters.date_to,
    })
    assert.deepEqual(requests.at(-1).headers, {
        'X-Tenant-Id': 37,
    })
    assert.equal(requests.at(-1).signal, controller.signal)
    const rows = [
        {
            dentist_id: 12,
            appointment_count: 0,
            by_status: Object.fromEntries(
                lib.reportStatuses.map(status => [status, 0]),
            ),
            booked_minutes: 0,
            completed_minutes: 0,
            available_minutes: null,
            occupied_minutes: null,
            utilization_percent: null,
        },
    ]
    reply = {
        data: rows,
        meta: {
            ...meta,
            filters: { ...meta.filters, dentist_id: 12 },
            pagination: { currentPage: 2, lastPage: 3, total: 51 },
        },
    }
    const providers = await service.getReport(
        'providers',
        { ...filters, dentist_id: '12' },
        { ...options, page: 2 },
    )
    assert.deepEqual(providers.data, rows)
    assert.equal(providers.pagination.currentPage, 2)
    assert.deepEqual(requests.at(-1).params, {
        date_from: filters.date_from,
        date_to: filters.date_to,
        dentist_id: 12,
        page: 2,
        per_page: 25,
    })
    reply = {
        data: [{ treatment_id: 8, appointment_count: 5, completed_count: 2 }],
        meta: {
            ...meta,
            pagination: { currentPage: 1, lastPage: 1, total: 1 },
        },
    }
    assert.equal(
        (await service.getReport('treatments', filters, options)).data[0]
            .completed_count,
        2,
    )
    const financial = {
        by_currency: [
            {
                currency: 'EUR',
                invoice_count: 0,
                invoiced_total: '0.00',
                paid_total: '0.00',
                outstanding_balance: '0.00',
                payment_count: 1,
                collections_total: '3.25',
            },
            {
                currency: 'USD',
                invoice_count: 1,
                invoiced_total: '10.00',
                paid_total: '2.00',
                outstanding_balance: '8.00',
                payment_count: 2,
                collections_total: '7.30',
            },
        ],
    }
    reply = { data: financial, meta }
    assert.deepEqual(
        (await service.getReport('billing', filters, options)).data,
        financial,
    )
    assert.equal(requests.at(-1).params.page, undefined)
    const minor = value => BigInt(value.replace('.', ''))
    for (const row of financial.by_currency)
        assert.equal(
            minor(row.invoiced_total) - minor(row.paid_total),
            minor(row.outstanding_balance),
        )
    reply = {
        data: financial,
        meta: { ...meta, filters: { ...meta.filters, dentist_id: 99 } },
    }
    await assert.rejects(
        service.getReport('billing', filters, options),
        /metadata/,
    )
    reply = {
        data: [],
        meta: { ...meta, pagination: { currentPage: 2, lastPage: 3 } },
    }
    await assert.rejects(
        service.getReport('providers', filters, options),
        /pagination/,
    )
    for (const change of [{ page: 0 }, { perPage: 101 }, { tenantId: 0 }])
        await assert.rejects(
            service.getReport('providers', filters, { ...options, ...change }),
        )
    await assert.rejects(
        service.getReport(
            'appointments',
            { ...filters, date_to: '2028-01-01' },
            options,
        ),
    )
    console.log(
        'Reporting permissions, UTC date bounds, source metric fixtures and request contract tests passed.',
    )
}
run().catch(error => {
    console.error(error)
    process.exitCode = 1
})
