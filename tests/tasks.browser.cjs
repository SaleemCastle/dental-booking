// All backend requests are mocked. No live clinic records are changed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.TASKS_TEST_URL || 'http://localhost:3000'
const apiOrigin = process.env.TASKS_TEST_API_URL || 'http://localhost:8000'
let today = '2026-10-17',
    actor = 'staff',
    listFailure = 0,
    writeFailure = 0
let summaryFailure = false,
    patientFailure = false,
    appointmentFailure = false
let listDelay = 600,
    holdWrite = false,
    releaseWrite
const requests = []
const makeTask = (id, changes = {}) => ({
    id,
    patient_id: null,
    appointment_id: null,
    assignee_id: 90,
    due_date: '2026-10-19',
    priority: 'normal',
    status: 'pending',
    description: `Assigned task ${id}`,
    patientName: null,
    assigneeName: 'Staff user',
    appointmentStartsAt: null,
    is_overdue: false,
    completed_at: null,
    created_at: '2026-10-10T12:00:00Z',
    updated_at: '2026-10-10T12:00:00Z',
    ...changes,
})
let tasks = [
    makeTask(1, {
        due_date: '2026-10-16',
        patient_id: 4,
        appointment_id: 8,
        patientName: 'Jane Doe',
        appointmentStartsAt: '2026-10-16T09:00:00Z',
        status: 'in_progress',
        priority: 'urgent',
        description: 'Call after treatment.',
    }),
    makeTask(2, {
        due_date: today,
        priority: 'high',
        description: 'Check pending supplies.',
    }),
    makeTask(3, {
        due_date: '2026-10-18',
        patient_id: 5,
        patientName: 'Pat Smith',
        description: 'Archived patient follow-up.',
    }),
    makeTask(4, {
        due_date: '2026-10-15',
        status: 'completed',
        completed_at: '2026-10-16T14:00:00Z',
    }),
    makeTask(5, { due_date: '2026-10-15', status: 'cancelled' }),
    makeTask(6, { assignee_id: 91, description: 'Another staff member only.' }),
    ...Array.from({ length: 13 }, (_, index) => makeTask(10 + index)),
]
const user = () => ({
    id: 90,
    email_verified_at: today,
    roles: [
        actor === 'admin'
            ? 'admin'
            : actor === 'viewer'
            ? 'reviewer'
            : 'receptionist',
    ],
    permissions: [
        'dashboard.view',
        ...(actor === 'none'
            ? []
            : actor === 'viewer'
            ? ['tasks.view']
            : actor === 'wildcard'
            ? ['tasks.*', '*.view']
            : [
                  'tasks.view',
                  'tasks.update',
                  'patients.view',
                  'appointments.view',
              ]),
    ],
})
const onRequest = async ({ method, url, payload }) => {
    requests.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        payload,
    })
    if (url.pathname === '/api/user') return { data: user() }
    if (url.pathname === '/api/dashboard/summary')
        return summaryFailure
            ? { status: 500, message: 'Summary unavailable.' }
            : {
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
        return {
            data: {
                patients: [
                    {
                        id: 4,
                        firstName: 'Jane',
                        lastName: 'Doe',
                        city: 'Bogota',
                        created_at: '2026-01-01T00:00:00Z',
                    },
                ],
            },
        }
    if (/^\/api\/patients\/\d+$/.test(url.pathname)) {
        if (patientFailure)
            return { status: 500, message: 'Patient detail unavailable.' }
        const id = Number(url.pathname.split('/').pop())
        return {
            data: {
                patient: {
                    id,
                    firstName: id === 4 ? 'Jane' : 'Pat',
                    lastName: id === 4 ? 'Doe' : 'Smith',
                    archived: id === 5,
                    city: 'Bogota',
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-01T00:00:00Z',
                    notes: '',
                    appointments: '',
                },
            },
        }
    }
    if (url.pathname === '/api/appointments/8')
        return appointmentFailure
            ? { status: 404, message: 'Appointment no longer exists.' }
            : {
                  data: {
                      appointment: {
                          id: 8,
                          patient_id: 4,
                          dentist_id: 21,
                          patientName: 'Jane Doe',
                          dentistName: 'Alex Rivera',
                          startsAt: '2026-10-16T09:00:00Z',
                          duration_minutes: 30,
                          status: 'completed',
                          description: 'Linked historical visit.',
                          appointment_type: 'Review',
                      },
                  },
              }
    if (url.pathname === '/api/tasks' && method === 'GET') {
        assert.ok(
            url.searchParams.get('assigned_to_me') === '1' ||
                url.searchParams.has('patient_id'),
        )
        assert.ok(
            !['true', 'false'].some(value =>
                [...url.searchParams.values()].includes(value),
            ),
        )
        if (listDelay)
            await new Promise(resolve => setTimeout(resolve, listDelay))
        if (listFailure)
            return { status: listFailure, message: 'Worklist unavailable.' }
        const filtered = tasks
            .filter(task =>
                url.searchParams.get('assigned_to_me') === '1'
                    ? task.assignee_id === 90
                    : task.patient_id ===
                      Number(url.searchParams.get('patient_id')),
            )
            .filter(
                task =>
                    !url.searchParams.get('status') ||
                    task.status === url.searchParams.get('status'),
            )
            .filter(
                task =>
                    url.searchParams.get('overdue') !== '1' ||
                    (['pending', 'in_progress'].includes(task.status) &&
                        task.due_date < today),
            )
            .filter(
                task =>
                    url.searchParams.get('due_today') !== '1' ||
                    (['pending', 'in_progress'].includes(task.status) &&
                        task.due_date === today),
            )
            .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id)
        const page = Number(url.searchParams.get('page')),
            perPage = Number(url.searchParams.get('per_page'))
        const lastPage = Math.max(1, Math.ceil(filtered.length / perPage))
        return {
            data: {
                tasks: filtered
                    .slice((page - 1) * perPage, page * perPage)
                    .map(task => ({
                        ...task,
                        is_overdue:
                            ['pending', 'in_progress'].includes(task.status) &&
                            task.due_date < today,
                    })),
            },
            meta: {
                pagination: {
                    currentPage: page,
                    perPage,
                    total: filtered.length,
                    lastPage,
                    hasMorePages: page < lastPage,
                },
            },
        }
    }
    if (
        /^\/api\/tasks\/\d+\/status$/.test(url.pathname) &&
        method === 'PATCH'
    ) {
        assert.deepEqual(payload, { status: 'completed' })
        if (holdWrite)
            await new Promise(resolve => {
                releaseWrite = resolve
            })
        if (writeFailure)
            return {
                status: writeFailure,
                message:
                    writeFailure === 403
                        ? 'Task update permission revoked.'
                        : writeFailure === 404
                        ? 'Task no longer exists.'
                        : 'Unable to complete task.',
                errors:
                    writeFailure === 422
                        ? { status: ['Please refresh the changed task.'] }
                        : {},
            }
        const task = tasks.find(
            item => item.id === Number(url.pathname.split('/')[3]),
        )
        if (!task) return { status: 404, message: 'Task no longer exists.' }
        Object.assign(task, {
            status: 'completed',
            completed_at: `${today}T00:30:00Z`,
            is_overdue: false,
        })
        return { data: { task } }
    }
    return {
        status: 404,
        message: `Unmocked endpoint: ${method} ${url.pathname}`,
    }
}
const writes = () =>
    requests.filter(
        item => item.method === 'PATCH' && item.path.startsWith('/api/tasks/'),
    )
