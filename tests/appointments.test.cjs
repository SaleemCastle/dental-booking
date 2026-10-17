const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const compileModule = (file, requireMap = {}) => {
    const compiled = ts.transpileModule(
        fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
        {
            compilerOptions: {
                jsx: ts.JsxEmit.React,
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                esModuleInterop: true,
            },
        },
    ).outputText
    const moduleRef = { exports: {} }
    new Function('exports', 'module', 'require', compiled)(
        moduleRef.exports,
        moduleRef,
        id => (id in requireMap ? requireMap[id] : require(id)),
    )
    return moduleRef.exports
}
const constants = compileModule('Constants/index.tsx')
const permissions = compileModule('lib/permissions.ts', {
    '../Constants': constants,
})
const workflow = compileModule('lib/appointment-workflow.ts')
const fixture = {
    id: 11,
    patient_id: 4,
    dentist_id: 9,
    treatment_id: 2,
    room_id: 3,
    chair_id: 7,
    patientName: 'Jane Doe',
    dentistName: 'Alex Rivera',
    treatmentName: 'Cleaning',
    roomName: 'Room 1',
    chairName: 'Chair 1',
    appointment_date_time: '2026-10-16T23:45:00Z',
    startsAt: '2026-10-16T23:45:00Z',
    duration_minutes: 30,
    appointment_type: 'Cleaning',
    description: 'Routine visit',
    status: 'scheduled',
}
const rooms = [
    { id: 3, name: 'Room 1', chairs: [{ id: 7, room_id: 3, name: 'Chair 1' }] },
    { id: 5, name: 'Room 2', chairs: [{ id: 8, room_id: 5, name: 'Chair 2' }] },
]

