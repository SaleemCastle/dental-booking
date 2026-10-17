// Browser regression: backend requests are intercepted; no clinic data is changed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const origin = process.env.CLINICAL_NOTES_TEST_URL || 'http://localhost:3000'
const apiOrigin =
    process.env.CLINICAL_NOTES_TEST_API_URL || 'http://localhost:8000'
const executable = [
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
]
    .filter(Boolean)
    .find(candidate => fs.existsSync(candidate))
if (!executable || typeof WebSocket === 'undefined')
    throw new Error(
        'Node 22+ and Chrome/Edge/Chromium are required. Set BROWSER_PATH if needed.',
    )
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-notes-test-'))
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
let socket, send, evaluate, holdWrite, releaseWrite
let actor = 'dentist',
    listFailure = 0,
    writeFailure = 0,
    listDelay = 600
let providerFailure = false,
    appointmentFailure = false
let notes = [],
    nextId = 1
const requests = [],
    browserErrors = []
const patient = id => ({
    id,
    firstName: id === 4 ? 'Jane' : 'Pat',
    lastName: id === 4 ? 'Doe' : 'Smith',
    city: 'Bogota',
    sex: 'Female',
    appointments: '',
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived: id === 5,
})
const providers = [
    { id: 21, name: 'Alex Rivera' },
    { id: 22, name: 'Sam Lee' },
]
const appointments = [
    {
        id: 11,
        patient_id: 4,
        dentist_id: 21,
        startsAt: '2026-10-10T09:00:00Z',
        status: 'completed',
    },
    {
        id: 12,
        patient_id: 4,
        dentist_id: 22,
        startsAt: '2026-10-11T10:00:00Z',
        status: 'cancelled',
    },
    {
        id: 13,
        patient_id: 5,
        dentist_id: 22,
        startsAt: '2026-10-12T10:00:00Z',
        status: 'no_show',
    },
].map(item => ({
    ...item,
    appointment_date_time: item.startsAt,
    duration_minutes: 30,
    dentistName: providers.find(provider => provider.id === item.dentist_id)
        .name,
    patientName: item.patient_id === 4 ? 'Jane Doe' : 'Pat Smith',
    appointment_type: 'Visit',
    description: 'Visit',
}))
const writes = () =>
    requests.filter(
        item =>
            ['POST', 'PATCH', 'DELETE'].includes(item.method) &&
            item.path.startsWith('/api/clinical-notes'),
    )
