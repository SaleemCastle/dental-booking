// Mocked backend regression: this never writes clinic records.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.FOLLOW_UPS_TEST_URL || 'http://localhost:3000'
const apiOrigin = process.env.FOLLOW_UPS_TEST_API_URL || 'http://localhost:8000'
let actor = 'staff',
    listFailure = 0,
    writeFailure = 0,
    directoryFailure = false,
    appointmentFailure = false
let holdWrite = false,
    releaseWrite,
    browser,
    tasks = [],
    nextId = 1
const requests = []
const patient = id => ({
    id,
    firstName: id === 4 ? 'Jane' : 'Pat',
    lastName: id === 4 ? 'Doe' : 'Smith',
    city: 'Bogota',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    notes: '',
    appointments: '',
})
const makeTask = (id, changes = {}) => ({
    id,
    patient_id: 4,
    appointment_id: null,
    assignee_id: 90,
    due_date: '2026-10-17',
    priority: 'normal',
    status: 'pending',
    description: `Follow-up ${id}`,
    assigneeName: 'Staff user',
    patientName: 'Jane Doe',
    appointmentStartsAt: null,
    completed_at: null,
    created_at: '2026-10-17T09:00:00Z',
    updated_at: '2026-10-17T09:00:00Z',
    ...changes,
})
const appointments = [
    { id: 8, patient_id: 4, status: 'completed' },
    { id: 9, patient_id: 4, status: 'cancelled' },
    { id: 10, patient_id: 5, status: 'scheduled' },
].map(item => ({
    ...item,
    dentist_id: 21,
    startsAt: '2026-10-16T14:00:00Z',
    duration_minutes: 30,
    dentistName: 'Alex Rivera',
}))
const onRequest = async ({ method, url, payload }) => {
    requests.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        payload,
    })
    if (url.pathname === '/api/user')
        return {
            data: {
                id: 90,
                name: 'Staff user',
                email_verified_at: '2026-10-17',
                roles: ['staff'],
                permissions: [
                    'patients.view',
                    'dashboard.view',
                    ...(actor === 'no-appointments'
                        ? []
                        : ['appointments.view']),
                    ...(actor === 'none'
                        ? []
                        : actor === 'viewer'
                        ? ['tasks.view']
                        : actor === 'creator'
                        ? ['tasks.view', 'tasks.create']
                        : ['tasks.*']),
                ],
            },
        }
    if (url.pathname === '/api/dashboard/summary')
        return {
            data: {
                bookedToday: 0,
                waitingRoom: 0,
                treatmentsDone: 0,
                unpaidInvoiceAmount: 0,
                collectionRate: 0,
                todayAppointments: [],
                staffWorklist: [],
            },
        }
    if (url.pathname === '/api/patients')
        return { data: { patients: [patient(4), patient(5)] } }
    if (/^\/api\/patients\/\d+$/.test(url.pathname))
        return {
            data: { patient: patient(Number(url.pathname.split('/').pop())) },
        }
    if (url.pathname === '/api/users')
        return directoryFailure
            ? { status: 403, message: 'Directory unavailable.' }
            : {
                  data: {
                      users: [
                          { id: 90, name: 'Staff user' },
                          { id: 91, name: 'Another staff member' },
                      ],
                  },
              }
    if (url.pathname === '/api/appointments')
        return appointmentFailure
            ? { status: 500, message: 'Visits unavailable.' }
            : { data: { appointments } }
    if (url.pathname === '/api/tasks' && method === 'GET') {
        await new Promise(resolve => setTimeout(resolve, 100))
        if (listFailure)
            return {
                status: listFailure,
                message: 'Follow-up service unavailable.',
            }
        const filtered = tasks
            .filter(task =>
                url.searchParams.has('patient_id')
                    ? task.patient_id ===
                      Number(url.searchParams.get('patient_id'))
                    : task.assignee_id === 90,
            )
            .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id)
        const page = Number(url.searchParams.get('page') || 1),
            perPage = Number(url.searchParams.get('per_page') || 15)
        return {
            data: {
                tasks: filtered.slice((page - 1) * perPage, page * perPage),
            },
            meta: {
                pagination: {
                    currentPage: page,
                    perPage,
                    lastPage: Math.max(1, Math.ceil(filtered.length / perPage)),
                    total: filtered.length,
                },
            },
        }
    }
    if (
        (url.pathname === '/api/tasks' && method === 'POST') ||
        (/^\/api\/tasks\/\d+\/status$/.test(url.pathname) && method === 'PATCH')
    ) {
        if (holdWrite)
            await new Promise(resolve => {
                releaseWrite = resolve
            })
        if (writeFailure)
            return {
                status: writeFailure,
                message:
                    writeFailure === 403
                        ? 'Task permission revoked.'
                        : 'Task could not be saved.',
                errors:
                    writeFailure === 422
                        ? { assignee_id: ['Assignee no longer exists.'] }
                        : {},
            }
        if (method === 'POST') {
            assert.equal(payload.patient_id, 4)
            assert.ok(!('completed_at' in payload) && !('status' in payload))
            const task = makeTask(nextId++, {
                ...payload,
                assigneeName:
                    payload.assignee_id === 90
                        ? 'Staff user'
                        : 'Another staff member',
            })
            tasks.push(task)
            return { status: 201, data: { task } }
        }
        assert.deepEqual(payload, { status: 'completed' })
        const task = tasks.find(
            task => task.id === Number(url.pathname.split('/')[3]),
        )
        if (!task) return { status: 404, message: 'Task no longer exists.' }
        Object.assign(task, {
            status: 'completed',
            completed_at: '2026-10-17T15:00:00Z',
        })
        return { data: { task } }
    }
    return { status: 404, message: `Unexpected ${method} ${url.pathname}` }
}
const run = async () => {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, wait, click, select, delay } = browser
    const panel = `document.querySelector(${JSON.stringify(
        '[aria-label="Patient follow-ups"]',
    )})`
    const text = value =>
        `${panel}?.innerText.includes(${JSON.stringify(value)})`
    const dialog = 'document.querySelector("[role=dialog]")'
    const dialogText = value =>
        `${dialog}?.innerText.includes(${JSON.stringify(value)})`
    const writes = () =>
        requests.filter(
            item =>
                ['POST', 'PATCH'].includes(item.method) &&
                item.path.startsWith('/api/tasks'),
        )
    const fill = async (selector, value) =>
        evaluate(
            `(() => { const element = document.querySelector(${JSON.stringify(
                selector,
            )}); Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(
                value,
            )}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); })()`,
        )
    const reload = async () => {
        await send('Page.navigate', {
            url: `${origin}/?tab=patient_list&followUpCheck=${Date.now()}`,
        })
        const navigation = `Array.from(document.querySelectorAll('nav a')).find(link => new URL(link.href).searchParams.get('tab') === 'patient_list')`
        await wait(navigation)
        await evaluate(`${navigation}.click()`)
        await click('View patient Jane Doe')
        await wait(panel)
    }
    await reload()
    await wait(text('No follow-ups for this patient yet.'))
    await click('Create follow-up')
    await wait(
        `${dialog}?.querySelector('#follow-up-assignee_id option[value="91"]')`,
    )
    assert.equal(
        await evaluate(
            `${dialog}.querySelectorAll('#follow-up-appointment_id option').length`,
        ),
        3,
    )
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('#follow-up-appointment_id option[value="10"]') !== null`,
        ),
        false,
    )
    await click('Save follow-up')
    await wait(dialogText('Enter a follow-up description.'))
    assert.equal(writes().length, 0)
    await fill('#follow-up-description', 'Call after treatment.')
    await fill('#follow-up-due_date', '2026-10-16')
    await select('#follow-up-priority', 'urgent')
    await select('#follow-up-assignee_id', '91')
    await select('#follow-up-appointment_id', '8')
    writeFailure = 422
    await click('Save follow-up')
    await wait(dialogText('Assignee no longer exists.'))
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('#follow-up-description').value`,
        ),
        'Call after treatment.',
    )
    writeFailure = 0
    holdWrite = true
    await evaluate(
        `(() => { const form = ${dialog}.querySelector('form'); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); })()`,
    )
    for (let attempt = 0; attempt < 100 && !releaseWrite; attempt++)
        await delay(50)
    assert.ok(releaseWrite)
    assert.equal(writes().filter(item => item.method === 'POST').length, 2)
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Close follow-up"]').disabled`,
        ),
        true,
    )
    holdWrite = false
    releaseWrite()
    releaseWrite = undefined
    await wait(text('Follow-up created.'))
    assert.deepEqual(writes().at(-1).payload, {
        patient_id: 4,
        appointment_id: 8,
        assignee_id: 91,
        due_date: '2026-10-16',
        priority: 'urgent',
        description: 'Call after treatment.',
    })
    await wait(text('Another staff member'))
    await click('Complete follow-up 1')
    await wait(text('Follow-up completed.'))
    await wait(text('Completed Oct 17, 2026'))
    assert.equal(await evaluate(text('Overdue')), false)
    assert.equal(
        await evaluate(
            `${panel}.querySelector('[aria-label="Complete follow-up 1"]') !== null`,
        ),
        false,
    )
    await click('View patient Pat Smith')
    await wait(text('No follow-ups for this patient yet.'))
    assert.equal(await evaluate(text('Call after treatment.')), false)
    await click('View patient Jane Doe')
    await wait(text('Call after treatment.'))

    directoryFailure = true
    appointmentFailure = true
    await delay(2100) // Let SWR's directory/appointment deduplication window expire.
    await click('Create follow-up')
    await wait(dialogText('Directory unavailable.'))
    await wait(dialogText('Visits unavailable.'))
    await fill('#follow-up-description', 'Patient-level reminder.')
    await fill('#follow-up-due_date', '2026-10-18')
    holdWrite = true
    await click('Save follow-up')
    for (let attempt = 0; attempt < 100 && !releaseWrite; attempt++)
        await delay(50)
    assert.ok(releaseWrite)
    listFailure = 500
    holdWrite = false
    releaseWrite()
    releaseWrite = undefined
    await wait(text('Follow-up created. Refresh failed'))
    assert.ok(await evaluate(text('Patient-level reminder.')))
    assert.equal(writes().at(-1).payload.appointment_id, null)
    assert.equal(writes().at(-1).payload.assignee_id, 90)
    listFailure = 0
    directoryFailure = false
    appointmentFailure = false
    await click('Retry follow-ups')
    await wait(`document.querySelector('[aria-label="Complete follow-up 2"]')`)
    holdWrite = true
    await evaluate(
        `(() => { const button = document.querySelector('[aria-label="Complete follow-up 2"]'); button.click(); button.click(); })()`,
    )
    for (let attempt = 0; attempt < 100 && !releaseWrite; attempt++)
        await delay(50)
    assert.ok(releaseWrite)
    assert.equal(writes().filter(item => item.method === 'PATCH').length, 2)
    listFailure = 500
    holdWrite = false
    releaseWrite()
    releaseWrite = undefined
    await wait(text('Follow-up completed. Refresh failed'))
    assert.equal(
        await evaluate(
            `${panel}.querySelector('[aria-label="Complete follow-up 2"]') !== null`,
        ),
        false,
    )
    listFailure = 0
    await click('Retry follow-ups')
    await wait(`!${panel}.innerText.includes('could not be refreshed')`)

    tasks.push(makeTask(3))
    await click('Refresh follow-ups')
    await wait(`document.querySelector('[aria-label="Complete follow-up 3"]')`)
    writeFailure = 403
    await click('Complete follow-up 3')
    await wait(text('Task permission revoked.'))
    assert.equal(
        await evaluate(
            `${panel}.querySelector('[aria-label^="Complete follow-up"]') !== null`,
        ),
        false,
    )
    // Update denial does not revoke a separate create permission.
    await click('Create follow-up')
    await fill('#follow-up-description', 'Denied create.')
    await fill('#follow-up-due_date', '2026-10-20')
    await click('Save follow-up')
    await wait(dialogText('Task permission revoked.'))
    await click('Close follow-up')
    assert.equal(await evaluate(text('Create follow-up')), false)
    writeFailure = 0

    actor = 'viewer'
    await reload()
    await wait(text('Read-only.'))
    assert.equal(
        await evaluate(
            `${panel}.querySelector('[aria-label^="Complete follow-up"]') !== null`,
        ),
        false,
    )
    assert.equal(await evaluate(text('Create follow-up')), false)
    actor = 'none'
    const beforeReads = requests.filter(item => item.path === '/api/tasks')
        .length
    await reload()
    await wait(text('You do not have permission to view follow-ups.'))
    assert.equal(
        requests.filter(item => item.path === '/api/tasks').length,
        beforeReads,
    )
    actor = 'creator'
    await reload()
    await wait(text('Create follow-up'))
    assert.equal(await evaluate(`${panel}.querySelector('[aria-label^="Complete follow-up"]') !== null`), false)
    actor = 'no-appointments'
    await reload()
    await click('Create follow-up')
    await wait(
        dialogText(
            'Appointment browsing requires appointment view permission.',
        ),
    )
    assert.equal(
        await evaluate(
            `${dialog}.querySelectorAll('#follow-up-appointment_id option').length`,
        ),
        1,
    )
    await click('Cancel')
    actor = 'staff'
    tasks = Array.from({ length: 17 }, (_, index) => makeTask(100 + index))
    tasks.push(
        makeTask(999, {
            patient_id: 5,
            description: 'Other patient private task.',
        }),
    )
    await reload()
    await wait(`${panel}.querySelectorAll('article').length === 15`)
    await click('Load more follow-ups')
    await wait(`${panel}.querySelectorAll('article').length === 17`)
    assert.equal(await evaluate(text('Other patient private task.')), false)
    listFailure = 403
    await click('Refresh follow-ups')
    await wait(text('You do not have permission to view follow-ups.'))
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('article').length`),
        0,
    )
    listFailure = 500
    await click('Retry follow-ups')
    await wait(text('Follow-up service unavailable.'))
    listFailure = 0
    await click('Retry follow-ups')
    await wait(`${panel}.querySelectorAll('article').length === 17`)
    assert.deepEqual(browser.errors, [])
    console.log(
        'Follow-up browser checks passed: create/complete, linked/patient context, assignees, validation, duplicate writes, failed refresh, patient isolation, pagination and permissions.',
    )
}
run()
    .catch(error => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        if (browser) await browser.close()
    })
