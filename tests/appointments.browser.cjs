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
    cancellation_reason: null,
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
        if (browser.exitCode !== null)
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
                        name: 'Staff tester',
                        email_verified_at: today,
                        permissions: [
                            'dashboard.view',
                            'appointments.view',
                            'appointments.create',
                            'appointments.update',
                            'patients.view',
                            'treatments.view',
                        ],
                    }
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
                    if (dashboardFailure) {
                        status = 500
                        message = 'Dashboard unavailable.'
                    } else {
                        const daily = rows.filter(row =>
                            row.startsAt.startsWith(today),
                        )
                        data = {
                            bookedToday: daily.length,
                            waitingRoom: 0,
                            treatmentsDone: 0,
                            unpaidInvoiceAmount: 0,
                            collectionRate: 0,
                            todayAppointments: daily.map(resource),
                            staffWorklist: [],
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
                )
                    data = {
                        appointment: resource(
                            rows.find(
                                row =>
                                    row.id ===
                                    Number(url.pathname.split('/').pop()),
                            ),
                        ),
                    }
                else {
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
    const waitFor = async expression => {
        for (let attempt = 0; attempt < 300; attempt++) {
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

    await send('Page.navigate', { url: `${origin}/?tab=dashboard` })
    await waitFor(`document.body.innerText.includes('1 appointments today')`)
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
    dashboardFailure = false
    await clickText('Retry dashboard')
    await waitFor(`document.body.innerText.includes('1 appointments today')`)
    assert.deepEqual(browserErrors, [])
    console.log(
        'Appointment browser checks passed: canonical selectors, validation, 422/500 errors, duplicate create/edit prevention, pending save controls, and dashboard/schedule refresh after both mutations.',
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