const run = async () => {
    let port
    for (let attempt = 0; attempt < 150; attempt++) {
        const portFile = path.join(profile, 'DevToolsActivePort')
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
        } else if (item.method === 'Runtime.exceptionThrown')
            browserErrors.push(
                item.params.exceptionDetails.exception?.description ??
                    item.params.exceptionDetails.text,
            )
        else if (item.method === 'Fetch.requestPaused') {
            const { requestId, request } = item.params
            try {
                const url = new URL(request.url)
                const payload = request.postData
                    ? JSON.parse(request.postData)
                    : undefined
                requests.push({
                    method: request.method,
                    path: url.pathname,
                    params: Object.fromEntries(url.searchParams),
                    payload,
                })
                let status = 200,
                    data = null,
                    message = 'OK',
                    errors = {},
                    meta
                if (request.method === 'OPTIONS') status = 204
                else if (url.pathname === '/api/user')
                    data = {
                        id:
                            actor === 'dentist'
                                ? 90
                                : actor === 'admin'
                                ? 91
                                : 92,
                        email_verified_at: '2026-01-01',
                        roles:
                            actor === 'mixed'
                                ? ['dentist', 'receptionist']
                                : [actor],
                        permissions: [
                            'patients.view',
                            ...(actor === 'reviewer' || actor === 'mixed'
                                ? ['clinical_notes.*', '*.update']
                                : []),
                        ],
                    }
                else if (url.pathname === '/api/patients')
                    data = { patients: [patient(4), patient(5)] }
                else if (url.pathname === '/api/dashboard/summary')
                    data = {
                        bookedToday: 0,
                        waitingRoom: 0,
                        treatmentsDone: 0,
                        unpaidInvoiceAmount: 0,
                        collectionRate: 0,
                        todayAppointments: [],
                        staffWorklist: [],
                    }
                else if (/^\/api\/patients\/\d+$/.test(url.pathname))
                    data = {
                        patient: patient(Number(url.pathname.split('/').pop())),
                    }
                else if (url.pathname === '/api/dentists') {
                    data = { dentists: providers }
                    if (providerFailure) {
                        status = 500
                        message = 'Provider service unavailable.'
                    }
                } else if (url.pathname === '/api/appointments') {
                    data = { appointments }
                    if (appointmentFailure) {
                        status = 500
                        message = 'Appointment service unavailable.'
                    }
                } else if (
                    url.pathname === '/api/clinical-notes' &&
                    request.method === 'GET'
                ) {
                    if (listDelay) await delay(listDelay)
                    if (listFailure) {
                        status = listFailure
                        message = 'Notes unavailable.'
                    } else {
                        const page = Number(url.searchParams.get('page') || 1)
                        const perPage = Number(
                            url.searchParams.get('per_page') || 15,
                        )
                        const filtered = notes
                            .filter(
                                note =>
                                    note.patient_id ===
                                    Number(url.searchParams.get('patient_id')),
                            )
                            .sort(
                                (a, b) =>
                                    b.created_at.localeCompare(a.created_at) ||
                                    b.id - a.id,
                            )
                        data = {
                            clinicalNotes: filtered.slice(
                                (page - 1) * perPage,
                                page * perPage,
                            ),
                        }
                        meta = {
                            pagination: {
                                currentPage: page,
                                perPage,
                                total: filtered.length,
                                lastPage: Math.max(
                                    1,
                                    Math.ceil(filtered.length / perPage),
                                ),
                            },
                        }
                    }
                } else if (
                    url.pathname.startsWith('/api/clinical-notes') &&
                    ['POST', 'PATCH', 'DELETE'].includes(request.method)
                ) {
                    if (holdWrite)
                        await new Promise(resolve => {
                            releaseWrite = resolve
                        })
                    const existing = notes.find(
                        note =>
                            note.id === Number(url.pathname.split('/').pop()),
                    )
                    const next = { ...existing, ...payload }
                    const appointment = appointments.find(
                        item => item.id === next.appointment_id,
                    )
                    if (writeFailure) {
                        status = writeFailure
                        message =
                            status === 403
                                ? 'Clinical role required.'
                                : 'Please review the relationship.'
                        if (status === 422)
                            errors = {
                                dentist_id: [
                                    'Provider must match the linked appointment.',
                                ],
                                patient_id: [
                                    'Patient must match the linked appointment.',
                                ],
                            }
                    } else if (request.method !== 'POST' && !existing) {
                        status = 404
                        message = 'Note no longer exists.'
                    } else if (actor !== 'dentist' && actor !== 'admin') {
                        status = 403
                        message = 'Clinical role required.'
                    } else if (
                        request.method !== 'DELETE' &&
                        appointment &&
                        (appointment.patient_id !== next.patient_id ||
                            appointment.dentist_id !== next.dentist_id)
                    ) {
                        status = 422
                        errors = {
                            dentist_id: [
                                'Provider must match the linked appointment.',
                            ],
                        }
                    } else if (request.method === 'DELETE')
                        notes = notes.filter(note => note.id !== existing.id)
                    else {
                        const saved = {
                            ...next,
                            id: existing?.id ?? nextId++,
                            author_user_id: existing
                                ? existing.author_user_id
                                : 90,
                            authorName: existing
                                ? existing.authorName
                                : 'Original author',
                            updated_by_user_id: actor === 'admin' ? 91 : 90,
                            updatedByName:
                                actor === 'admin'
                                    ? 'Collaborating admin'
                                    : 'Original author',
                            created_at:
                                existing?.created_at ??
                                new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        }
                        notes = [
                            ...notes.filter(note => note.id !== saved.id),
                            saved,
                        ]
                        data = { clinicalNote: saved }
                    }
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
                                'Content-Type, X-Requested-With, X-XSRF-TOKEN, Accept',
                        },
                        {
                            name: 'Access-Control-Allow-Methods',
                            value: 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
                        },
                    ],
                    body:
                        status === 204
                            ? ''
                            : Buffer.from(
                                  JSON.stringify({
                                      success: status < 400,
                                      statusCode: status,
                                      code:
                                          status < 400
                                              ? 'OK'
                                              : status === 422
                                              ? 'VALIDATION_ERROR'
                                              : 'ERROR',
                                      message,
                                      data,
                                      errors,
                                      meta,
                                  }),
                              ).toString('base64'),
                })
            } catch (error) {
                browserErrors.push(error.stack)
                await send('Fetch.failRequest', {
                    requestId,
                    errorReason: 'Failed',
                })
            }
        }
    }
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
    })
    await send('Emulation.setTimezoneOverride', {
        timezoneId: 'America/Bogota',
    })
    await send('Fetch.enable', { patterns: [{ urlPattern: `${apiOrigin}/*` }] })
    evaluate = async expression => {
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
    const wait = async expression => {
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
    const click = async label => {
        const expression = `Array.from(document.querySelectorAll('button')).find(button => (button.getAttribute('aria-label') === ${JSON.stringify(
            label,
        )} || button.textContent.trim() === ${JSON.stringify(
            label,
        )}) && !button.matches(':disabled'))`
        await wait(expression)
        await evaluate(`${expression}.click()`)
    }
    const input = (selector, value) =>
        evaluate(
            `(() => { const element = document.querySelector(${JSON.stringify(
                selector,
            )}); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, ${JSON.stringify(
                value,
            )}); element.dispatchEvent(new Event('input', { bubbles: true })); })()`,
        )
    const select = (selector, value) =>
        evaluate(
            `(() => { const element = document.querySelector(${JSON.stringify(
                selector,
            )}); element.value = ${JSON.stringify(
                value,
            )}; element.dispatchEvent(new Event('change', { bubbles: true })); })()`,
        )
    const panel = `document.querySelector('[aria-label="Patient clinical notes"]')`
    const dialog = `document.querySelector('[role="dialog"]')`
    const panelText = text =>
        `${panel}?.innerText.includes(${JSON.stringify(text)})`
    const openPatient = async (id = 4) => {
        await click(`View patient ${id === 4 ? 'Jane Doe' : 'Pat Smith'}`)
        await wait(panel)
    }
    const reload = async () => {
        await send('Page.navigate', {
            url: `${origin}/?tab=patient_list&notesCheck=${Date.now()}`,
        })
        const navigation = `Array.from(document.querySelectorAll('nav a')).find(link => new URL(link.href).searchParams.get('tab') === 'patient_list')`
        await wait(navigation)
        await evaluate(`${navigation}.click()`)
        await openPatient()
    }
    const submit = () =>
        evaluate(
            `document.querySelector('[role="dialog"] form').requestSubmit()`,
        )
    await reload()
    await wait(panelText('Loading clinical notes'))
    await wait(panelText('No clinical notes yet'))
    listDelay = 0
    await click('Add visit note')
    await wait(
        `document.querySelector('#clinical-note-provider option[value="21"]')`,
    )
    await submit()
    await wait(`${dialog}.innerText.includes('Select a provider.')`)
    assert.equal(writes().length, 0)
    await select('#clinical-note-provider', '22')
    await input('#clinical-note-text', 'Patient-level sensitivity note.')
    holdWrite = true
    await evaluate(
        `(() => { const form = document.querySelector('[role="dialog"] form'); form.requestSubmit(); form.requestSubmit(); })()`,
    )
    for (let attempt = 0; attempt < 100 && !releaseWrite; attempt++)
        await delay(50)
    assert.ok(releaseWrite)
    assert.equal(writes().length, 1, 'Duplicate submissions blocked')
    assert.equal(
        await evaluate(
            `document.querySelector('[aria-label="Close clinical note"]').disabled`,
        ),
        true,
    )
    holdWrite = false
    releaseWrite()
    releaseWrite = null
    await wait(`!${dialog}`)
    await wait(panelText('Patient-level sensitivity note.'))
    if (process.env.CLINICAL_NOTES_SCREENSHOT) {
        await evaluate(`${panel}.scrollIntoView({ block: 'center' })`)
        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
        })
        fs.writeFileSync(
            process.env.CLINICAL_NOTES_SCREENSHOT,
            Buffer.from(screenshot.data, 'base64'),
        )
    }
    assert.deepEqual(writes()[0].payload, {
        patient_id: 4,
        dentist_id: 22,
        appointment_id: null,
        note_text: 'Patient-level sensitivity note.',
    })
    await click('Edit clinical note 1')
    await wait(
        `document.querySelector('#clinical-note-appointment option[value="11"]')`,
    )
    assert.equal(
        await evaluate(
            `document.querySelector('#clinical-note-appointment option[value="13"]') !== null`,
        ),
        false,
        'Other patient appointments excluded',
    )
    await select('#clinical-note-appointment', '11')
    assert.equal(
        await evaluate(
            `document.querySelector('#clinical-note-provider').value`,
        ),
        '21',
    )
    assert.equal(
        await evaluate(
            `document.querySelector('#clinical-note-provider').disabled`,
        ),
        true,
    )
    await click('Save changes')
    await wait(`!${dialog}`)
    await wait(panelText('Appointment #11'))
    assert.deepEqual(writes().at(-1).payload, {
        dentist_id: 21,
        appointment_id: 11,
    })
    actor = 'admin'
    await reload()
    await wait(panelText('Patient-level sensitivity note.'))
    await click('Edit clinical note 1')
    await input('#clinical-note-text', 'Collaborative revision.')
    await click('Save changes')
    await wait(`!${dialog}`)
    await wait(panelText('Collaborating admin'))
    assert.deepEqual(writes().at(-1).payload, {
        note_text: 'Collaborative revision.',
    })
    assert.ok(await evaluate(panelText('By Original author')))
    await click('Edit clinical note 1')
    await select('#clinical-note-appointment', '')
    await click('Save changes')
    await wait(`!${dialog}`)
    assert.deepEqual(writes().at(-1).payload, { appointment_id: null })
    await click('Edit clinical note 1')
    await input('#clinical-note-text', 'Needs validation.')
    writeFailure = 422
    await click('Save changes')
    await wait(`${dialog}.innerText.includes('Provider must match')`)
    assert.ok(
        await evaluate(`${dialog}.innerText.includes('Patient must match')`),
    )
    assert.equal(notes[0].note_text, 'Collaborative revision.')
    writeFailure = 0
    await click('Save changes')
    await wait(`!${dialog}`)
    // Persisted note remains visible when the subsequent list refresh fails.
    await click('Edit clinical note 1')
    await input('#clinical-note-text', 'Saved despite refresh failure.')
    listFailure = 500
    await click('Save changes')
    await wait(`!${dialog}`)
    await wait(panelText('Saved despite refresh failure.'))
    await wait(panelText('Refresh failed'))
    listFailure = 0
    await click('Retry notes')
    await wait(`!${panel}.querySelector('[role="alert"]')`)
    await click('Delete clinical note 1')
    await click('Keep note')
    await wait(`!${dialog}`)
    assert.equal(notes.length, 1)
    await click('Delete clinical note 1')
    await click('Delete note')
    await wait(`!${dialog}`)
    await wait(panelText('No clinical notes yet'))
    assert.equal(notes.length, 0)
    // Pagination includes legacy records and scopes every page to this patient.
    notes = Array.from({ length: 16 }, (_, index) => ({
        id: 100 + index,
        patient_id: 4,
        dentist_id: 21,
        appointment_id: null,
        note_text: `Historical note ${index}`,
        author_user_id: null,
        updated_by_user_id: null,
        authorName: null,
        updatedByName: null,
        created_at: '2026-01-01T12:00:00Z',
        updated_at: '2026-01-01T12:00:00Z',
    }))
    actor = 'reviewer'
    await reload()
    await wait(panelText('Read-only'))
    await wait(panelText('Unknown (legacy note)'))
    await click('Load older notes')
    await wait(panelText('Historical note 0'))
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('article').length`),
        16,
    )
    assert.equal(
        await evaluate(
            `${panel}.innerText.includes('Add visit note') || Boolean(${panel}.querySelector('[aria-label^="Edit clinical"]'))`,
        ),
        false,
    )
    assert.ok(
        requests.some(
            item =>
                item.path === '/api/clinical-notes' &&
                item.params.page === '2' &&
                item.params.patient_id === '4',
        ),
    )
    actor = 'mixed'
    await reload()
    await wait(panelText('Read-only'))
    await wait(panelText('Historical note'))
    assert.equal(
        await evaluate(panelText('Add visit note')),
        false,
        'Receptionist/dentist wildcard cannot write',
    )
    actor = 'receptionist'
    const before = requests.filter(item => item.path === '/api/clinical-notes')
        .length
    await reload()
    await wait(panelText('You do not have permission to view'))
    await delay(200)
    assert.equal(
        requests.filter(item => item.path === '/api/clinical-notes').length,
        before,
        'No unauthorized notes fetch',
    )
    actor = 'dentist'
    listFailure = 500
    await reload()
    await wait(panelText('Retry notes'))
    listFailure = 0
    await click('Retry notes')
    await wait(panelText('Historical note'))
    await click('View patient Pat Smith')
    await wait(panelText('No clinical notes yet'))
    assert.equal(
        await evaluate(panelText('Historical note')),
        false,
        'Patient timeline isolated',
    )
    providerFailure = true
    appointmentFailure = true
    await click('Add visit note')
    await wait(
        `${dialog}.innerText.includes('Appointments could not be loaded')`,
    )
    // Providers may already be cached; revalidation errors still have retry controls.
    await wait(`${dialog}.innerText.includes('Providers could not be loaded')`)
    providerFailure = false
    appointmentFailure = false
    await click('Retry providers')
    await click('Retry appointments')
    await wait(
        `document.querySelector('#clinical-note-appointment option[value="13"]')`,
    )
    await select('#clinical-note-appointment', '13')
    await input('#clinical-note-text', 'Archived patient visit note.')
    await click('Save note')
    await wait(`!${dialog}`)
    await wait(panelText('Archived patient visit note.'))
    assert.equal(writes().at(-1).payload.patient_id, 5)
    await click('Edit clinical note 2')
    await input('#clinical-note-text', 'Denied update')
    writeFailure = 403
    await click('Save changes')
    await wait(`${dialog}.innerText.includes('Clinical role required')`)
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('button[type="submit"]').disabled`,
        ),
        true,
    )
    await click('Close clinical note')
    listFailure = 403
    await reload()
    await wait(panelText('You do not have permission to view clinical notes.'))
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('article').length`),
        0,
    )
    assert.deepEqual(browserErrors, [])
    console.log(
        'Clinical notes browser checks passed: create/edit/link/detach/delete, collaborative attribution, canonical IDs, validation, duplicate protection, refresh failures, pagination, archived patients and role restrictions.',
    )
}
run()
    .catch(async error => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        if (send && socket?.readyState === WebSocket.OPEN) {
            try {
                await send('Browser.close')
            } catch {}
        }
        socket?.close()
        browser.kill()
        // Remove only this test's independently allocated temporary profile.
        try {
            const target = path.resolve(profile)
            if (
                path.dirname(target) !== path.resolve(os.tmpdir()) ||
                !path.basename(target).startsWith('dental-notes-test-')
            )
                throw new Error('Unexpected browser profile path')
            fs.rmSync(target, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 100,
            })
        } catch {}
    })
