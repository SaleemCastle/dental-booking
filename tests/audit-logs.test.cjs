const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
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
const workflow = compile('lib/audit-logs.ts')
class ApiError extends Error {
    constructor(shape) {
        super(shape.message)
        Object.assign(this, shape)
    }
}
const fixture = {
    id: 12,
    actor_id: 90,
    actorName: 'Clinic admin',
    action: 'status_changed',
    resource_type: 'appointments',
    resource_id: '00042',
    occurred_at: '2026-10-18T00:30:12.123456Z',
    ip_address: '203.0.113.8',
    user_agent: '<img src=x onerror=alert(1)>',
    request_metadata: {
        method: 'PATCH',
        route: 'api/appointments/{appointment}',
        request_id: 'mutation-123',
    },
}
async function main() {
    const admin = { id: 90, roles: [{ name: 'Administrator', slug: 'admin' }] }
    const auditor = { id: 91, roles: [{ name: 'Reviewer', slug: 'auditor' }] }
    const deniedUsers = [
        null,
        { id: 90 },
        { roles: ['admin'] },
        { roles: ['auditor'] },
        { roles: [{ name: 'admin' }] },
        { roles: [{ name: 'auditor', slug: 'staff' }] },
        { role: { slug: 'admin' } },
        { role_name: 'admin' },
        { permissions: ['*', 'audit_logs.view', '*.view'] },
        { isSuperAdmin: true },
        { roles: [{ slug: 'Admin' }] },
    ]
    for (const user of deniedUsers) {
        assert.equal(
            permissions.canViewAuditLogs(user),
            false,
            JSON.stringify(user),
        )
        assert.equal(permissions.canAccessModuleId(user, 'audit_logs'), false)
        assert.ok(
            !permissions
                .getAuthorizedNavigationModules(user)
                .some(module => module.id === 'audit_logs'),
        )
    }
    for (const user of [admin, auditor])
        assert.equal(permissions.canAccessModuleId(user, 'audit_logs'), true)
    const filters = {
        ...workflow.emptyAuditFilters(),
        actor_id: '90',
        actor_is_null: '0',
        action: 'status_changed',
        resource_type: 'appointments',
        resource_id: '00042',
        request_id: 'mutation-123',
        from: '2026-10-18T00:00:00+05:30',
        to: '2026-10-18T23:59:59.999999+05:30',
    }
    assert.deepEqual(workflow.validateAuditFilters(filters), {})
    assert.deepEqual(
        workflow.cleanAuditFilters({ ...filters, actor_id: ' 90 ' }),
        filters,
    )
    for (const value of ['0', '-1', '1.5', '9007199254740992'])
        assert.ok(
            workflow.validateAuditFilters({ ...filters, actor_id: value })
                .actor_id,
        )
    for (const value of [
        '2026-02-30T00:00:00Z',
        '2025-02-29T00:00:00Z',
        '2026-10-18',
        '2026-10-18T12:00',
        '2026-10-18T12:00:00',
        '2026-10-18T12:00:00.1234567Z',
        '2026-10-18T24:00:00Z',
    ])
        assert.ok(
            workflow.validateAuditFilters({ ...filters, from: value }).from,
            value,
        )
    assert.deepEqual(
        workflow.validateAuditFilters({
            ...filters,
            from: '2024-02-29T00:00:00Z',
        }),
        {},
    )
    assert.ok(
        workflow.validateAuditFilters({
            ...filters,
            from: '2026-10-19T00:00:00Z',
        }).to,
    )
    assert.ok(
        workflow.validateAuditFilters({
            ...filters,
            from: '2026-10-18T00:00:00.123456Z',
            to: '2026-10-18T00:00:00.123455Z',
        }).to,
        'Preserve microsecond ordering',
    )
    assert.deepEqual(
        workflow.validateAuditFilters({
            ...filters,
            from: '2026-10-18T01:00:00+01:00',
            to: '2026-10-18T00:00:00Z',
        }),
        {},
        'Compare normalized offsets',
    )
    assert.ok(
        workflow.validateAuditFilters({ ...filters, actor_is_null: '1' })
            .actor_id,
    )
    assert.ok(
        workflow.validateAuditFilters({ ...filters, actor_is_null: 'true' })
            .actor_is_null,
    )
    assert.ok(
        workflow.validateAuditFilters({ ...filters, action: 'Changed name' })
            .action,
    )
    assert.ok(
        workflow.validateAuditFilters({
            ...filters,
            request_id: 'bad request?',
        }).request_id,
    )
    assert.equal(workflow.auditActionLabel('future.action'), 'Future action')
    assert.equal(
        workflow.auditActorLabel({ ...fixture, actor_id: null }),
        'System / unauthenticated',
    )
    assert.equal(
        workflow.auditActorLabel({ ...fixture, actorName: null }),
        'Deleted user #90',
    )
    assert.equal(
        workflow.formatAuditTimestamp(fixture.occurred_at),
        'Oct 18, 2026, 00:30:12 UTC',
    )
    assert.match(
        workflow.formatAuditTimestamp(fixture.occurred_at, 'America/Bogota'),
        /Oct 17, 2026, 19:30:12/,
    )

    const requests = []
    let response = {
        data: { auditLogs: [fixture] },
        meta: { pagination: { currentPage: 2, lastPage: 3, total: 60 } },
        requestId: 'read-789',
    }
    let waitForRequest
    const service = compile('services/audit-logs.ts', {
        '../lib/api': {
            ApiError,
            apiClient: {
                get: async (...args) => {
                    requests.push(args)
                    if (waitForRequest) await waitForRequest
                    return response
                },
            },
        },
        '../lib/permissions': permissions,
    })
    for (const user of deniedUsers) {
        for (const read of [
            () => service.getAuditLogs(user, filters),
            () => service.getAuditFilterOptions(user),
            () => service.getAuditLog(user, 12),
        ])
            await assert.rejects(
                read(),
                error => error.statusCode === (user ? 403 : 401),
            )
    }
    assert.equal(requests.length, 0)
    assert.deepEqual(await service.getAuditLogs(admin, filters, 2), {
        auditLogs: [fixture],
        meta: response.meta.pagination,
        requestId: 'read-789',
    })
    const [url, config] = requests.pop()
    assert.ok(config.cancelToken)
    assert.ok(url.includes('%2B05%3A30'), 'Offset plus sign is encoded')
    assert.deepEqual(
        Object.fromEntries(new URL(url, 'http://test').searchParams),
        { ...filters, page: '2', per_page: '25' },
    )
    response = {
        data: { auditLogs: [] },
        meta: { pagination: { lastPage: 1, total: 0 } },
    }
    await service.getAuditLogs(auditor, workflow.emptyAuditFilters())
    assert.equal(requests.pop()[0], '/api/audit-logs?page=1&per_page=25')
    response = { data: { actions: ['created'], resourceTypes: ['patients'] } }
    assert.deepEqual(
        await service.getAuditFilterOptions(auditor),
        response.data,
    )
    assert.equal(requests.pop()[0], '/api/audit-logs/filters')
    response = { data: { auditLog: fixture }, requestId: 'detail-read-123' }
    assert.deepEqual(await service.getAuditLog(admin, 12), {
        auditLog: fixture,
        requestId: 'detail-read-123',
    })
    assert.equal(requests.pop()[0], '/api/audit-logs/12')
    const cancelled = new AbortController()
    cancelled.abort()
    await assert.rejects(
        service.getAuditLogs(admin, filters, 1, cancelled.signal),
        error => error.name === 'AbortError',
    )
    assert.equal(requests.length, 0, 'Pre-aborted reads never hit HTTP')
    let release
    waitForRequest = new Promise(resolve => {
        release = resolve
    })
    const controller = new AbortController()
    const pending = service.getAuditLog(admin, 12, controller.signal)
    const token = requests.at(-1)[1].cancelToken
    controller.abort()
    release()
    await assert.rejects(pending, error => error.name === 'AbortError')
    assert.ok(token.reason, 'AbortSignal cancels Axios 0.21 requests')
    waitForRequest = null
    response = { data: {} }
    await assert.rejects(
        service.getAuditLogs(admin, filters),
        /unexpected response/,
    )
    await assert.rejects(
        service.getAuditFilterOptions(admin),
        /unexpected filter options/,
    )
    await assert.rejects(service.getAuditLog(admin, 12), /unexpected record/)
    assert.deepEqual(Object.keys(service).sort(), [
        'getAuditFilterOptions',
        'getAuditLog',
        'getAuditLogs',
    ])

    let panel = {
        canView: true,
        session: admin,
        filters: workflow.emptyAuditFilters(),
        page: 1,
        selectedId: null,
        records: [
            fixture,
            {
                ...fixture,
                id: 13,
                actor_id: null,
                actorName: null,
                request_metadata: null,
            },
            {
                ...fixture,
                id: 14,
                actorName: null,
                action: 'future.action',
                resource_type: 'future_resources',
            },
        ],
        meta: { lastPage: 2, total: 30 },
    }
    const Viewer = compile('components/AuditLogViewer.tsx', {
        '../hooks/audit-logs': { useAuditLogs: () => panel },
        '../lib/audit-logs': workflow,
        './AppointmentDialog': {
            __esModule: true,
            default: ({ children }) =>
                React.createElement('div', { role: 'dialog' }, children),
        },
        './InputError': {
            __esModule: true,
            default: ({ messages }) =>
                messages?.length
                    ? React.createElement('p', null, messages.join(' '))
                    : null,
        },
    }).default
    const html = () => renderToStaticMarkup(React.createElement(Viewer))
    assert.match(html(), /Deleted user #90/)
    assert.match(html(), /System \/ unauthenticated/)
    assert.match(html(), /mutation-123/)
    assert.match(html(), /View audit record 12/)
    assert.match(html(), /future_resources/)
    assert.doesNotMatch(html(), /203.0.113.8|onerror=alert/)
    panel = {
        ...panel,
        selectedId: 12,
        detail: { auditLog: fixture, requestId: 'detail-read-123' },
    }
    assert.match(html(), /203.0.113.8/)
    assert.match(html(), /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.doesNotMatch(html(), /<img/)
    assert.match(html(), /detail-read-123/)
    assert.match(html(), /\.123456Z/)
    panel = { ...panel, canView: false }
    assert.match(html(), /Audit access denied/)
    assert.doesNotMatch(html(), /mutation-123/)
    panel = {
        ...panel,
        canView: true,
        selectedId: null,
        records: undefined,
        meta: undefined,
        isLoading: true,
    }
    assert.match(html(), /Loading audit logs/)
    panel = { ...panel, isLoading: false, records: [] }
    assert.match(html(), /No audit records yet/)
    panel = { ...panel, filters }
    assert.match(html(), /No audit records match/)
    panel = {
        ...panel,
        error: {
            statusCode: 500,
            message: 'Gateway failed.',
            requestId: 'failed-read-123',
        },
    }
    assert.match(html(), /failed-read-123/)
    panel.error = { statusCode: 429 }
    assert.match(html(), /Wait 30 seconds/)
    console.log(
        'Audit contract checks passed: strict admin/auditor slugs, all read endpoints, query encoding, microsecond/offset bounds, cancellation, safe context and read-only errors.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
