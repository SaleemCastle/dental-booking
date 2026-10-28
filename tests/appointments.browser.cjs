// Optional browser regression check. All backend requests are intercepted.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const origin = process.env.APPOINTMENT_TEST_URL || 'http://localhost:3000'
const apiOrigin =
    process.env.APPOINTMENT_TEST_API_URL || 'http://localhost:8000'
const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].filter(Boolean)
const executable = candidates.find(candidate => fs.existsSync(candidate))
if (!executable || typeof WebSocket === 'undefined') {
    console.error(
        'This check requires Node 22+ and Chrome/Edge/Chromium. Set BROWSER_PATH if needed.',
    )
    process.exit(1)
}
const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dental-appointment-test-'),
)
const browser = spawn(
    executable,
    [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket, send, releaseWrite
let failure = 0
let holdWrites = false
let dashboardFailure = false
let dashboardDelay = 0
let actor = 'staff'
let statusFailure = 0
let externalStatus = null
let reasonFailure = false
let detailFailure = false
const browserErrors = []
const requests = []
const today = new Date().toISOString().slice(0, 10)
const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10)
const rooms = [
    {
        id: 51,
        name: 'Room A',
        chairs: [{ id: 41, room_id: 51, name: 'Chair A' }],
    },
    {
        id: 52,
        name: 'Room B',
        chairs: [{ id: 42, room_id: 52, name: 'Chair B' }],
    },
]
const providers = [
    { id: 21, name: 'Alex Rivera' },
    { id: 22, name: 'Sam Lee' },
]
const treatments = [
    {
        id: 31,
        name: 'Cleaning',
        category: 'Preventive',
        duration_minutes: 45,
        price: '125.00',
        active: true,
    },
    {
        id: 32,
        name: 'Consultation',
        category: 'General',
        duration_minutes: 30,
        price: '90.00',
        active: true,
    },
]
const rows = [
    {
        id: 11,
        patient_id: 11,
        dentist_id: 21,
        treatment_id: 31,
        room_id: 51,
        chair_id: 41,
        startsAt: `${today}T09:00:00.000Z`,
        duration_minutes: 45,
        appointment_type: 'Cleaning',
        description: 'Existing visit',
        status: 'scheduled',
    },
]
const resource = row => ({
    ...row,
    appointment_date_time: row.startsAt,
    endsAt: new Date(
        Date.parse(row.startsAt) + row.duration_minutes * 60000,
    ).toISOString(),
    patientName: 'Jane Doe',
    dentistName: providers.find(provider => provider.id === row.dentist_id)
        ?.name,
    treatmentName:
        treatments.find(treatment => treatment.id === row.treatment_id)?.name ??
        null,
    roomName: rooms.find(room => room.id === row.room_id)?.name ?? null,
    chairName:
        rooms
            .flatMap(room => room.chairs)
            .find(chair => chair.id === row.chair_id)?.name ?? null,
    appointmentStatus: row.status,
    paymentStatus: 'unpaid',
    cancellation_reason: row.cancellation_reason ?? null,
})
const writes = () =>
    requests.filter(request => ['POST', 'PATCH'].includes(request.method))
const dashboardReads = () =>
    requests.filter(request => request.path === '/api/dashboard/summary').length

const run = async () => {
    let port
    const portFile = path.join(profile, 'DevToolsActivePort')
    for (let attempt = 0; attempt < 150; attempt++) {
        if (fs.existsSync(portFile)) {
            port = fs.readFileSync(portFile, 'utf8').split('\n')[0]
            break
        }
        // On Windows the launcher can exit successfully before Chrome's
        // debugging endpoint is ready.
        if (browser.exitCode !== null && browser.exitCode !== 0)
            throw new Error(`Browser exited with ${browser.exitCode}`)
        await delay(100)
    }
    assert.ok(port, 'Browser did not start')
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    socket = new WebSocket(
        targets.find(target => target.type === 'page').webSocketDebuggerUrl,
    )
    await new Promise((resolve, reject) => {
        socket.onopen = resolve
        socket.onerror = reject
    })
    let sequence = 0
    const pending = new Map()
    send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = ++sequence
            pending.set(id, { resolve, reject })
            socket.send(JSON.stringify({ id, method, params }))
        })
    socket.onclose = () => {
        for (const waiter of pending.values())
            waiter.reject(new Error('Browser connection closed'))
        pending.clear()
    }
    socket.onmessage = async event => {
        const item = JSON.parse(event.data)
        if (item.id) {
            const waiter = pending.get(item.id)
            if (!waiter) return
            pending.delete(item.id)
            item.error
                ? waiter.reject(new Error(JSON.stringify(item.error)))
                : waiter.resolve(item.result)
        } else if (item.method === 'Runtime.exceptionThrown') {
            browserErrors.push(
                item.params.exceptionDetails.exception?.description ??
                    item.params.exceptionDetails.text,
            )
        } else if (item.method === 'Fetch.requestPaused') {
            try {
                const { requestId, request } = item.params
                const url = new URL(request.url)
                let status = 200,
                    data = null,
                    message = 'OK',
                    errors = {}
                const payload = request.postData
                    ? JSON.parse(request.postData)
                    : undefined
                requests.push({
                    method: request.method,
                    path: url.pathname,
                    payload,
                })
                if (request.method === 'OPTIONS') status = 204
                else if (url.pathname === '/api/user')
                    data = {
                        id: 90,
                        current_tenant_id: 37,
                        name: 'Staff tester',
                        email_verified_at: today,
                        roles: [{ slug: actor === 'admin' ? 'admin' : 'staff' }],
                        permissions:
                            actor === 'viewer'
                                ? ['dashboard.view', 'appointments.view']
                                : actor === 'admin'
                                ? ['*']
                                : [
                                      'dashboard.view',
                                      'appointments.view',
                                      'appointments.create',
                                      'appointments.update',
                                      'patients.view',
                                      'treatments.view',
                                      'invoices.view',
                                  ],
                    }
                else if (url.pathname === '/api/tenants')
                    data = { tenants: [{ id: 37, name: 'Default Clinic', slug: 'default-clinic', active: true }] }
                else if (url.pathname === '/api/appointment-locations')
                    data = { rooms }
                else if (url.pathname === '/api/dentists')
                    data = { dentists: providers }
                else if (url.pathname === '/api/patients')
                    data = {
                        patients: [
                            { id: 11, firstName: 'Jane', lastName: 'Doe' },
                        ],
                    }
                else if (url.pathname === '/api/treatments')
                    data = { treatments }
                else if (url.pathname === '/api/dashboard/summary') {
                    if (dashboardDelay) await delay(dashboardDelay)
                    if (dashboardFailure) {
                        status = 500
                        message = 'Dashboard unavailable.'
                    } else {
                        const daily = rows.filter(row =>
                            row.startsAt.startsWith(today),
                        )
                        data = {
                            bookedToday: daily.length,
                            waitingRoom: daily.filter(
                                row => row.status === 'checked_in',
                            ).length,
                            treatmentsDone: daily.filter(
                                row => row.status === 'completed',
                            ).length,
                            unpaidInvoiceAmount: 275.25,
                            collectionRate: daily.length ? 64.5 : 0,
                            todayAppointments: daily.map(resource),
                            staffWorklist: providers
                                .map(provider => ({
                                    dentistId: provider.id,
                                    dentistName: provider.name,
                                    scheduled: daily.filter(
                                        row =>
                                            row.dentist_id === provider.id &&
                                            row.status === 'scheduled',
                                    ).length,
                                    checkedIn: daily.filter(
                                        row =>
                                            row.dentist_id === provider.id &&
                                            row.status === 'checked_in',
                                    ).length,
                                    completed: daily.filter(
                                        row =>
                                            row.dentist_id === provider.id &&
                                            row.status === 'completed',
                                    ).length,
                                }))
                                .filter(
                                    provider =>
                                        provider.scheduled +
                                            provider.checkedIn +
                                            provider.completed >
                                        0,
                                ),
                        }
                    }
                } else if (
                    url.pathname === '/api/appointments' &&
                    request.method === 'GET'
                )
                    data = {
                        appointments: rows
                            .filter(row =>
                                row.startsAt.startsWith(
                                    url.searchParams.get('date'),
                                ),
                            )
                            .map(resource),
                    }
                else if (
                    (request.method === 'POST' &&
                        /^\/api\/appointments\/\d+\/(check-in|complete|cancel)$/.test(
                            url.pathname,
                        )) ||
                    (request.method === 'PATCH' &&
                        /^\/api\/appointments\/\d+$/.test(url.pathname) &&
                        payload?.status)
                ) {
                    if (holdWrites)
                        await new Promise(resolve => {
                            releaseWrite = resolve
                        })
                    const row = rows.find(
                        row => row.id === Number(url.pathname.split('/')[3]),
                    )
                    const next =
                        request.method === 'PATCH'
                            ? payload.status
                            : url.pathname.endsWith('/check-in')
                            ? 'checked_in'
                            : url.pathname.endsWith('/complete')
                            ? 'completed'
                            : 'cancelled'
                    if (externalStatus) {
                        row.status = externalStatus
                        externalStatus = null
                    }
                    const allowed = {
                        scheduled: ['checked_in', 'cancelled', 'no_show'],
                        checked_in: ['in_progress', 'cancelled'],
                        in_progress: ['completed', 'cancelled'],
                        completed: [],
                        cancelled: [],
                        no_show: [],
                    }
                    if (statusFailure) {
                        status = statusFailure
                        message =
                            status === 403
                                ? 'You cannot change appointment status.'
                                : status === 422
                                ? 'The appointment status changed. Refresh and review the available actions.'
                                : 'Unable to update appointment.'
                        if (status === 422)
                            errors = {
                                status: [
                                    'This transition is no longer allowed.',
                                ],
                            }
                    } else if (reasonFailure && next === 'cancelled') {
                        status = 422
                        message = 'Please review the cancellation reason.'
                        errors = {
                            reason: ['Provide a valid cancellation reason.'],
                        }
                    } else if (
                        next !== row.status &&
                        !allowed[row.status].includes(next)
                    ) {
                        status = 422
                        message = 'Invalid appointment transition.'
                        errors = {
                            status: ['This transition is no longer allowed.'],
                        }
                    } else {
                        if (next !== row.status) {
                            const timestamp = {
                                checked_in: 'checked_in_at',
                                completed: 'completed_at',
                                cancelled: 'cancelled_at',
                            }[next]
                            if (timestamp)
                                row[timestamp] = new Date().toISOString()
                        }
                        row.status = next
                        if (
                            next === 'cancelled' &&
                            Object.prototype.hasOwnProperty.call(
                                payload ?? {},
                                'cancellation_reason',
                            )
                        )
                            row.cancellation_reason =
                                payload.cancellation_reason
                        data = { appointment: resource(row) }
                    }
                } else if (
                    ['POST', 'PATCH'].includes(request.method) &&
                    /^\/api\/appointments(?:\/\d+)?$/.test(url.pathname)
                ) {
                    if (holdWrites)
                        await new Promise(resolve => {
                            releaseWrite = resolve
                        })
                    if (failure) {
                        status = failure
                        message =
                            failure === 422
                                ? 'Please review the highlighted fields.'
                                : failure === 403
                                ? 'Appointment access denied.'
                                : 'Unable to save appointment.'
                        if (failure === 422)
                            errors = {
                                dentist_id: ['Provider is already booked.'],
                                room_id: ['Room is already booked.'],
                                chair_id: ['Chair is already booked.'],
                                appointment_date_time: [
                                    'Choose a different time.',
                                ],
                            }
                    } else {
                        let row
                        if (request.method === 'POST') {
                            row = {
                                ...payload,
                                id: 12,
                                startsAt: payload.appointment_date_time,
                                status: 'scheduled',
                            }
                            rows.push(row)
                        } else {
                            row = rows.find(
                                row =>
                                    row.id ===
                                    Number(url.pathname.split('/').pop()),
                            )
                            Object.assign(row, payload)
                            if (payload.appointment_date_time)
                                row.startsAt = payload.appointment_date_time
                        }
                        status = request.method === 'POST' ? 201 : 200
                        data = { appointment: resource(row) }
                    }
                } else if (
                    /^\/api\/appointments\/\d+$/.test(url.pathname) &&
                    request.method === 'GET'
                ) {
                    if (detailFailure) {
                        status = 503
                        message = 'Appointment details unavailable.'
                    } else
                        data = {
                            appointment: resource(
                                rows.find(
                                    row =>
                                        row.id ===
                                        Number(url.pathname.split('/').pop()),
                                ),
                            ),
                        }
                } else {
                    status = 404
                    message = 'Unexpected mocked request.'
                }
                await send('Fetch.fulfillRequest', {
                    requestId,
                    responseCode: status,
                    responseHeaders: [
                        { name: 'Content-Type', value: 'application/json' },
                        { name: 'Access-Control-Allow-Origin', value: origin },
                        {
                            name: 'Access-Control-Allow-Credentials',
                            value: 'true',
                        },
                        {
                            name: 'Access-Control-Allow-Headers',
                            value:
                                'Content-Type, X-Requested-With, X-XSRF-TOKEN',
                        },
                        {
                            name: 'Access-Control-Allow-Methods',
                            value: 'GET, POST, PATCH, OPTIONS',
                        },
                    ],
                    body:
                        status === 204
                            ? ''
                            : Buffer.from(
                                  JSON.stringify({
                                      success: status < 400,
                                      statusCode: status,
                                      message,
                                      code:
                                          status === 422
                                              ? 'VALIDATION_ERROR'
                                              : 'OK',
                                      data,
                                      errors,
                                  }),
                              ).toString('base64'),
                })
            } catch (error) {
                browserErrors.push(error.stack)
            }
        }
    }
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Emulation.setTimezoneOverride', {
        timezoneId: 'America/Bogota',
    })
    await send('Fetch.enable', { patterns: [{ urlPattern: `${apiOrigin}/*` }] })
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        })
        if (result.exceptionDetails)
            throw new Error(
                result.exceptionDetails.exception?.description ??
                    result.exceptionDetails.text,
            )
        return result.result.value
    }
    const waitFor = async (expression, timeout = 30000) => {
        for (let attempt = 0; attempt < Math.ceil(timeout / 100); attempt++) {
            if (await evaluate(`Boolean(${expression})`)) return
            await delay(100)
        }
        throw new Error(
            `Timed out: ${expression}\n${await evaluate(
                'document.body.innerText',
            )}\n${browserErrors.join('\n')}`,
        )
    }
    const clickText = async text => {
        const condition = `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(
            text,
        )} && !button.matches(':disabled'))`
        await waitFor(condition)
        await evaluate(`${condition}.click()`)
    }
    const setInput = (selector, value) =>
        evaluate(
            `(() => { const input = document.querySelector(${JSON.stringify(
                selector,
            )}); Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(
                value,
            )}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
        )
    const select = (selector, value) =>
        evaluate(
            `(() => { const input = document.querySelector(${JSON.stringify(
                selector,
            )}); input.value = ${JSON.stringify(
                value,
            )}; input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
        )
    const submit = () =>
        evaluate(
            `document.querySelector('[role="dialog"] form').requestSubmit()`,
        )
    const doubleSubmit = () =>
        evaluate(
            `(() => { const form = document.querySelector('[role="dialog"] form'); form.requestSubmit(); form.requestSubmit(); })()`,
        )
    const close = () =>
        evaluate(
            `document.querySelector('[aria-label="Close appointment"]').click()`,
        )
    const navigate = tab =>
        evaluate(
            `Array.from(document.querySelectorAll('nav a')).find(link => new URL(link.href).searchParams.get('tab') === ${JSON.stringify(
                tab,
            )}).click()`,
        )
    const waitForWrite = async count => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (writes().length === count && releaseWrite) return
            await delay(50)
        }
        throw new Error('Expected a single pending appointment write.')
    }
    const release = () => {
        holdWrites = false
        const resolve = releaseWrite
        releaseWrite = undefined
        resolve()
    }

    dashboardDelay = 800
    await send('Page.navigate', { url: `${origin}/dashboard` })
    await waitFor(`document.body.innerText.includes('Loading dashboard...')`)
    assert.equal(
        await evaluate(`document.body.innerText.includes('0% collected')`),
        false,
    )
    await waitFor(`document.body.innerText.includes('1 appointments today')`)
    dashboardDelay = 0
    await waitFor(
        `location.pathname === '/' && new URL(location.href).searchParams.get('tab') === 'dashboard'`,
    )
    assert.equal(
        await evaluate(
            `document.body.innerText.includes("You're logged in!") || document.body.innerText.includes('Edit Patient')`,
        ),
        false,
    )
    assert.ok(
        await evaluate(
            `document.body.innerText.includes('64.5% collected') && document.body.innerText.includes('Alex Rivera: 1 scheduled, 0 checked in, 0 completed')`,
        ),
    )
    assert.ok(
        await evaluate(
            `document.querySelector('[aria-label^="View appointment 11 "]').closest('div.grid').textContent.includes('09:00')`,
        ),
    )
    await clickText('Book appointment')
    await waitFor(
        `document.querySelector('#appointment-patient_id option[value="11"]') && document.querySelector('#appointment-dentist_id option[value="21"]') && document.querySelector('#appointment-treatment_id option[value="31"]') && document.querySelector('#appointment-room_id option[value="51"]')`,
    )
    await submit()
    await waitFor(
        `document.body.innerText.includes('Choose a patient.') && document.body.innerText.includes('Enter a description.')`,
    )
    assert.equal(writes().length, 0, 'Invalid form must not send a request')
    await setInput('#appointment-appointment_type', 'Consultation')
    await select('#appointment-patient_id', '11')
    await select('#appointment-dentist_id', '21')
    await select('#appointment-treatment_id', '31')
    await setInput('#appointment-appointment_date_time', `${today}T11:00`)
    await select('#appointment-room_id', '51')
    await select('#appointment-chair_id', '41')
    await setInput('#appointment-description', 'New visit')

    const initialDashboardReads = dashboardReads()
    failure = 500
    await submit()
    await waitFor(
        `document.body.innerText.includes('Unable to save appointment.')`,
    )
    assert.equal(
        await evaluate(
            `document.querySelector('#appointment-description').value`,
        ),
        'New visit',
    )
    assert.equal(
        dashboardReads(),
        initialDashboardReads,
        'Failed saves must not refresh dashboard',
    )
    failure = 422
    await submit()
    await waitFor(
        `document.querySelector('#appointment-dentist_id').getAttribute('aria-invalid') === 'true' && document.querySelector('#appointment-room_id').getAttribute('aria-invalid') === 'true' && document.querySelector('#appointment-chair_id').getAttribute('aria-invalid') === 'true' && document.querySelector('#appointment-appointment_date_time').getAttribute('aria-invalid') === 'true'`,
    )
    assert.ok(
        await evaluate(
            `['Provider is already booked.', 'Room is already booked.', 'Chair is already booked.', 'Choose a different time.'].every(message => document.querySelector('[role="dialog"] form [role="alert"]').textContent.includes(message))`,
        ),
    )
    assert.equal(
        await evaluate(
            `document.querySelector('#appointment-patient_id').value`,
        ),
        '11',
    )
    assert.equal(dashboardReads(), initialDashboardReads)

    failure = 0
    holdWrites = true
    await doubleSubmit()
    await waitForWrite(3)
    await delay(150)
    assert.equal(
        writes().length,
        3,
        'Two synchronous submissions must send one request',
    )
    assert.ok(
        await evaluate(
            `document.querySelector('button[type="submit"]').disabled && document.querySelector('[aria-label="Close appointment"]').disabled`,
        ),
    )
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
    })
    assert.ok(
        await evaluate(
            `document.querySelector('[role="dialog"] form') !== null`,
        ),
    )
    const created = writes()[2].payload
    for (const [field, id] of Object.entries({
        patient_id: 11,
        dentist_id: 21,
        treatment_id: 31,
        room_id: 51,
        chair_id: 41,
    }))
        assert.equal(created[field], id)
    assert.equal(created.duration_minutes, 45)
    assert.ok(created.appointment_date_time.endsWith('Z'))
    release()
    await waitFor(
        `document.querySelector('[role="dialog"]')?.textContent.includes('Appointment details') && document.body.innerText.includes('2 appointments today')`,
    )
    assert.ok(dashboardReads() > initialDashboardReads)
    await close()

    await navigate('calendar')
    await waitFor(
        `document.querySelector('[aria-label^="View appointment 12 "]')`,
    )
    await navigate('dashboard')
    await waitFor(
        `document.querySelector('[aria-label^="View appointment 11 "]')`,
    )
    await evaluate(
        `document.querySelector('[aria-label^="View appointment 11 "]').click()`,
    )
    await clickText('Edit appointment')
    await waitFor(`document.querySelector('#appointment-description')`)
    await setInput('#appointment-appointment_date_time', `${tomorrow}T14:00`)
    await select('#appointment-dentist_id', '22')
    await select('#appointment-treatment_id', '32')
    await select('#appointment-room_id', '52')
    assert.equal(
        await evaluate(`document.querySelector('#appointment-chair_id').value`),
        '',
    )
    await select('#appointment-chair_id', '42')
    const readsBeforeEdit = dashboardReads()
    holdWrites = true
    await doubleSubmit()
    await waitForWrite(4)
    assert.equal(writes().length, 4)
    const edited = writes()[3].payload
    assert.equal(edited.dentist_id, 22)
    assert.equal(edited.treatment_id, 32)
    assert.equal(edited.room_id, 52)
    assert.equal(edited.chair_id, 42)
    assert.equal(
        edited.patient_id,
        undefined,
        'Unchanged patient must be retained',
    )
    release()
    await waitFor(
        `document.querySelector('[role="dialog"]')?.textContent.includes('Sam Lee') && document.body.innerText.includes('1 appointments today')`,
    )
    assert.ok(dashboardReads() > readsBeforeEdit)
    await close()
    await navigate('calendar')
    await waitFor(
        `document.querySelector('[aria-label^="View appointment 12 "]') && !document.querySelector('[aria-label^="View appointment 11 "]')`,
    )
    await setInput('#schedule-date', tomorrow)
    await waitFor(
        `document.querySelector('[aria-label^="View appointment 11 "]') && document.body.innerText.includes('Sam Lee') && document.body.innerText.includes('Room B')`,
    )

    await navigate('dashboard')
    await waitFor(`document.body.innerText.includes('1 appointments today')`)
    dashboardFailure = true
    await send('Page.reload', { ignoreCache: true })
    await waitFor(`document.body.innerText.includes('Dashboard unavailable.')`)
    assert.equal(
        await evaluate(
            `document.body.innerText.includes('0% collected') || document.querySelector('[aria-label^="View appointment 12 "]') !== null`,
        ),
        false,
    )
    dashboardFailure = false
    await clickText('Retry dashboard')
    await waitFor(`document.body.innerText.includes('1 appointments today')`)

    const actionLabels = [
        'Check in',
        'Start treatment',
        'Complete',
        'Cancel appointment',
        'Mark no-show',
    ]
    const assertActions = async expected => {
        const offered = await evaluate(
            `Array.from(document.querySelectorAll('[role="dialog"] button')).map(button => button.textContent.trim()).filter(label => ${JSON.stringify(
                actionLabels,
            )}.includes(label)).sort()`,
        )
        assert.deepEqual(offered, [...expected].sort())
    }
    const hasStatus = status =>
        `document.querySelector('[role="dialog"] dl')?.previousElementSibling.textContent.includes(${JSON.stringify(
            status,
        )})`
    const openStatus = async (status, tab = 'dashboard') => {
        const row = rows.find(row => row.id === 12)
        row.status = status
        row.cancellation_reason = null
        delete row.checked_in_at
        delete row.completed_at
        delete row.cancelled_at
        await send('Page.navigate', { url: `${origin}/?tab=${tab}` })
        await waitFor(
            `document.querySelector('[aria-label^="View appointment 12 "]') && !document.querySelector('[role="dialog"]')`,
        )
        await evaluate(
            `document.querySelector('[aria-label^="View appointment 12 "]').click()`,
        )
        const labels = {
            scheduled: 'Scheduled',
            checked_in: 'Checked in',
            in_progress: 'In progress',
            completed: 'Completed',
            cancelled: 'Cancelled',
            no_show: 'No-show',
        }
        await waitFor(hasStatus(labels[status]))
        return row
    }
    const pendingAction = async (label, status) => {
        const before = writes().length
        const reads = dashboardReads()
        const onDashboard = await evaluate(
            `new URL(location.href).searchParams.get('tab') === 'dashboard'`,
        )
        const button = `Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === ${JSON.stringify(
            label,
        )} && !button.disabled)`
        await waitFor(button)
        holdWrites = true
        await evaluate(
            `(() => { const button = ${button}; button.click(); button.click(); })()`,
        )
        await waitForWrite(before + 1)
        await delay(100)
        assert.equal(
            writes().length,
            before + 1,
            `${label}: duplicate action blocked`,
        )
        assert.ok(
            await evaluate(
                `Array.from(document.querySelectorAll('[role="dialog"] button')).every(button => button.disabled)`,
            ),
        )
        assert.ok(
            await evaluate(
                `document.querySelector('[role="dialog"] [role="status"]')?.textContent.includes('Updating appointment')`,
            ),
        )
        release()
        await waitFor(
            `${hasStatus(
                status,
            )} && !document.querySelector('[role="dialog"] [role="status"]')`,
        )
        if (onDashboard)
            assert.ok(
                dashboardReads() > reads,
                `${label}: mounted dashboard refreshed`,
            )
        return writes()[before]
    }
    const assertRowStatus = async status => {
        await waitFor(
            `(() => { const button = document.querySelector('[aria-label^="View appointment 12 "]'); return (button?.closest('tr') ?? button?.closest('div.grid'))?.textContent.includes(${JSON.stringify(
                status,
            )}); })()`,
        )
    }

    await openStatus('scheduled')
    await assertActions(['Check in', 'Cancel appointment', 'Mark no-show'])
    let action = await pendingAction('Check in', 'Checked in')
    assert.equal(action.path, '/api/appointments/12/check-in')
    await assertActions(['Start treatment', 'Cancel appointment'])
    assert.ok(
        await evaluate(
            `document.body.innerText.includes('1 patients checked in')`,
        ),
    )
    await close()
    await navigate('calendar')
    await assertRowStatus('Checked in')
    await evaluate(
        `document.querySelector('[aria-label^="View appointment 12 "]').click()`,
    )
    await pendingAction('Start treatment', 'In progress')
    await assertActions(['Complete', 'Cancel appointment'])
    await close()
    await assertRowStatus('In progress')
    await navigate('dashboard')
    await assertRowStatus('In progress')
    await evaluate(
        `document.querySelector('[aria-label^="View appointment 12 "]').click()`,
    )
    action = await pendingAction('Complete', 'Completed')
    assert.equal(action.path, '/api/appointments/12/complete')
    await assertActions([])
    assert.ok(
        await evaluate(`document.body.innerText.includes('1 completed today')`),
    )
    await close()
    await navigate('calendar')
    await assertRowStatus('Completed')

    await openStatus('scheduled', 'calendar')
    await clickText('Cancel appointment')
    await setInput(
        '#appointment-cancellation_reason',
        'Patient requested another day',
    )
    reasonFailure = true
    await clickText('Confirm cancellation')
    await waitFor(
        `document.querySelector('#appointment-cancellation_reason')?.getAttribute('aria-invalid') === 'true' && !document.querySelector('[role="dialog"] [role="status"]')`,
    )
    assert.equal(
        await evaluate(
            `document.querySelector('#appointment-cancellation_reason').value`,
        ),
        'Patient requested another day',
    )
    assert.ok(
        await evaluate(
            `document.body.innerText.includes('Provide a valid cancellation reason.')`,
        ),
    )
    reasonFailure = false
    const beforeInvalidReason = writes().length
    await setInput('#appointment-cancellation_reason', 'x'.repeat(2001))
    await clickText('Confirm cancellation')
    await waitFor(
        `document.body.innerText.includes('Use at most 2000 characters.')`,
    )
    assert.equal(writes().length, beforeInvalidReason)
    await setInput(
        '#appointment-cancellation_reason',
        'Patient requested another day',
    )
    action = await pendingAction('Confirm cancellation', 'Cancelled')
    assert.equal(action.path, '/api/appointments/12/cancel')
    assert.equal(
        action.payload.cancellation_reason,
        'Patient requested another day',
    )
    assert.ok(
        await evaluate(
            `document.querySelector('[role="dialog"]').textContent.includes('Patient requested another day')`,
        ),
    )
    await assertActions([])
    await close()
    await assertRowStatus('Cancelled')
    await navigate('dashboard')
    await assertRowStatus('Cancelled')

    for (const status of ['checked_in', 'in_progress']) {
        await openStatus(status)
        await clickText('Cancel appointment')
        action = await pendingAction('Confirm cancellation', 'Cancelled')
        assert.equal(action.payload.cancellation_reason, null)
        await assertActions([])
        await close()
    }
    await openStatus('scheduled', 'calendar')
    await clickText('Mark no-show')
    action = await pendingAction('Confirm no-show', 'No-show')
    assert.equal(action.method, 'PATCH')
    assert.deepEqual(action.payload, { status: 'no_show' })
    await assertActions([])
    await close()
    await assertRowStatus('No-show')
    await navigate('dashboard')
    await assertRowStatus('No-show')

    // A competing operator completes the appointment while cancellation is open.
    await openStatus('scheduled')
    await clickText('Cancel appointment')
    externalStatus = 'completed'
    statusFailure = 422
    await clickText('Confirm cancellation')
    await waitFor(
        `${hasStatus(
            'Completed',
        )} && document.body.innerText.includes('This transition is no longer allowed.') && !document.querySelector('[role="dialog"] [role="status"]')`,
    )
    await assertActions([])
    assert.equal(
        await evaluate(
            `document.querySelector('#appointment-cancellation_reason') !== null`,
        ),
        false,
    )
    statusFailure = 0
    await close()
    await assertRowStatus('Completed')

    // If that fresh read fails, keep the error and lock actions until retry succeeds.
    await openStatus('scheduled')
    externalStatus = 'checked_in'
    statusFailure = 422
    detailFailure = true
    await clickText('Check in')
    await waitFor(
        `document.body.innerText.includes('Refresh the appointment before trying another action.') && !document.querySelector('[role="dialog"] [role="status"]')`,
    )
    assert.ok(
        await evaluate(
            `Array.from(document.querySelectorAll('[role="dialog"] button')).filter(button => ${JSON.stringify(
                actionLabels,
            )}.includes(button.textContent.trim())).every(button => button.disabled)`,
        ),
    )
    detailFailure = false
    statusFailure = 0
    await clickText('Refresh appointment')
    await waitFor(
        `${hasStatus(
            'Checked in',
        )} && !document.querySelector('[role="dialog"] [role="status"]')`,
    )
    await assertActions(['Start treatment', 'Cancel appointment'])
    await close()

    await openStatus('scheduled')
    statusFailure = 500
    await clickText('Check in')
    await waitFor(
        `document.body.innerText.includes('Unable to update appointment.') && !document.querySelector('[role="dialog"] [role="status"]')`,
    )
    await assertActions(['Check in', 'Cancel appointment', 'Mark no-show'])
    statusFailure = 0
    await pendingAction('Check in', 'Checked in')
    await close()

    actor = 'viewer'
    await openStatus('scheduled')
    await waitFor(
        `document.body.innerText.includes('Read-only appointment access.')`,
    )
    await assertActions([])
    assert.equal(
        await evaluate(
            `Array.from(document.querySelectorAll('[role="dialog"] button')).some(button => button.textContent.trim() === 'Edit appointment')`,
        ),
        false,
    )
    await close()
    actor = 'admin'
    await openStatus('scheduled')
    await pendingAction('Check in', 'Checked in')
    await close()
    actor = 'staff'
    await openStatus('scheduled')
    statusFailure = 403
    await clickText('Check in')
    await waitFor(
        `document.body.innerText.includes('You cannot change appointment status.') && !document.querySelector('[role="dialog"] [role="status"]')`,
    )
    await assertActions([])
    statusFailure = 0
    await close()

    // Empty daily data renders genuine backend zeros, then other staff's changes
    // arrive through polling, focus, and reconnect without a local mutation.
    const dailyRow = rows.find(row => row.id === 12)
    dailyRow.startsAt = `${tomorrow}T11:00:00.000Z`
    await clickText('Refresh dashboard')
    await waitFor(
        `document.body.innerText.includes('No appointments scheduled for today.') && document.body.innerText.includes('No staff workload items for today.')`,
    )
    assert.ok(
        await evaluate(
            `document.body.innerText.includes('0 appointments today') && document.body.innerText.includes('0% collected')`,
        ),
    )
    dailyRow.startsAt = `${today}T11:00:00.000Z`
    dailyRow.status = 'checked_in'
    const beforePoll = dashboardReads()
    await waitFor(
        `document.body.innerText.includes('1 patients checked in') && document.body.innerText.includes('Alex Rivera: 0 scheduled, 1 checked in, 0 completed')`,
        45000,
    )
    assert.ok(
        dashboardReads() > beforePoll,
        'Visible dashboard polls the backend',
    )
    await assertRowStatus('Checked in')
    dailyRow.status = 'cancelled'
    await evaluate(`window.dispatchEvent(new Event('focus'))`)
    await assertRowStatus('Cancelled')
    await waitFor(
        `document.body.innerText.includes('0 patients checked in') && document.body.innerText.includes('No staff workload items for today.')`,
    )
    dailyRow.status = 'completed'
    await delay(2100)
    await evaluate(`window.dispatchEvent(new Event('online'))`)
    await assertRowStatus('Completed')
    await waitFor(
        `document.body.innerText.includes('1 completed today') && document.body.innerText.includes('Alex Rivera: 0 scheduled, 0 checked in, 1 completed')`,
    )
    dashboardFailure = true
    await clickText('Refresh dashboard')
    await waitFor(`document.body.innerText.includes('Dashboard unavailable.')`)
    assert.equal(
        await evaluate(
            `document.body.innerText.includes('0% collected') || document.querySelector('[aria-label^="View appointment 12 "]') !== null`,
        ),
        false,
    )
    dashboardFailure = false
    await clickText('Retry dashboard')
    await assertRowStatus('Completed')
    assert.deepEqual(browserErrors, [])
    console.log(
        'Browser checks passed: live dashboard metrics/list/workload, UTC and legacy URL, polling/focus/reconnect/manual refresh, loading/error/empty states, create/edit, status actions, stale transition recovery, and role scenarios.',
    )
}

run()
    .catch(error => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        if (releaseWrite) releaseWrite()
        if (send && socket?.readyState === WebSocket.OPEN) {
            try {
                await send('Browser.close')
            } catch {}
        }
        socket?.close()
        browser.kill()
        // Only this test's newly created temporary profile can be removed.
        const resolvedProfile = path.resolve(profile)
        const tempRoot = path.resolve(os.tmpdir()) + path.sep
        if (
            resolvedProfile.startsWith(tempRoot) &&
            path
                .basename(resolvedProfile)
                .startsWith('dental-appointment-test-')
        ) {
            try {
                fs.rmSync(resolvedProfile, {
                    recursive: true,
                    force: true,
                    maxRetries: 2,
                    retryDelay: 100,
                })
            } catch {}
        }
    })
