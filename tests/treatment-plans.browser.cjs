// All API requests are intercepted. These checks never modify clinic records.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const {
    metadata,
    emptyChart,
    finding,
    tooth,
} = require('./dental-chart-fixtures.cjs')
const origin = process.env.TREATMENT_PLAN_TEST_URL || 'http://localhost:3010'
const apiOrigin =
    process.env.TREATMENT_PLAN_TEST_API_URL || 'http://localhost:8000'
const executable = [
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
]
    .filter(Boolean)
    .find(file => fs.existsSync(file))
if (!executable || typeof WebSocket === 'undefined')
    throw new Error('Chrome/Edge and Node 22+ are required.')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'treatment-plan-test-'))
const browser = spawn(
    executable,
    [
        '--headless=new',
        '--disable-gpu',
        '--disable-gpu-sandbox',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
    ],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
)
let browserStderr = '',
    lastCommand = ''
browser.stderr.on('data', chunk => {
    browserStderr = (browserStderr + chunk.toString()).slice(-3000)
})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket, send, evaluate
let nextDialogAccept = true
let actor = 'dentist',
    tenant = 37,
    readFailure = 0,
    writeFailure = 0,
    sequenceWrites = 0,
    failSequenceWrite = 0
const requests = [],
    browserErrors = [],
    database = new Map()
let nextPlanId = 1,
    nextItemId = 1
const rows = () => {
    if (!database.has(tenant)) database.set(tenant, [])
    return database.get(tenant)
}
const catalog = [
    { id: 31, name: 'Filling', price: '125.50', active: true },
    { id: 32, name: 'Sealant', price: '80.00', active: true },
    { id: 33, name: 'Inactive procedure', price: '50.00', active: false },
]
const patient = id => ({
    id,
    firstName: id === 4 ? 'Jane' : 'Pat',
    lastName: id === 4 ? 'Doe' : 'Smith',
    city: 'Bogota',
    sex: 'Female',
    notes: '',
    appointments: '',
    archived: id === 5,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
})
const newPlan = (title, patient_id = 4) => {
    const plan = {
        id: nextPlanId++,
        patient_id,
        title,
        status: 'draft',
        notes: null,
        items: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }
    rows().unshift(plan)
    return plan
}
const newItem = (plan, payload) => {
    const treatment = catalog.find(item => item.id === payload.treatment_id)
    const item = {
        id: nextItemId++,
        treatment_plan_id: plan.id,
        treatment_id: treatment.id,
        treatment_name: treatment.name,
        catalog_price: treatment.price,
        estimated_price: Number(
            payload.estimated_price ?? treatment.price,
        ).toFixed(2),
        dentist_id: payload.dentist_id,
        tooth_context: payload.tooth_context ?? null,
        sequence:
            payload.sequence ??
            Math.max(0, ...plan.items.map(item => item.sequence)) + 1,
        priority: payload.priority ?? 'normal',
        status: 'proposed',
        notes: payload.notes ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }
    plan.items.push(item)
    return item
}
const writes = () =>
    requests.filter(request => ['POST', 'PATCH'].includes(request.method))
