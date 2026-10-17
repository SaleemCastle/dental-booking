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
const workflow = compile('lib/tasks.ts')
const dates = compile('lib/clinical-notes.ts')
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
const fixture = {
    id: 11,
    patient_id: 4,
    appointment_id: 8,
    assignee_id: 90,
    due_date: '2026-10-17',
    priority: 'urgent',
    status: 'pending',
    description: 'Call after treatment.',
    assigneeName: 'Staff user',
    appointmentStartsAt: null,
    created_at: '2026-10-16T14:00:00Z',
    completed_at: null,
}
async function main() {
    const values = {
        appointment_id: '8',
        assignee_id: '90',
        due_date: '2026-10-17',
        priority: 'high',
        description: ' Call patient. ',
    }
    assert.deepEqual(workflow.validateTask(values), {})
    for (const date of [
        '2026-02-30',
        '2025-02-29',
        '2026-13-01',
        '',
        '2026-10-17T12:00:00Z',
    ])
        assert.ok(
            workflow.validateTask({ ...values, due_date: date }).due_date,
            date,
        )
    for (const date of ['2024-02-29', '2020-01-01'])
        assert.equal(
            workflow.validateTask({ ...values, due_date: date }).due_date,
            undefined,
        )
    assert.ok(
        workflow.validateTask({ ...values, description: '  ' }).description,
    )
    assert.ok(
        workflow.validateTask({ ...values, description: 'x'.repeat(16001) })
            .description,
    )
    assert.equal(
        workflow.validateTask({ ...values, description: '😀'.repeat(16000) })
            .description,
        undefined,
    )
    assert.ok(
        workflow.validateTask({ ...values, priority: 'toString' }).priority,
    )
    assert.ok(
        workflow.validateTask({ ...values, assignee_id: '1.5' }).assignee_id,
    )
    assert.ok(
        workflow.validateTask({ ...values, appointment_id: '-1' })
            .appointment_id,
    )
    assert.deepEqual(workflow.taskPayload(4, values), {
        patient_id: 4,
        appointment_id: 8,
        assignee_id: 90,
        due_date: '2026-10-17',
        priority: 'high',
        description: 'Call patient.',
    })
    assert.equal(
        workflow.taskPayload(4, { ...values, appointment_id: '' })
            .appointment_id,
        null,
    )

    const requests = []
    const service = compile('services/tasks.ts', {
        '../lib/api': {
            apiClient: {
                postData: async (...args) => {
                    requests.push(args)
                    return { task: fixture }
                },
                getData: async (...args) => {
                    requests.push(args)
                    return {
                        users: [
                            {
                                id: 90,
                                name: 'Staff user',
                                email: 'private@example.test',
                            },
                        ],
                    }
                },
            },
        },
    })
    const payload = workflow.taskPayload(4, values)
    assert.deepEqual(await service.createTask(payload), fixture)
    assert.deepEqual(requests.pop(), ['/api/tasks', payload])
    assert.deepEqual(await service.getTaskAssignees(), [
        { id: 90, name: 'Staff user' },
    ])
    assert.deepEqual(requests.pop(), ['/api/users'])

    let session = {
        status: 'authenticated',
        user: {
            id: 90,
            permissions: ['patients.view', 'tasks.*', 'dashboard.view'],
        },
    }
    let captured,
        writeFailure,
        readFailure,
        writes = 0
    let stored = { ...fixture }
    const invalidations = [],
        reads = []
    const state = []
    let cursor = 0
    const feed = {
        data: [{ tasks: [stored], meta: { lastPage: 2 } }],
        error: undefined,
        size: 1,
        mutate: async (update, revalidate = true) => {
            if (typeof update === 'function') feed.data = update(feed.data)
            if (revalidate) {
                try {
                    feed.data = [
                        await captured.fetcher(
                            'patient-tasks',
                            session.user,
                            4,
                            1,
                        ),
                    ]
                    feed.error = undefined
                } catch (error) {
                    feed.error = error
                } // SWR 1 resolves on revalidation failure.
            }
            return feed.data
        },
        setSize: async () => {},
    }
    const hook = compile('hooks/patient-tasks.ts', {
        react: {
            useState: initial => {
                const index = cursor++
                if (!(index in state)) state[index] = initial
                return [
                    state[index],
                    next => {
                        state[index] = next
                    },
                ]
            },
            useRef: initial => {
                const index = cursor++
                if (!(index in state)) state[index] = { current: initial }
                return state[index]
            },
        },
        'swr/infinite': {
            __esModule: true,
            default: (key, fetcher, options) => {
                captured = { key, fetcher, options }
                return feed
            },
        },
        swr: {
            useSWRConfig: () => ({
                mutate: async key => invalidations.push(key),
            }),
        },
        '../context/AuthSessionContext': { useAuthSession: () => session },
        '../lib/api': { normalizeAxiosError: error => error },
        '../lib/permissions': permissions,
        '../lib/tasks': workflow,
        '../services/dashboard': {
            dashboardSummaryKey: user => ['dashboard-summary', user],
        },
        '../services/tasks': {
            getTasks: async filters => {
                reads.push(filters)
                if (readFailure) throw readFailure
                return { tasks: [stored], meta: { lastPage: 1 } }
            },
            createTask: async payload => {
                writes++
                await Promise.resolve()
                if (writeFailure) throw writeFailure
                stored = { ...fixture, ...payload, id: 12 }
                return stored
            },
            completeTask: async () => {
                writes++
                await Promise.resolve()
                if (writeFailure) throw writeFailure
                stored = {
                    ...stored,
                    status: 'completed',
                    completed_at: '2026-10-17T14:00:00Z',
                }
                return stored
            },
        },
    })
    const renderHook = (id = 4) => {
        cursor = 0
        return hook.usePatientTasks(id)
    }
    let result = renderHook()
    assert.deepEqual(captured.key(0, null), [
        'patient-tasks',
        session.user,
        4,
        1,
    ])
    assert.deepEqual(captured.key(1, feed.data[0]), [
        'patient-tasks',
        session.user,
        4,
        2,
    ])
    assert.equal(captured.key(2, feed.data[0]), null)
    assert.equal(result.hasMore, true)
    await Promise.all([result.complete(fixture), result.complete(fixture)])
    assert.equal(writes, 1)
    result = renderHook()
    assert.equal(result.tasks[0].status, 'completed')
    assert.deepEqual(reads[0], { patient_id: 4, page: 1 })
    assert.deepEqual(invalidations[0], ['dashboard-summary', session.user])
    readFailure = { statusCode: 500, message: 'Offline', errors: {} }
    await result.create(payload)
    result = renderHook()
    assert.match(result.notice, /created. Refresh failed/)
    assert.ok(result.tasks.some(task => task.id === 12))
    assert.equal(result.canUpdate, false)
    readFailure = null
    await result.retry()
    result = renderHook()
    writeFailure = {
        statusCode: 422,
        message: 'Invalid assignee',
        errors: { assignee_id: ['User no longer exists.'] },
    }
    await assert.rejects(
        result.create(payload),
        error => error === writeFailure,
    )
    writeFailure = { statusCode: 403, message: 'Denied', errors: {} }
    await result.complete(stored)
    result = renderHook()
    assert.equal(result.canUpdate, false)
    assert.equal(result.canCreate, true)
    assert.match(result.actionError.message, /Denied/)
    await assert.rejects(
        result.create(payload),
        error => error === writeFailure,
    )
    assert.equal(renderHook().canCreate, false)
    feed.error = { statusCode: 403 }
    assert.deepEqual(renderHook().tasks, [])
    assert.deepEqual(renderHook(5).tasks, [])
    session = { status: 'loading', user: session.user }
    result = renderHook()
    assert.equal(result.canView, false)
    assert.equal(captured.key(0, null), null)
    session = {
        status: 'authenticated',
        user: { permissions: ['patients.view', 'tasks.view'] },
    }
    feed.error = undefined
    result = renderHook()
    assert.equal(result.canView, true)
    assert.equal(result.canCreate, false)
    assert.equal(result.canUpdate, false)

    let panel = {
        ...result,
        tasks: [
            {
                ...fixture,
                status: 'completed',
                completed_at: '2026-10-17T14:00:00Z',
            },
        ],
    }
    const Panel = compile('components/PatientFollowUps.tsx', {
        '../hooks/patient-tasks': { usePatientTasks: () => panel },
        '../lib/appointment-workflow': { utcToday: () => '2026-10-18' },
        '../lib/clinical-notes': dates,
        '../lib/tasks': workflow,
        './FollowUpForm': { __esModule: true, default: () => null },
        './AppointmentDialog': {},
    }).default
    const html = () =>
        renderToStaticMarkup(React.createElement(Panel, { patient: { id: 4 } }))
    assert.match(html(), /Patient follow-up timeline/)
    assert.match(html(), /Completed Oct 17/)
    assert.doesNotMatch(html(), /Overdue|Complete follow-up 11/)
    panel = { ...panel, canView: false }
    assert.match(html(), /permission to view follow-ups/)
    assert.doesNotMatch(html(), /Call after treatment/)
    console.log(
        'Follow-ups: payload/validation, user directory, patient scope, pagination, duplicate locks, completion history, persisted writes after failed refresh and permissions passed.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