let browser
async function run() {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, wait, click, select, delay } = browser
    let clockScript
    const panel = `document.querySelector('[aria-label="Assigned tasks"]')`
    const text = value =>
        `${panel}?.innerText.includes(${JSON.stringify(value)})`
    const row = id => `document.querySelector('[aria-label="Task ${id}"]')`
    const dialog = `document.querySelector('[role="dialog"]')`
    const reload = async () => {
        if (clockScript)
            await send('Page.removeScriptToEvaluateOnNewDocument', {
                identifier: clockScript,
            })
        clockScript = (
            await send('Page.addScriptToEvaluateOnNewDocument', {
                source: `(() => { const NativeDate = Date; window.__taskClockOffset = NativeDate.parse('${today}T00:30:00Z') - NativeDate.now(); window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [NativeDate.now() + window.__taskClockOffset])); } static now() { return NativeDate.now() + window.__taskClockOffset; } }; })()`,
            })
        ).identifier
        await send('Page.navigate', {
            url: `${origin}/?tab=dashboard&taskCheck=${Date.now()}`,
        })
        await wait(panel)
    }
    const returnDashboard = async () => {
        await evaluate(
            `Array.from(document.querySelectorAll('nav a')).find(link => new URL(link.href).searchParams.get('tab') === 'dashboard').click()`,
        )
        await wait(panel)
    }
    await reload()
    await wait(text('Loading assigned tasks'))
    await wait(row(1))
    listDelay = 0
    assert.ok(await evaluate(`${row(1)}.innerText.includes('Overdue')`))
    assert.ok(
        await evaluate(`${row(2)}.innerText.includes('Due today')`),
        'UTC today even while Bogota is on the previous day',
    )
    assert.equal(
        await evaluate(`${row(4)}.innerText.includes('Overdue')`),
        false,
    )
    assert.equal(await evaluate(text('Another staff member only.')), false)
    assert.equal(
        await evaluate(
            `${row(
                4,
            )}.querySelector('button[aria-label^="Complete task"]') !== null`,
        ),
        false,
    )
    await click('Next tasks')
    await wait(text('Page 2 of 2'))
    await click('Previous tasks')
    await wait(row(1))
    await select('#task-due-filter', 'today')
    await wait(row(2))
    await wait(`${panel}.querySelectorAll('article').length === 1`)
    await select('#task-status-filter', 'completed')
    await wait(text('No assigned tasks match'))
    await click('Clear task filters')
    await wait(row(1))
    await click('Open appointment 8 for task 1')
    await wait(`${dialog}?.innerText.includes('Linked historical visit.')`)
    await click('Close appointment')
    appointmentFailure = true
    await delay(2100)
    await click('Open appointment 8 for task 1')
    await wait(`${dialog}?.innerText.includes('Appointment no longer exists.')`)
    await click('Close appointment')
    appointmentFailure = false
    patientFailure = true
    await click('Open patient 5 for task 3')
    await wait(
        `document.body.innerText.includes('Patient detail unavailable.')`,
    )
    patientFailure = false
    await click('Retry patient detail')
    await wait(
        `document.querySelector('main aside')?.innerText.includes('Pat Smith')`,
    )
    assert.ok(
        await evaluate(
            `document.querySelector('main aside').innerText.includes('Archived')`,
        ),
        'Archived patient outside the list page opens',
    )
    await returnDashboard()
    await wait(row(1))
    const summariesBefore = requests.filter(
        item => item.path === '/api/dashboard/summary',
    ).length
    holdWrite = true
    await evaluate(
        `(() => { const button = document.querySelector('[aria-label="Complete task 1"]'); button.click(); button.click(); })()`,
    )
    for (let attempt = 0; attempt < 100 && !releaseWrite; attempt++)
        await delay(50)
    assert.ok(releaseWrite)
    assert.equal(writes().length, 1)
    assert.equal(
        await evaluate(`document.querySelector('#task-due-filter').disabled`),
        true,
    )
    holdWrite = false
    releaseWrite()
    releaseWrite = undefined
    await wait(text('Task completed.'))
    await wait(`${row(1)}.innerText.includes('Completed')`)
    assert.equal(
        await evaluate(`${row(1)}.innerText.includes('Overdue')`),
        false,
    )
    assert.ok(
        requests.filter(item => item.path === '/api/dashboard/summary').length >
            summariesBefore,
    )
    await select('#task-due-filter', 'today')
    await wait(row(2))
    holdWrite = true
    await click('Complete task 2')
    for (let attempt = 0; attempt < 100 && !releaseWrite; attempt++)
        await delay(50)
    assert.ok(releaseWrite)
    // Inject the outage after the write starts, so a filter revalidation
    // cannot fail first and correctly disable the completion button.
    listFailure = 500
    holdWrite = false
    releaseWrite()
    releaseWrite = undefined
    await wait(text('Worklist refresh failed'))
    assert.equal(
        await evaluate(`${row(2)} !== null`),
        false,
        'Completed task leaves the due-today list even when refresh fails',
    )
    listFailure = 0
    await click('Retry tasks')
    await wait(text('No assigned tasks match'))
    await click('Clear task filters')
    await wait(row(3))
    writeFailure = 422
    await click('Complete task 3')
    await wait(text('Please refresh the changed task.'))
    assert.equal(tasks.find(item => item.id === 3).status, 'pending')
    writeFailure = 500
    await click('Complete task 3')
    await wait(text('Unable to complete task.'))
    writeFailure = 0
    // Simulate the next UTC calendar day without changing the browser timezone.
    today = '2026-10-18'
    await evaluate('window.__taskClockOffset += 86400000')
    await click('Refresh tasks')
    await wait(`${row(3)}?.innerText.includes('Due today')`)
    assert.ok(await evaluate(text('2026-10-18')))
    const refreshCount = requests.filter(item => item.path === '/api/tasks')
        .length
    await click('Refresh dashboard')
    for (
        let attempt = 0;
        attempt < 100 &&
        requests.filter(item => item.path === '/api/tasks').length ===
            refreshCount;
        attempt++
    )
        await delay(50)
    assert.ok(
        requests.filter(item => item.path === '/api/tasks').length >
            refreshCount,
    )
    summaryFailure = true
    await click('Refresh dashboard')
    await wait(`document.body.innerText.includes('Summary unavailable.')`)
    assert.ok(
        await evaluate(`Boolean(${row(3)})`),
        'Worklist remains available when summary fails',
    )
    summaryFailure = false
    await click('Retry dashboard')
    // Reopening/assignment changes made by other staff are observed by refresh.
    tasks.find(item => item.id === 2).status = 'pending'
    await click('Refresh tasks')
    await wait(`document.querySelector('[aria-label="Complete task 2"]')`)
    if (process.env.TASKS_SCREENSHOT) {
        await evaluate(`${panel}.scrollIntoView({ block: 'start' })`)
        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
        })
        fs.writeFileSync(
            process.env.TASKS_SCREENSHOT,
            Buffer.from(screenshot.data, 'base64'),
        )
    }
    // Completion can shrink a filtered result from two pages to one.
    tasks = Array.from({ length: 16 }, (_, index) =>
        makeTask(100 + index, { due_date: today }),
    )
    await select('#task-status-filter', 'pending')
    await wait(text('Page 1 of 2'))
    await click('Next tasks')
    await wait(row(115))
    await click('Complete task 115')
    await wait(text('Page 1 of 1'))
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('article').length`),
        15,
    )
    Object.assign(tasks[0], {
        patient_id: 4,
        appointment_id: 8,
        patientName: 'Jane Doe',
    })
    actor = 'viewer'
    await reload()
    await wait(row(100))
    await wait(text('Read-only'))
    assert.ok(await evaluate(text('Patient access required')))
    assert.equal(
        await evaluate(
            `${panel}.querySelector('button[aria-label^="Complete task"]') !== null`,
        ),
        false,
    )
    assert.equal(
        await evaluate(
            `${panel}.querySelector('button[aria-label^="Open appointment"]') !== null`,
        ),
        false,
    )
    actor = 'none'
    const requestsBefore = requests.filter(item => item.path === '/api/tasks')
        .length
    await reload()
    await wait(text('You do not have permission to view tasks.'))
    await delay(200)
    assert.equal(
        requests.filter(item => item.path === '/api/tasks').length,
        requestsBefore,
        'Assignment alone grants no read access',
    )
    actor = 'wildcard'
    await reload()
    await wait(`document.querySelector('[aria-label="Complete task 100"]')`)
    writeFailure = 403
    await click('Complete task 100')
    await wait(text('Task update permission revoked.'))
    assert.equal(
        await evaluate(
            `${panel}.querySelector('button[aria-label^="Complete task"]') !== null`,
        ),
        false,
    )
    writeFailure = 0
    listFailure = 403
    actor = 'admin'
    await reload()
    await wait(text('You do not have permission to view tasks.'))
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('article').length`),
        0,
    )
    listFailure = 500
    await click('Retry tasks')
    await wait(text('Worklist unavailable.'))
    listFailure = 0
    await click('Retry tasks')
    await wait(`document.querySelector('[aria-label="Complete task 100"]')`)
    tasks = []
    await click('Refresh tasks')
    await wait(text('No tasks assigned to you.'))
    assert.deepEqual(browser.errors, [])
    console.log(
        'Task browser checks passed: assigned scope, UTC dates/rollover, filters/pagination, context links/errors, duplicate protection, completion/refresh, page shrinkage, independent errors and role/wildcard permissions.',
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