async function run() {
    let port
    for (let attempt = 0; attempt < 150; attempt++) {
        if (fs.existsSync(path.join(profile, 'DevToolsActivePort'))) {
            port = fs
                .readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8')
                .split('\n')[0]
            break
        }
        if (browser.exitCode !== null) throw new Error('Browser exited')
        await delay(100)
    }
    assert.ok(port)
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    socket = new WebSocket(
        targets.find(item => item.type === 'page').webSocketDebuggerUrl,
    )
    await new Promise((resolve, reject) => {
        socket.onopen = resolve
        socket.onerror = reject
    })
    let sequence = 0
    const pending = new Map()
    send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            lastCommand = method
            const id = ++sequence
            const timer = setTimeout(() => {
                pending.delete(id)
                reject(new Error(`Browser command timed out: ${method}`))
            }, 30000)
            pending.set(id, {
                resolve: value => {
                    clearTimeout(timer)
                    resolve(value)
                },
                reject: error => {
                    clearTimeout(timer)
                    reject(error)
                },
            })
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
            return
        }
        if (item.method === 'Runtime.exceptionThrown')
            browserErrors.push(
                item.params.exceptionDetails.exception?.description ??
                    item.params.exceptionDetails.text,
            )
        if (item.method === 'Page.javascriptDialogOpening') {
            await send('Page.handleJavaScriptDialog', {
                accept: nextDialogAccept,
            })
            nextDialogAccept = true
            return
        }
        if (item.method !== 'Fetch.requestPaused') return
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
                data = {},
                message = 'OK',
                errors = {},
                meta

            const listRoute = url.pathname.match(
                /^\/api\/patients\/(\d+)\/treatment-plans$/,
            )
            const planRoute = url.pathname.match(
                /^\/api\/treatment-plans\/(\d+)(?:\/items(?:\/(\d+))?)?$/,
            )
            const isWrite = ['POST', 'PATCH'].includes(request.method)
            const allowedWrite = actor === 'dentist' || actor === 'admin'
            if (request.method === 'OPTIONS') status = 204
            else if (url.pathname === '/api/user')
                data = {
                    id: 90,
                    current_tenant_id: tenant,
                    email_verified_at: '2026-01-01',
                    roles:
                        actor === 'mixed'
                            ? [{ slug: 'dentist' }, { slug: 'receptionist' }]
                            : [{ slug: actor }],
                    permissions: [
                        'patients.view',
                        'treatments.view',
                        ...(actor === 'reviewer'
                            ? ['treatment_plans.view']
                            : actor === 'creator'
                            ? [
                                  'treatment_plans.create',
                                  'treatment_plans.update',
                              ]
                            : actor === 'wildcard'
                            ? ['*']
                            : []),
                    ],
                }
            else if (url.pathname === '/api/tenants')
                data = {
                    tenants: [
                        {
                            id: tenant,
                            name: 'Clinic ' + tenant,
                            slug: 'clinic-' + tenant,
                            active: true,
                        },
                    ],
                }
            else if (url.pathname === '/api/patients')
                data = { patients: [patient(4), patient(5)] }
            else if (/^\/api\/patients\/\d+$/.test(url.pathname))
                data = {
                    patient: patient(Number(url.pathname.split('/').pop())),
                }
            else if (url.pathname === '/api/dental-chart/metadata')
                data = metadata
            else if (url.pathname.includes('/dental-chart'))
                data = {
                    chart: emptyChart(
                        Number(url.pathname.split('/')[3]),
                        url.searchParams.get('dentition') || 'adult',
                    ),
                }
            else if (url.pathname === '/api/dentists')
                data = { dentists: [{ id: 21, name: 'Alex Rivera' }] }
            else if (url.pathname === '/api/treatments')
                data = {
                    treatments: catalog.filter(item =>
                        url.searchParams.get('active') === '1'
                            ? item.active
                            : true,
                    ),
                }
            else if (url.pathname === '/api/clinical-notes') {
                data = { clinicalNotes: [] }
                meta = { pagination: { lastPage: 1 } }
            } else if (
                (listRoute || planRoute) &&
                isWrite &&
                (!allowedWrite || writeFailure)
            ) {
                status = !allowedWrite ? 403 : writeFailure
                message =
                    status === 403
                        ? 'Clinical access is required.'
                        : 'Review the treatment estimate.'
                errors =
                    status === 422
                        ? { estimated_price: ['The estimate is not accepted.'] }
                        : {}
            } else if ((listRoute || planRoute) && !isWrite && readFailure) {
                status = readFailure
                message = 'Planning service unavailable.'
            } else if (listRoute) {
                const id = Number(listRoute[1])
                if (request.method === 'POST') {
                    status = 201
                    data = { treatmentPlan: newPlan(payload.title, id) }
                    data.treatmentPlan.notes = payload.notes ?? null
                } else {
                    const page = Number(url.searchParams.get('page') || 1),
                        perPage = Number(url.searchParams.get('per_page') || 15)
                    const all = rows()
                        .filter(
                            plan =>
                                plan.patient_id === id &&
                                (!url.searchParams.get('status') ||
                                    plan.status ===
                                        url.searchParams.get('status')),
                        )
                        .sort((a, b) => b.id - a.id)
                    data = all.slice((page - 1) * perPage, page * perPage)
                    meta = {
                        pagination: {
                            currentPage: page,
                            lastPage: Math.max(
                                1,
                                Math.ceil(all.length / perPage),
                            ),
                            total: all.length,
                        },
                    }
                }
            } else if (planRoute) {
                const plan = rows().find(
                    plan => plan.id === Number(planRoute[1]),
                )
                if (!plan) {
                    status = 404
                    message = 'Plan not found.'
                } else if (!isWrite)
                    data = {
                        treatmentPlan: {
                            ...plan,
                            items: [...plan.items].sort(
                                (a, b) =>
                                    a.sequence - b.sequence || a.id - b.id,
                            ),
                        },
                    }
                else if (['completed', 'cancelled'].includes(plan.status)) {
                    status = 422
                    message = 'This plan is read-only.'
                } else if (request.method === 'POST') {
                    status = 201
                    data = { treatmentPlanItem: newItem(plan, payload) }
                } else if (planRoute[2]) {
                    const item = plan.items.find(
                        item => item.id === Number(planRoute[2]),
                    )
                    if (!item) {
                        status = 404
                        message = 'Item not found.'
                    } else if (
                        ['completed', 'cancelled'].includes(item.status)
                    ) {
                        status = 422
                        message = 'This item is read-only.'
                    } else if (
                        payload.sequence !== undefined &&
                        ++sequenceWrites === failSequenceWrite
                    ) {
                        status = 422
                        message =
                            'Another item changed. Please reload the order.'
                    } else {
                        Object.assign(item, payload)
                        if (payload.estimated_price !== undefined)
                            item.estimated_price = Number(
                                payload.estimated_price,
                            ).toFixed(2)
                        data = { treatmentPlanItem: item }
                    }
                } else {
                    if (
                        payload.status === 'active' &&
                        !plan.items.some(item => item.status === 'proposed')
                    ) {
                        status = 422
                        message = 'Add a proposed item.'
                    } else if (
                        payload.status === 'completed' &&
                        (plan.items.some(item =>
                            ['proposed', 'in_progress'].includes(item.status),
                        ) ||
                            !plan.items.some(
                                item => item.status === 'completed',
                            ))
                    ) {
                        status = 422
                        message = 'Complete remaining items first.'
                    } else {
                        Object.assign(plan, payload)
                        if (payload.status === 'cancelled')
                            plan.items.forEach(item => {
                                if (
                                    ['proposed', 'in_progress'].includes(
                                        item.status,
                                    )
                                )
                                    item.status = 'cancelled'
                            })
                        data = { treatmentPlan: plan }
                    }
                }
            }
            await send('Fetch.fulfillRequest', {
                requestId,
                responseCode: status,
                responseHeaders: [
                    { name: 'Content-Type', value: 'application/json' },
                    { name: 'Access-Control-Allow-Origin', value: origin },
                    { name: 'Access-Control-Allow-Credentials', value: 'true' },
                    {
                        name: 'Access-Control-Allow-Headers',
                        value:
                            'Content-Type, X-Requested-With, X-XSRF-TOKEN, Accept, X-Tenant-Id',
                    },
                    {
                        name: 'Access-Control-Allow-Methods',
                        value: 'GET, POST, PATCH, OPTIONS',
                    },
                    { name: 'Cache-Control', value: 'private, no-store' },
                ],
                body:
                    status === 204
                        ? ''
                        : Buffer.from(
                              JSON.stringify({
                                  success: status < 400,
                                  statusCode: status,
                                  code:
                                      status === 409
                                          ? 'CONFLICT'
                                          : status < 400
                                          ? 'OK'
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
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
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
        for (let attempt = 0; attempt < 400; attempt++) {
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
        const target = `Array.from(document.querySelectorAll('button')).find(button => (button.getAttribute('aria-label') === ${JSON.stringify(
            label,
        )} || button.textContent.trim() === ${JSON.stringify(
            label,
        )}) && !button.matches(':disabled'))`
        await wait(target)
        await evaluate(`${target}.click()`)
    }
    const select = (selector, value) =>
        evaluate(
            `(() => { const el = document.querySelector(${JSON.stringify(
                selector,
            )}); el.value = ${JSON.stringify(
                value,
            )}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`,
        )
    const input = (selector, value) =>
        evaluate(
            `(() => { const el = document.querySelector(${JSON.stringify(
                selector,
            )}); Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(
                value,
            )}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`,
        )
    const panel = `document.querySelector('[aria-label="Patient treatment plans"]')`
    const chart = `document.querySelector('[aria-label="Patient dental chart"]')`
    const dialog = `document.querySelector('[role="dialog"]')`
    const panelText = value =>
        `${panel}?.innerText.includes(${JSON.stringify(value)})`
    const dialogText = value =>
        `${dialog}?.innerText.includes(${JSON.stringify(value)})`
    const reload = async () => {
        await send('Page.navigate', {
            url: `${origin}/?tab=patient_list&planCheck=${Date.now()}`,
        })
        await click('View patient Jane Doe')
        await wait(
            `document.querySelector('[aria-label="Patient detail for Jane Doe"][aria-busy="false"]')`,
        )
        await click('Medical Record')
        await wait(panel)
    }
    const checkbox = async text =>
        evaluate(
            `Array.from(${dialog}.querySelectorAll('label')).find(label=>label.textContent.includes(${JSON.stringify(
                text,
            )})).querySelector('input[type="checkbox"]').click()`,
        )
    const field = label => `[aria-label="${label}"]`
    const confirmStatus = async label => {
        await click(label)
        await click('Confirm status change')
        await wait(`!${dialog}`)
    }
    await reload()
    await wait(panelText('No treatment plans yet'))
    await wait(`${chart}.querySelector('[data-tooth="16"]')`)
    await evaluate(
        `${chart}.querySelector('[data-tooth="16"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`,
    )
    await click('Plan treatment for this tooth')
    await wait(panelText('Selected from odontogram'))
    await click('Create treatment plan')
    await input(field('Plan title'), 'Restorative care')
    await input(field('Plan notes'), 'Discuss care options')
    await click('Create draft plan')
    await wait(`!${dialog}`)
    await wait(panelText('This draft has no treatment items'))
    assert.equal(rows()[0].status, 'draft')
    assert.equal(writes()[0].payload.status, undefined)
    await click('Add treatment')
    await wait(
        `${dialog}.querySelector('[aria-label="Catalog treatment"] option[value="31"]')`,
    )
    await select(field('Catalog treatment'), '31')
    await select(field('Planned treatment provider'), '21')
    await input(field('Estimated item price'), '0.10')
    await wait(
        `${dialog}.querySelector('[aria-label="Planned tooth"]').value === '16'`,
    )
    await checkbox('M · Mesial')
    await checkbox('O · Occlusal')
    writeFailure = 422
    await click('Add treatment to plan')
    await wait(dialogText('The estimate is not accepted'))
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Estimated item price"]').value`,
        ),
        '0.10',
    )
    writeFailure = 0
    const beforeAdd = writes().length
    await evaluate(
        `${dialog}.querySelector('button[type="submit"]').click();${dialog}.querySelector('button[type="submit"]').click()`,
    )
    await wait(`!${dialog}`)
    assert.equal(writes().length, beforeAdd + 1)
    assert.equal(rows()[0].items[0].tooth_context.numbering_system, 'fdi')
    assert.equal(rows()[0].items[0].tooth_context.tooth, '16')
    assert.deepEqual(rows()[0].items[0].tooth_context.surfaces, ['M', 'O'])
    catalog[0].name = 'Updated filling'
    catalog[0].price = '999.00'
    catalog[0].active = false
    await click('Add treatment')
    await wait(
        `${dialog}.querySelector('[aria-label="Catalog treatment"] option[value="32"]') && !${dialog}.querySelector('[aria-label="Catalog treatment"] option[value="31"]')`,
    )
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Catalog treatment"] option[value="33"]') !== null`,
        ),
        false,
    )
    await select(field('Catalog treatment'), '32')
    await select(field('Planned treatment provider'), '21')
    await input(field('Estimated item price'), '0.20')
    await select(field('Planning dentition'), 'primary')
    await select(field('Planned tooth'), '51')
    await checkbox('I · Incisal')
    await click('Add treatment to plan')
    await wait(`!${dialog}`)
    assert.equal(rows()[0].items[1].tooth_context.tooth, '51')
    await click('Add treatment')
    await wait(
        `${dialog}.querySelector('[aria-label="Catalog treatment"] option[value="32"]')`,
    )
    await select(field('Catalog treatment'), '32')
    await select(field('Planned treatment provider'), '21')
    await input(field('Estimated item price'), '10.00')
    await checkbox('Tooth-specific procedure')
    await click('Add treatment to plan')
    await wait(`!${dialog}`)
    await wait(panelText('Estimated total: 10.30'))
    await click('Edit planned treatment 3')
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Planned tooth context"]') !== null`,
        ),
        false,
        'Editing a general procedure must not inherit a chart selection',
    )
    await input(field('Planned item notes'), 'General procedure note')
    await click('Save planned treatment')
    await wait(`!${dialog}`)
    assert.deepEqual(writes().at(-1).payload, {
        notes: 'General procedure note',
    })
    await click('Edit plan details')
    await input(field('Plan title'), 'Restorative care revised')
    await click('Save plan details')
    await wait(`!${dialog}`)
    assert.deepEqual(writes().at(-1).payload, {
        title: 'Restorative care revised',
    })
    await click('Edit planned treatment 1')
    await wait(dialogText('Captured catalog price: 125.50'))
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Planned tooth"]').value`,
        ),
        '16',
    )
    await select(field('Item priority'), 'urgent')
    await input(field('Planned item notes'), 'Patient preference recorded')
    await click('Save planned treatment')
    await wait(`!${dialog}`)
    assert.deepEqual(writes().at(-1).payload, {
        priority: 'urgent',
        notes: 'Patient preference recorded',
    })
    await click('View item 1 on odontogram')
    await wait(
        `${chart}.querySelector('[data-tooth="16"]').getAttribute('aria-selected') === 'true'`,
    )
    await wait(`${chart}.innerText.includes('Planning context: Adult tooth 3')`)
    await click('Edit planned treatment 2')
    await checkbox('Tooth-specific procedure')
    await click('Save planned treatment')
    await wait(`!${dialog}`)
    assert.deepEqual(writes().at(-1).payload, { tooth_context: null })
    await click('Reorder items')
    await click('Move item 3 earlier')
    await click('Move item 3 earlier')
    sequenceWrites = 0
    failSequenceWrite = 2
    await click('Save item order')
    await wait(dialogText('1 order change saved'))
    assert.equal(
        await evaluate(
            `Array.from(${dialog}.querySelectorAll('button')).find(button=>button.textContent === 'Save item order').disabled`,
        ),
        true,
    )
    failSequenceWrite = 0
    await click('Reload latest order')
    await wait(dialogText('Latest order loaded'))
    await click('Move item 3 earlier')
    await click('Save item order')
    await wait(`!${dialog}`)
    assert.deepEqual(
        [...rows()[0].items]
            .sort((a, b) => a.sequence - b.sequence || a.id - b.id)
            .map(item => item.id),
        [3, 1, 2],
    )
    await confirmStatus('Activate plan')
    await wait(panelText('Active'))
    await confirmStatus('Start planned treatment 1')
    await wait(panelText('In progress'))
    await confirmStatus('Complete planned treatment 1')
    assert.equal(
        await evaluate(
            `${panel}.querySelector('[aria-label="Edit planned treatment 1"]') !== null`,
        ),
        false,
    )
    await confirmStatus('Cancel planned treatment 2')
    await confirmStatus('Cancel planned treatment 3')
    await wait(panelText('Estimated total: 0.10'))
    await confirmStatus('Complete plan')
    await wait(panelText('This completed plan is read-only'))
    assert.equal(
        rows().find(plan => plan.id === 1).items[0].treatment_name,
        'Filling',
    )
    assert.equal(
        rows().find(plan => plan.id === 1).items[0].catalog_price,
        '125.50',
    )
    const active = newPlan('Cancellation preserves completed work')
    active.status = 'active'
    newItem(active, { treatment_id: 32, dentist_id: 21 }).status = 'completed'
    newItem(active, { treatment_id: 32, dentist_id: 21 })
    await click('Refresh treatment plans')
    await click('Open treatment plan Cancellation preserves completed work')
    await confirmStatus('Cancel plan')
    await wait(panelText('This cancelled plan is read-only'))
    assert.deepEqual(
        active.items.map(item => item.status),
        ['completed', 'cancelled'],
    )
    if (process.env.TREATMENT_PLAN_SCREENSHOT) {
        const capture = await send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
        })
        fs.writeFileSync(
            process.env.TREATMENT_PLAN_SCREENSHOT,
            Buffer.from(capture.data, 'base64'),
        )
    }
    assert.equal(
        writes().some(request => request.path.includes('dental-chart')),
        false,
        'Planning never changes the odontogram',
    )
    for (let index = 0; index < 16; index++) newPlan('Draft care ' + index)
    await click('Refresh treatment plans')
    await click('Next plans')
    await wait(panelText('Restorative care revised'))
    await select(field('Treatment plan status filter'), 'completed')
    await wait(panelText('Restorative care revised'))
    assert.equal(
        await evaluate(
            `${panel}.querySelectorAll('[aria-label^="Open treatment plan "]').length`,
        ),
        1,
    )
    for (const role of ['reviewer', 'mixed', 'wildcard']) {
        actor = role
        await reload()
        await wait(panelText('Read-only'))
        assert.equal(
            await evaluate(
                `${panel}.innerText.includes('Create treatment plan')`,
            ),
            false,
        )
    }
    actor = 'creator'
    const deniedRead = requests.length
    await reload()
    await wait(panelText('You do not have permission to view'))
    assert.equal(
        requests
            .slice(deniedRead)
            .some(request => request.path.includes('treatment-plans')),
        false,
    )
    actor = 'dentist'
    tenant = 38
    await reload()
    await wait(panelText('No treatment plans yet'))
    assert.equal(
        await evaluate(
            `${panel}.innerText.includes('Restorative care revised')`,
        ),
        false,
    )
    tenant = 37
    readFailure = 500
    await reload()
    await wait(panelText('Retry treatment plans'))
    readFailure = 0
    await click('Retry treatment plans')
    await wait(panelText('Draft care 15'))
    await click('Create treatment plan')
    await input(field('Plan title'), 'Denied plan')
    writeFailure = 403
    await click('Create draft plan')
    await wait(dialogText('Plan editing is unavailable'))
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('button[type="submit"]').disabled`,
        ),
        true,
    )
    await click('Close treatment plan form')
    await wait(`!${dialog}`)
    writeFailure = 0
    await click('Back to patient list')
    await click('View patient Pat Smith')
    await wait(
        `document.querySelector('[aria-label="Patient detail for Pat Smith"][aria-busy="false"]')`,
    )
    await click('Medical Record')
    await wait(
        panelText('Archived patients cannot receive treatment plan changes'),
    )
    assert.equal(
        await evaluate(`${panel}.innerText.includes('Create treatment plan')`),
        false,
    )
    assert.deepEqual(browserErrors, [])
    console.log(
        'Treatment planning browser workflow passed: create/edit, catalog snapshots, adult/primary surfaces, decimal totals, priority/reorder recovery, status lifecycles, cancellation, readonly access, patient/clinic boundaries and odontogram links.',
    )
}
run()
    .catch(async error => {
        console.error(error)
        console.error({
            lastCommand,
            browserExitCode: browser.exitCode,
            browserStderr,
        })
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
        // Only this independently allocated profile may be removed.
        const target = path.resolve(profile)
        if (
            path.dirname(target) === path.resolve(os.tmpdir()) &&
            path.basename(target).startsWith('treatment-plan-test-')
        ) {
            try {
                fs.rmSync(target, {
                    recursive: true,
                    force: true,
                    maxRetries: 5,
                    retryDelay: 100,
                })
            } catch {}
        }
    })