const main = async () => {
    let response
    let failure
    const requests = []
    const request = async (method, ...args) => {
        requests.push([method, ...args])
        if (failure) throw failure
        return response
    }
    const service = compileModule('services/appointments.ts', {
        '../lib/api': {
            apiClient: {
                getData: (...args) => request('get', ...args),
                postData: (...args) => request('post', ...args),
                patchData: (...args) => request('patch', ...args),
            },
        },
    })
    const dashboardService = compileModule('services/dashboard.ts', {
        '../lib/api': {
            apiClient: { getData: (...args) => request('get', ...args) },
        },
    })
    const appointment = service.normalizeAppointment(fixture)
    assert.equal(appointment.patientId, 4)
    assert.equal(appointment.durationMinutes, 30)
    assert.equal(appointment.endsAt, '2026-10-17T00:15:00.000Z')
    assert.equal(appointment.appointmentStatus, 'scheduled')
    assert.equal(
        service.normalizeAppointment({ ...fixture, room_id: null, roomId: 91 })
            .roomId,
        null,
    )
    assert.equal(
        service.normalizeAppointment({ ...fixture, patientId: 99 }).patientId,
        4,
    )
    const legacy = {
        ...fixture,
        treatmentId: null,
        roomId: null,
        chairId: null,
    }
    delete legacy.treatment_id
    delete legacy.room_id
    delete legacy.chair_id
    assert.equal(service.normalizeAppointment(legacy).room_id, null)
    assert.equal(service.normalizeAppointment(legacy).treatment_id, null)
    assert.match(workflow.formatAppointmentRange(appointment), /2026-10-17/)
    assert.equal(workflow.shiftScheduleDate('2026-12-31', 1), '2027-01-01')
    assert.equal(workflow.shiftScheduleDate('2026-03-01', -1), '2026-02-28')
    assert.equal(
        workflow.utcInputTime('2026-10-16T14:00:00-05:00'),
        '2026-10-16T19:00',
    )
    const earlier = service.normalizeAppointment({
        ...fixture,
        id: 12,
        startsAt: '2026-10-16T08:00:00Z',
    })
    assert.deepEqual(
        workflow.sortAppointments([appointment, earlier]).map(item => item.id),
        [12, 11],
    )

    response = { appointments: [fixture] }
    assert.deepEqual(await service.getAppointments('2026-10-16'), [appointment])
    assert.deepEqual(requests.pop(), [
        'get',
        '/api/appointments',
        { params: { date: '2026-10-16' } },
    ])
    response = [fixture]
    assert.deepEqual(await service.getAppointments('2026-10-16'), [appointment])
    response = { appointment: fixture }
    assert.deepEqual(await service.getAppointment(11), appointment)
    assert.deepEqual(requests.pop(), ['get', '/api/appointments/11'])
    const values = workflow.getAppointmentFormValues(appointment, '2026-10-16')
    assert.deepEqual(workflow.validateAppointmentForm(values, rooms), {})
    assert.deepEqual(workflow.toAppointmentPayload(values, appointment), {})
    const payload = workflow.toAppointmentPayload(values)
    assert.equal(payload.appointment_date_time, '2026-10-16T23:45:00.000Z')
    assert.equal(payload.room_id, 3)
    assert.equal(payload.chair_id, 7)
    await service.createAppointment(payload)
    assert.deepEqual(requests.pop(), ['post', '/api/appointments', payload])
    await service.updateAppointment(11, { description: 'Notes only' })
    assert.deepEqual(requests.pop(), [
        'patch',
        '/api/appointments/11',
        { description: 'Notes only' },
    ])
    assert.deepEqual(
        workflow.toAppointmentPayload(
            { ...values, description: 'Notes only' },
            appointment,
        ),
        { description: 'Notes only' },
    )
    assert.deepEqual(
        workflow.toAppointmentPayload(
            { ...values, room_id: '5', chair_id: '' },
            appointment,
        ),
        { room_id: 5, chair_id: null },
    )
    assert.deepEqual(
        workflow.toAppointmentPayload(
            { ...values, room_id: '', chair_id: '' },
            appointment,
        ),
        { room_id: null, chair_id: null },
    )
    assert.deepEqual(
        workflow.toAppointmentPayload({ ...values, chair_id: '' }, appointment),
        { room_id: 3, chair_id: null },
    )
    assert.deepEqual(
        workflow.toAppointmentPayload(
            { ...values, treatment_id: '6', duration_minutes: '45' },
            appointment,
        ),
        { treatment_id: 6, duration_minutes: 45 },
    )
    assert.ok(
        workflow.validateAppointmentForm({ ...values, room_id: '5' }, rooms)
            .chair_id,
    )
    assert.equal(
        workflow.validateAppointmentForm(
            { ...values, room_id: '', chair_id: '' },
            rooms,
        ).chair_id,
        undefined,
    )
    for (const duration_minutes of ['', '0', '-1', '1.5', '1441'])
        assert.ok(
            workflow.validateAppointmentForm({ ...values, duration_minutes })
                .duration_minutes,
        )
    for (const duration_minutes of ['1', '1440'])
        assert.equal(
            workflow.validateAppointmentForm({ ...values, duration_minutes })
                .duration_minutes,
            undefined,
        )
    for (const field of [
        'patient_id',
        'dentist_id',
        'appointment_date_time',
        'appointment_type',
        'description',
    ])
        assert.ok(
            workflow.validateAppointmentForm({ ...values, [field]: '' })[field],
        )
    assert.ok(
        workflow.validateAppointmentForm({
            ...values,
            appointment_type: 'a'.repeat(256),
        }).appointment_type,
    )

    await service.checkInAppointment(11)
    assert.deepEqual(requests.pop(), ['post', '/api/appointments/11/check-in'])
    await service.completeAppointment(11)
    assert.deepEqual(requests.pop(), ['post', '/api/appointments/11/complete'])
    await service.cancelAppointment(11, 'Patient request')
    assert.deepEqual(requests.pop(), [
        'post',
        '/api/appointments/11/cancel',
        { cancellation_reason: 'Patient request' },
    ])
    await service.cancelAppointment(11)
    assert.deepEqual(requests.pop(), [
        'post',
        '/api/appointments/11/cancel',
        undefined,
    ])
    await service.cancelAppointment(11, null)
    assert.deepEqual(requests.pop(), [
        'post',
        '/api/appointments/11/cancel',
        { cancellation_reason: null },
    ])
    response = { rooms }
    assert.deepEqual(await service.getAppointmentLocations(), rooms)
    assert.deepEqual(requests.pop(), ['get', '/api/appointment-locations'])
    response = {
        dentists: [{ id: 9, first_name: 'Alex', last_name: 'Rivera' }],
    }
    assert.equal(
        service.getProviderName((await service.getAppointmentProviders())[0]),
        'Alex Rivera',
    )
    assert.deepEqual(requests.pop(), ['get', '/api/dentists'])
    response = {
        bookedToday: 1,
        waitingRoom: 0,
        treatmentsDone: 0,
        unpaidInvoiceAmount: 0,
        collectionRate: 0,
        todayAppointments: [fixture],
        staffWorklist: [],
    }
    const dashboardSummary = await dashboardService.getDashboardSummary()
    assert.equal(dashboardSummary.metrics[0].value, '01')
    assert.equal(dashboardSummary.todayAppointments[0].id, fixture.id)
    assert.deepEqual(requests.pop(), ['get', '/api/dashboard/summary'])
    for (const field of [
        'patient_id',
        'dentist_id',
        'treatment_id',
        'room_id',
        'chair_id',
    ]) {
        for (const invalid of ['Jane Doe', '3.5', '0', '-1']) {
            assert.ok(
                workflow.validateAppointmentForm({
                    ...values,
                    [field]: invalid,
                })[field],
            )
        }
        assert.equal(typeof payload[field], 'number')
    }
    for (const statusCode of [401, 403, 404, 422, 500]) {
        failure = Object.assign(new Error('Booking failed'), {
            statusCode,
            errors: {
                dentist_id: ['Provider conflict'],
                appointment_date_time: ['Time conflict'],
            },
        })
        await assert.rejects(
            service.updateAppointment(11, payload),
            error => error === failure,
        )
    }
    failure = undefined
    assert.deepEqual(
        workflow.normalizeAppointmentFieldErrors({
            dentistId: ['Provider conflict'],
            room_id: ['Room conflict'],
            startsAt: ['Time conflict'],
        }),
        {
            dentist_id: ['Provider conflict'],
            room_id: ['Room conflict'],
            appointment_date_time: ['Time conflict'],
        },
    )
    assert.deepEqual(workflow.appointmentTransitions, {
        scheduled: ['checked_in', 'cancelled', 'no_show'],
        checked_in: ['in_progress', 'cancelled'],
        in_progress: ['completed', 'cancelled'],
        completed: [],
        cancelled: [],
        no_show: [],
    })
    for (const status of ['completed', 'cancelled', 'no_show'])
        assert.equal(workflow.isTerminalAppointment(status), true)
    for (const status of ['scheduled', 'checked_in', 'in_progress'])
        assert.equal(workflow.isTerminalAppointment(status), false)

    let session = {
        status: 'authenticated',
        user: { id: 81, permissions: ['appointments.view'] },
    }
    let capturedKey
    let hookData = [appointment]
    let hookError
    const cache = new Map()
    const mutations = []
    const hook = compileModule('hooks/appointments.ts', {
        swr: {
            __esModule: true,
            default: key => {
                capturedKey = key
                return {
                    data: hookData,
                    error: hookError,
                    isValidating: false,
                    mutate: async () => {},
                }
            },
            useSWRConfig: () => ({
                mutate: async (key, value, revalidate) => {
                    mutations.push({ key, value, revalidate })
                    const serialized = JSON.stringify(key)
                    cache.set(
                        serialized,
                        typeof value === 'function'
                            ? value(cache.get(serialized))
                            : value,
                    )
                },
            }),
        },
        '../context/AuthSessionContext': { useAuthSession: () => session },
        '../lib/permissions': permissions,
        '../lib/appointment-workflow': workflow,
        '../services/appointments': service,
        '../services/dashboard': dashboardService,
    })
    assert.equal(hook.useAppointments('2026-10-16').canUpdate, false)
    assert.equal(hook.useAppointments('2026-10-16').canCreate, false)
    for (const user of [
        null,
        { permissions: [] },
        { permissions: ['appointments.create'] },
    ]) {
        session = { status: 'authenticated', user }
        const denied = hook.useAppointments('2026-10-16')
        assert.equal(capturedKey, null)
        assert.equal(denied.appointments, undefined)
        assert.equal(denied.canCreate, false)
    }
    session = { status: 'loading', user: { roles: ['admin'] } }
    assert.equal(hook.useAppointments('2026-10-16').canView, false)
    assert.equal(capturedKey, null)
    session = { status: 'authenticated', user: { id: 82, roles: ['admin'] } }
    const adminState = hook.useAppointments('2026-10-16')
    assert.equal(adminState.canCreate, true)
    assert.equal(adminState.canUpdate, true)
    for (const user of [{ roles: ['admin'] }, { isSuperAdmin: true }])
        for (const permission of [
            'appointments.create',
            'appointments.update',
            'appointments.delete',
        ])
            assert.equal(
                permissions.getUserPermissionSet(user).has(permission),
                true,
            )
    for (const user of [
        { id: 1 },
        { permissions: ['appointments.view'] },
        { roles: ['billing'] },
    ])
        for (const permission of [
            'appointments.create',
            'appointments.update',
            'appointments.delete',
        ])
            assert.equal(
                permissions.getUserPermissionSet(user).has(permission),
                false,
            )

    cache.set(JSON.stringify(['appointments', session.user, '2026-10-16']), [
        appointment,
    ])
    cache.set(JSON.stringify(['appointments', session.user, '2026-10-17']), [
        earlier,
    ])
    const moved = {
        ...appointment,
        startsAt: '2026-10-17T09:00:00Z',
        endsAt: '2026-10-17T09:30:00Z',
    }
    const dashboardKey = dashboardService.dashboardSummaryKey(session.user)
    cache.set(JSON.stringify(dashboardKey), dashboardSummary)
    await adminState.syncAppointment(moved, appointment)
    assert.equal(cache.get(JSON.stringify(dashboardKey)), undefined)
    assert.ok(
        mutations.some(
            mutation =>
                JSON.stringify(mutation.key) === JSON.stringify(dashboardKey) &&
                mutation.revalidate === true,
        ),
    )
    assert.deepEqual(
        cache.get(JSON.stringify(['appointments', session.user, '2026-10-16'])),
        [],
    )
    assert.equal(
        cache.get(JSON.stringify(['appointments', session.user, '2026-10-17']))
            .length,
        2,
    )
    assert.equal(
        cache.get(JSON.stringify(['appointment', session.user, 11])).startsAt,
        moved.startsAt,
    )

    const dashboardHook = compileModule('hooks/dashboard.ts', {
        swr: {
            __esModule: true,
            default: key => {
                capturedKey = key
                return {
                    data: dashboardSummary,
                    error: hookError,
                    isValidating: false,
                    mutate: async () => {},
                }
            },
        },
        '../context/AuthSessionContext': { useAuthSession: () => session },
        '../lib/permissions': permissions,
        '../services/dashboard': dashboardService,
    })
    assert.deepEqual(
        dashboardHook.useDashboardSummary().summary,
        dashboardSummary,
    )
    assert.deepEqual(capturedKey, dashboardKey)
    hookError = { message: 'Dashboard unavailable' }
    assert.equal(dashboardHook.useDashboardSummary().summary, undefined)
    assert.equal(
        dashboardHook.useDashboardSummary().error.message,
        'Dashboard unavailable',
    )
    hookError = undefined
    const adminSession = session
    for (const status of ['loading', 'unauthenticated']) {
        session = { ...adminSession, status }
        assert.equal(dashboardHook.useDashboardSummary().summary, undefined)
        assert.equal(capturedKey, null)
    }
    session = {
        status: 'authenticated',
        user: {
            id: 93,
            permissions: ['appointments.view', 'appointments.update'],
        },
    }
    assert.equal(dashboardHook.useDashboardSummary().canView, false)
    assert.equal(capturedKey, null)
    mutations.length = 0
    await hook.useAppointmentMutationSync()(appointment)
    assert.ok(
        !mutations.some(mutation => mutation.key[0] === 'dashboard-summary'),
    )
    session = adminSession

    // A dashboard save refreshes cached schedule dates even without a mounted schedule.
    cache.set(JSON.stringify(['appointments', session.user, '2026-10-16']), [
        appointment,
    ])
    cache.set(JSON.stringify(['appointments', session.user, '2026-10-17']), [])
    await hook.useAppointmentMutationSync()(moved, appointment)
    assert.deepEqual(
        cache.get(JSON.stringify(['appointments', session.user, '2026-10-16'])),
        [],
    )
    assert.deepEqual(
        cache.get(JSON.stringify(['appointments', session.user, '2026-10-17'])),
        [moved],
    )

    let uiState = {
        ...adminState,
        appointments: [appointment, earlier],
        isLoading: false,
    }
    const Schedule = compileModule('components/AppointmentSchedule.tsx', {
        '../hooks/appointments': { useAppointments: () => uiState },
        '../lib/appointment-workflow': workflow,
        '../services/appointments': service,
        './AppointmentDetails': () => null,
        './AppointmentForm': () => null,
        './AppointmentDialog': {
            appointmentButtonClass: '',
            appointmentInputClass: '',
            appointmentPrimaryClass: '',
        },
    }).default
    const render = () => renderToStaticMarkup(React.createElement(Schedule))
    let html = render()
    assert.ok(html.includes('Daily schedule'))
    assert.ok(html.includes('Alex Rivera'))
    assert.ok(html.includes('Room 1'))
    assert.ok(html.includes('Chair 1'))
    assert.ok(html.includes('Scheduled'))
    assert.ok(html.includes('Book appointment'))
    assert.ok(
        html.indexOf('View appointment 12') <
            html.indexOf('View appointment 11'),
    )
    uiState = { ...uiState, canCreate: false, canUpdate: false }
    assert.ok(!render().includes('Book appointment'))
    uiState = { ...uiState, appointments: [] }
    assert.ok(render().includes('No appointments scheduled'))
    uiState = { ...uiState, isLoading: true }
    assert.ok(render().includes('Loading appointments'))
    uiState = {
        ...uiState,
        appointments: [appointment],
        isLoading: false,
        error: { message: 'Permission denied' },
    }
    html = render()
    assert.ok(html.includes('Permission denied'))
    assert.ok(!html.includes('View appointment 11'))
    uiState = { ...uiState, canView: false }
    assert.ok(render().includes('do not have permission'))

    let dashboardUi = {
        canView: true,
        summary: dashboardSummary,
        isLoading: false,
    }
    const Dashboard = compileModule('components/OverviewDashboard.tsx', {
        '../services/dashboard': dashboardService,
        '../hooks/dashboard': { useDashboardSummary: () => dashboardUi },
        '../hooks/appointments': {
            useAppointmentPermissions: () => ({
                canView: true,
                canCreate: true,
                canUpdate: true,
            }),
            useAppointmentMutationSync: () => async () => {},
        },
        '../services/appointments': service,
        '../lib/appointment-workflow': workflow,
        './AppointmentDetails': () => null,
        './AppointmentForm': () => null,
        './AppointmentDialog': {
            appointmentButtonClass: '',
            appointmentPrimaryClass: '',
        },
    }).default
    const renderDashboard = () =>
        renderToStaticMarkup(React.createElement(Dashboard))
    html = renderDashboard()
    assert.ok(html.includes('Book appointment'))
    assert.ok(html.includes(`View appointment ${fixture.id}`))
    dashboardUi = {
        canView: true,
        error: { message: 'Dashboard unavailable' },
        isLoading: false,
    }
    html = renderDashboard()
    assert.ok(html.includes('Dashboard unavailable'))
    assert.ok(html.includes('Retry dashboard'))
    assert.ok(!html.includes('Jane Doe'))

    console.log(
        'Appointment API, UTC, workflow, location, permissions, cache, and schedule tests passed.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
