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
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
const workflow = compile('lib/tasks.ts')
const dates = compile('lib/clinical-notes.ts')
const fixture = {
    id: 11,
    patient_id: 4,
    appointment_id: 8,
    assignee_id: 90,
    due_date: '2026-10-17',
    priority: 'urgent',
    status: 'pending',
    description: 'Call after treatment.',
    patientName: 'Jane Doe',
    assigneeName: 'Staff user',
    appointmentStartsAt: '2026-10-16T14:00:00Z',
    is_overdue: false,
    completed_at: null,
}

async function main() {
    for (const [user, view, update] of [
        [null, false, false],
        [{ id: 90, assignee_id: 90 }, false, false],
        [{ roles: ['admin'] }, true, true],
        [{ role: { name: 'admin' } }, true, true],
        [{ roles: ['dentist'] }, false, false],
        [{ roles: ['receptionist'] }, false, false],
        [{ permissions: ['tasks.view'] }, true, false],
        [{ permissions: ['tasks.update'] }, false, true],
        [{ permissions: ['tasks.*'] }, true, true],
        [{ permissions: ['*.view'] }, true, false],
        [{ permissions: ['tasks.view', '*.update'] }, true, true],
        [{ abilities: ['*'] }, true, true],
        [
            { roles: [{ name: 'staff', permissions: [{ code: 'tasks.*' }] }] },
            true,
            true,
        ],
        [{ can: { 'tasks.view': true, 'tasks.update': false } }, true, false],
    ]) {
        const actual = permissions.getUserPermissionSet(user)
        assert.equal(actual.has('tasks.view'), view, JSON.stringify(user))
        assert.equal(actual.has('tasks.update'), update, JSON.stringify(user))
    }
    // Wildcards must not bypass the separate clinical-role write policy.
    assert.equal(
        permissions.getClinicalNotePermissions({ permissions: ['*'] }).canWrite,
        false,
    )
    for (const tz of ['America/Bogota', 'Pacific/Auckland', 'UTC']) {
        process.env.TZ = tz
        const before = new Date('2026-10-17T23:59:59Z')
            .toISOString()
            .slice(0, 10)
        const after = new Date('2026-10-18T00:00:00Z')
            .toISOString()
            .slice(0, 10)
        assert.equal(workflow.taskDueState(fixture, before), 'today')
        assert.equal(workflow.taskDueState(fixture, after), 'overdue')
        assert.equal(
            workflow.taskDueState(
                { ...fixture, due_date: '2026-10-18' },
                before,
            ),
            'upcoming',
        )
        for (const status of ['completed', 'cancelled'])
            assert.equal(
                workflow.taskDueState(
                    { ...fixture, status, is_overdue: true },
                    after,
                ),
                'closed',
            )
    }
    assert.equal(
        workflow.taskMatchesFilters(fixture, 'today', '', '2026-10-17'),
        true,
    )
    assert.equal(
        workflow.taskMatchesFilters(
            fixture,
            'today',
            'completed',
            '2026-10-17',
        ),
        false,
    )
    assert.equal(
        workflow.taskMatchesFilters(
            { ...fixture, status: 'completed' },
            'all',
            '',
            '2026-10-18',
        ),
        true,
    )

    const requests = []
    let response
    const request = async (method, ...args) => {
        requests.push([method, ...args])
        return response
    }
    const service = compile('services/tasks.ts', {
        '../lib/api': {
            apiClient: {
                get: (...args) => request('GET', ...args),
                patchData: (...args) => request('PATCH', ...args),
            },
        },
    })
    response = {
        data: { tasks: [fixture] },
        meta: {
            pagination: {
                currentPage: 2,
                perPage: 15,
                total: 16,
                lastPage: 2,
                hasMorePages: false,
            },
        },
    }
    const result = await service.getTasks({
        assigned_to_me: true,
        overdue: false,
        due_today: true,
        patient_id: 4,
        status: 'pending',
        page: 2,
    })
    assert.deepEqual(result.tasks, [fixture])
    assert.equal(result.meta.currentPage, 2)
    assert.deepEqual(requests.pop(), [
        'GET',
        '/api/tasks',
        {
            params: {
                assigned_to_me: 1,
                overdue: 0,
                due_today: 1,
                patient_id: 4,
                status: 'pending',
                page: 2,
                per_page: 15,
            },
        },
    ])
    response = {
        task: {
            ...fixture,
            status: 'completed',
            completed_at: '2026-10-17T14:00:00Z',
        },
    }
    assert.equal((await service.completeTask(11)).status, 'completed')
    assert.deepEqual(requests.pop(), [
        'PATCH',
        '/api/tasks/11/status',
        { status: 'completed' },
    ])

    let state = {
        canView: true,
        canUpdate: true,
        canViewPatients: true,
        canViewAppointments: true,
        tasks: [fixture],
        today: '2026-10-17',
        due: 'all',
        taskStatus: '',
        page: 1,
        pendingId: null,
        meta: { lastPage: 1, total: 1 },
    }
    const Panel = compile('components/AssignedTasks.tsx', {
        '../lib/tasks': workflow,
        '../lib/clinical-notes': dates,
        './AppointmentDialog': {},
    }).default
    const render = () =>
        renderToStaticMarkup(
            React.createElement(Panel, {
                worklist: state,
                onOpenPatient: () => {},
                onOpenAppointment: () => {},
            }),
        )
    assert.match(render(), /Due today/)
    assert.match(render(), /Complete task 11/)
    assert.match(render(), /Open patient 4 for task 11/)
    state = { ...state, today: '2026-10-18' }
    assert.match(render(), /bg-clinic-rose/)
    state = {
        ...state,
        canUpdate: false,
        canViewPatients: false,
        canViewAppointments: false,
    }
    assert.match(render(), /Read-only/)
    assert.doesNotMatch(render(), /Complete task|Open patient|Open appointment/)
    state = {
        ...state,
        tasks: [
            {
                ...fixture,
                status: 'completed',
                completed_at: '2026-10-17T14:00:00Z',
            },
        ],
        canUpdate: true,
    }
    assert.doesNotMatch(render(), /Complete task/)
    assert.match(render(), /Completed Oct/)
    state = { ...state, tasks: [], isLoading: true }
    assert.match(render(), /Loading assigned tasks/)
    state = { ...state, isLoading: false }
    assert.match(render(), /No tasks assigned to you/)
    state = { ...state, due: 'today' }
    assert.match(render(), /No assigned tasks match/)
    state = { ...state, error: { statusCode: 500, message: 'Unavailable' } }
    assert.match(render(), /Retry tasks/)
    state = { ...state, canView: false, tasks: [fixture] }
    assert.doesNotMatch(render(), /Call after treatment/)
    let session = {
        status: 'authenticated',
        user: {
            id: 90,
            permissions: ['dashboard.view', 'tasks.view', 'tasks.update'],
        },
    }
    let captured,
        writes = 0
    const invalidations = [],
        reads = []
    const saved = {
        ...fixture,
        status: 'completed',
        completed_at: '2026-10-17T14:00:00Z',
    }
    const list = {
        data: { tasks: [fixture], meta: { lastPage: 1 } },
        error: undefined,
        isValidating: false,
        mutate: async (updater, revalidate = true) => {
            if (typeof updater === 'function') list.data = updater(list.data)
            if (revalidate) list.data = await captured.fetcher()
            return list.data
        },
    }
    const hook = compile('hooks/tasks.ts', {
        react: {
            useState: value => [value, () => {}],
            useRef: value => ({ current: value }),
            useEffect: () => {},
        },
        swr: {
            __esModule: true,
            default: (key, fetcher, options) => {
                captured = { key, fetcher, options }
                return list
            },
            useSWRConfig: () => ({
                mutate: async key => {
                    invalidations.push(key)
                },
            }),
        },
        '../context/AuthSessionContext': { useAuthSession: () => session },
        '../lib/api': { normalizeAxiosError: error => error },
        '../lib/permissions': permissions,
        '../lib/appointment-workflow': { utcToday: () => '2026-10-17' },
        '../lib/tasks': workflow,
        '../services/tasks': {
            completeTask: async () => {
                writes++
                await Promise.resolve()
                return saved
            },
            getTasks: async filters => {
                reads.push(filters)
                return { tasks: [saved], meta: { lastPage: 1 } }
            },
        },
        '../services/dashboard': {
            dashboardSummaryKey: user => ['dashboard-summary', user],
        },
    })
    let worklist = hook.useAssignedTasks()
    assert.deepEqual(captured.key, [
        'assigned-tasks',
        session.user,
        'all',
        '',
        1,
        '2026-10-17',
    ])
    assert.equal(captured.options.refreshInterval, 30000)
    assert.equal(captured.options.revalidateOnFocus, true)
    assert.equal(captured.options.revalidateOnReconnect, true)
    assert.equal(captured.options.refreshWhenHidden, false)
    assert.equal(captured.options.refreshWhenOffline, false)
    await Promise.all([worklist.complete(fixture), worklist.complete(fixture)])
    assert.equal(writes, 1, 'Synchronous duplicate lock')
    assert.equal(list.data.tasks[0].status, 'completed')
    assert.deepEqual(invalidations, [['dashboard-summary', session.user]])
    assert.equal(reads[0].assigned_to_me, true)
    session = { status: 'loading', user: session.user }
    worklist = hook.useAssignedTasks()
    assert.equal(captured.key, null)
    assert.equal(worklist.tasks, undefined)
    await worklist.complete(fixture)
    assert.equal(writes, 1)
    session = { status: 'authenticated', user: { permissions: ['tasks.view'] } }
    worklist = hook.useAssignedTasks()
    assert.equal(worklist.canUpdate, false)
    await worklist.complete(fixture)
    assert.equal(writes, 1)
    list.error = { statusCode: 403, message: 'Forbidden' }
    worklist = hook.useAssignedTasks()
    assert.equal(worklist.tasks, undefined)
    assert.equal(worklist.meta, undefined)
    console.log(
        'Tasks: API envelope/toggles, role/wildcard permissions, UTC midnight boundaries, terminal states and worklist rendering passed.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
