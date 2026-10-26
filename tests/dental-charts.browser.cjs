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
const origin = process.env.DENTAL_CHART_TEST_URL || 'http://localhost:3010'
const apiOrigin =
    process.env.DENTAL_CHART_TEST_API_URL || 'http://localhost:8000'
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-chart-test-'))
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
    providerFailure = false
const requests = [],
    browserErrors = [],
    revisions = new Map()
const patient = id => ({
    id,
    firstName: id === 4 ? 'Jane' : 'Pat',
    lastName: id === 4 ? 'Doe' : 'Smith',
    appointments: '',
    notes: '',
    city: 'Bogota',
    sex: 'Female',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    archived: id === 5,
})
const key = (id, dentition) => `${tenant}-${id}-${dentition}`
const current = (id, dentition) =>
    revisions.get(key(id, dentition))?.at(-1) ?? emptyChart(id, dentition)
const addRevision = (id, payload) => {
    const saved = {
        ...payload,
        patient_id: id,
        id: requests.length,
        version: current(id, payload.dentition).version + 1,
        numbering_system: 'fdi',
        author_user_id: 90,
        recorded_at: new Date().toISOString(),
    }
    delete saved.expected_version
    revisions.set(key(id, payload.dentition), [
        ...(revisions.get(key(id, payload.dentition)) ?? []),
        structuredClone(saved),
    ])
    return saved
}
const writes = () => requests.filter(item => item.method === 'POST')
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
            const chartRoute = url.pathname.match(
                /^\/api\/patients\/(\d+)\/dental-chart(?:\/(.*))?$/,
            )
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
                            ? ['dental_charts.view']
                            : actor === 'creator'
                            ? ['dental_charts.create']
                            : []),
                    ],
                }
            else if (url.pathname === '/api/tenants')
                data = {
                    tenants: [
                        {
                            id: tenant,
                            name: `Clinic ${tenant}`,
                            slug: `clinic-${tenant}`,
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
            else if (/\/treatment-plans$/.test(url.pathname)) {
                data = []
                meta = { pagination: { lastPage: 1 } }
            } else if (url.pathname === '/api/dental-chart/metadata')
                data = metadata
            else if (url.pathname === '/api/dentists') {
                data = { dentists: [{ id: 21, name: 'Alex Rivera' }] }
                if (providerFailure) status = 500
            } else if (url.pathname === '/api/treatments')
                data = {
                    treatments: [
                        { id: 31, name: 'Filling', active: true },
                        { id: 32, name: 'Legacy crown', active: false },
                    ],
                }
            else if (url.pathname === '/api/clinical-notes') {
                data = {
                    clinicalNotes: url.searchParams.get('dentist_id')
                        ? [
                              {
                                  id: 11,
                                  patient_id: 4,
                                  dentist_id: 21,
                                  note_text: 'Initial examination',
                              },
                          ]
                        : [],
                }
                meta = { pagination: { lastPage: 1 } }
            } else if (chartRoute) {
                const id = Number(chartRoute[1]),
                    action = chartRoute[2],
                    dentition =
                        payload?.dentition ??
                        url.searchParams.get('dentition') ??
                        'adult'
                if (request.method === 'POST') {
                    await delay(150)
                    if (writeFailure) {
                        status = writeFailure
                        message =
                            status === 403
                                ? 'Clinical role required.'
                                : 'Please review this observation.'
                        if (status === 422)
                            errors = {
                                reason: ['Document a more specific reason.'],
                            }
                    } else if (
                        payload.expected_version !==
                        current(id, dentition).version
                    ) {
                        status = 409
                        message = 'The chart has changed.'
                    } else {
                        status = 201
                        data = { chart: addRevision(id, payload) }
                    }
                } else if (readFailure) {
                    status = readFailure
                    message = 'Chart unavailable.'
                } else if (action === 'history') {
                    const page = Number(url.searchParams.get('page') || 1),
                        list = [
                            ...(revisions.get(key(id, dentition)) ?? []),
                        ].reverse()
                    data = {
                        revisions: list
                            .slice((page - 1) * 10, page * 10)
                            .map(({ teeth, ...summary }) => summary),
                    }
                    meta = {
                        pagination: {
                            currentPage: page,
                            lastPage: Math.max(1, Math.ceil(list.length / 10)),
                            total: list.length,
                        },
                    }
                } else if (action?.startsWith('revisions/')) {
                    const chart = revisions
                        .get(key(id, dentition))
                        ?.find(
                            item =>
                                item.version === Number(action.split('/')[1]),
                        )
                    if (!chart) status = 404
                    else data = { chart }
                } else data = { chart: current(id, dentition) }
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
                        value: 'GET, POST, OPTIONS',
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
    const panel = `document.querySelector('[aria-label="Patient dental chart"]')`,
        dialog = `document.querySelector('[role="dialog"]')`
    const panelText = text =>
        `${panel}?.innerText.includes(${JSON.stringify(text)})`
    const dialogText = text =>
        `${dialog}?.innerText.includes(${JSON.stringify(text)})`
    const toothSelector = id => `[data-tooth="${id}"], g[class~="teeth-${id}"]`
    const toothCount = container =>
        `${container}.querySelectorAll('button[data-tooth], svg.Odontogram g[role="option"]').length`
    const selectTooth = id =>
        evaluate(
            `${dialog}.querySelector('${toothSelector(
                id,
            )}').dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
        )
    const reload = async () => {
        await send('Page.navigate', {
            url: `${origin}/?tab=patient_list&chartCheck=${Date.now()}`,
        })
        await click('View patient Jane Doe')
        await wait(
            `document.querySelector('[aria-label="Patient detail for Jane Doe"][aria-busy="false"]')`,
        )
        await click('Medical Record')
        await wait(panel)
    }
    await reload()
    await wait(panelText('No chart recorded'))
    assert.equal(await evaluate(toothCount(panel)), 32)
    assert.equal(current(4, 'adult').version, 0)
    const readsBeforeNumbering = requests.length
    await select('[aria-label="Tooth numbering"]', 'fdi')
    await wait(
        `${panel}.querySelector('g[class~="teeth-16"] title')?.textContent === '16'`,
    )
    await select('[aria-label="Tooth numbering"]', 'universal')
    assert.equal(writes().length, 0)
    assert.equal(
        requests
            .slice(readsBeforeNumbering)
            .filter(item => item.path.includes('dental-chart')).length,
        0,
    )
    await click('Record chart observation')
    await wait(
        `${dialog}?.querySelector('[aria-label="Observing provider"] option[value="21"]')`,
    )
    await selectTooth('16')
    await click('M — Mesial')
    await click('O — Occlusal')
    await select('[aria-label="Finding treatment"]', '31')
    await input('[aria-label="Finding note"]', 'Mesio-occlusal lesion')
    await click('Apply finding')
    await click('M — Mesial')
    await click('O — Occlusal')
    await click('Apply finding')
    await wait(dialogText('already recorded on this tooth'))
    await input('[aria-label="Condition code"]', 'restored')
    await click('M — Mesial')
    await click('O — Occlusal')
    await click('B — Buccal/facial')
    await click('Apply finding')
    await select('[aria-label="Observing provider"]', '21')
    await wait(
        `${dialog}.querySelector('[aria-label="Linked clinical note"] option[value="11"]')`,
    )
    await select('[aria-label="Linked clinical note"]', '11')
    await input('[aria-label="Reason for observation"]', 'Initial examination')
    // Keyboard navigation moves focus between teeth; native Enter/Space selects.
    await evaluate(`${dialog}.querySelector('${toothSelector('16')}').focus()`)
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'ArrowRight',
        code: 'ArrowRight',
    })
    assert.equal(
        await evaluate(
            `document.activeElement.getAttribute('aria-label') || document.activeElement.dataset.tooth`,
        ),
        'Tooth 4: Uncharted',
    )
    const firstWrites = writes().length
    await evaluate(
        `${dialog}.querySelector('button[type="submit"]').click(); ${dialog}.querySelector('button[type="submit"]').click()`,
    )
    await wait(`!${dialog}`)
    assert.equal(writes().length, firstWrites + 1)
    assert.equal(writes().at(-1).payload.expected_version, 0)
    assert.equal(writes().at(-1).payload.numbering_system, 'fdi')
    assert.deepEqual(writes().at(-1).payload.teeth[0].findings[0].surfaces, [
        'M',
        'O',
    ])
    assert.equal(writes().at(-1).payload.teeth[0].findings[0].treatment_id, 31)
    await wait(panelText('saved as version 1'))
    await click('View chart history')
    await click('View version 1')
    await wait(
        `document.querySelector('[aria-label="Historical chart version 1"]')?.innerText.includes('Read-only')`,
    )

    // A competing change on the same tooth requires a deliberate choice.
    await click('Record chart observation')
    await selectTooth('16')
    await click('Edit finding 1')
    await select('[aria-label="Finding status"]', 'resolved')
    await click('Update finding')
    await input('[aria-label="Reason for observation"]', 'Treatment completed')
    addRevision(4, {
        ...current(4, 'adult'),
        teeth: [
            tooth('16', [finding('fracture')]),
            tooth('26', [finding('restored', ['O'])]),
        ],
        reason: 'Another clinician observed changes',
    })
    await click('Save chart observation')
    await wait(dialogText('A newer chart exists'))
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Reason for observation"]').value`,
        ),
        'Treatment completed',
    )
    await click('Load latest for review')
    await wait(dialogText('changed in both charts'))
    assert.equal(
        await evaluate(
            `Array.from(${dialog}.querySelectorAll('button')).find(el => el.textContent === 'Use reviewed chart').disabled`,
        ),
        true,
    )
    await evaluate(
        `${dialog}.querySelector('input[name="conflict-16"]').click()`,
    )
    await click('Use reviewed chart')
    await click('Save chart observation')
    await wait(`!${dialog}`)
    assert.equal(current(4, 'adult').version, 3)
    assert.equal(writes().at(-1).payload.expected_version, 2)
    assert.equal(
        current(4, 'adult').teeth.find(item => item.tooth === '16').findings[0]
            .status,
        'resolved',
    )
    assert.ok(
        current(4, 'adult').teeth.some(item => item.tooth === '26'),
        'Remote-only changes retained',
    )

    // Both dentitions coexist; primary rendering never replaces the adult chart.
    await select('[aria-label="Chart dentition"]', 'primary')
    await wait(panelText('No chart recorded'))
    assert.equal(await evaluate(toothCount(panel)), 20)
    assert.equal(
        await evaluate(
            `${panel}.querySelectorAll('svg.Odontogram g[role="option"]').length`,
        ),
        20,
    )
    await wait(
        `${panel}.querySelector('[data-tooth="75"] title')?.textContent === 'K'`,
    )
    await wait(
        `${panel}.querySelector('[data-tooth="71"] title')?.textContent === 'O'`,
    )
    await select('[aria-label="Tooth numbering"]', 'fdi')
    await wait(
        `${panel}.querySelector('[data-tooth="55"] title')?.textContent === '55'`,
    )
    await select('[aria-label="Tooth numbering"]', 'universal')
    await click('Record chart observation')
    await selectTooth('55')
    await click('O — Occlusal')
    nextDialogAccept = false
    await selectTooth('51')
    await wait(
        `${dialog}.querySelector('[data-tooth="55"]').getAttribute('aria-selected') === 'true'`,
    )
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[data-tooth="51"]').getAttribute('aria-selected')`,
        ),
        'false',
    )
    await click('Apply finding')
    await selectTooth('51')
    await click('I — Incisal')
    await input('[aria-label="Condition code"]', 'restored')
    await click('Apply finding')
    await selectTooth('55')
    await select('[aria-label="Tooth presence status"]', 'unerupted')
    await select('[aria-label="Observing provider"]', '21')
    await input(
        '[aria-label="Reason for observation"]',
        'Primary dentition observation',
    )
    writeFailure = 422
    await click('Save chart observation')
    await wait(dialogText('Document a more specific reason'))
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Reason for observation"]').value`,
        ),
        'Primary dentition observation',
    )
    writeFailure = 0
    await click('Save chart observation')
    await wait(`!${dialog}`)
    assert.equal(current(4, 'primary').version, 1)
    assert.equal(
        current(4, 'primary').teeth.find(item => item.tooth === '55')
            .findings[0].surfaces[0],
        'O',
    )
    assert.equal(
        current(4, 'primary').teeth.find(item => item.tooth === '51')
            .findings[0].surfaces[0],
        'I',
    )
    assert.equal(current(4, 'adult').version, 3)
    await click('Record chart observation')
    await selectTooth('55')
    await select('[aria-label="Tooth presence status"]', '')
    await selectTooth('51')
    await select('[aria-label="Tooth presence status"]', '')
    await input(
        '[aria-label="Reason for observation"]',
        'Correction: observations entered on the wrong dentition',
    )
    await click('Save chart observation')
    await wait(`!${dialog}`)
    assert.equal(current(4, 'primary').version, 2)
    assert.deepEqual(current(4, 'primary').teeth, [])
    await click('View chart history')
    await click('View version 1')
    await wait(
        `document.querySelector('[aria-label="Historical chart version 1"] g[data-tooth="55"][aria-label*="unerupted"]')`,
    )
    await select('[aria-label="Chart dentition"]', 'adult')
    await wait(panelText('Version 3'))
    if (process.env.DENTAL_CHART_SCREENSHOT) {
        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
        })
        fs.writeFileSync(
            process.env.DENTAL_CHART_SCREENSHOT,
            Buffer.from(screenshot.data, 'base64'),
        )
    }
    await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    })
    await click('Record chart observation')
    await selectTooth('16')
    assert.equal(
        await evaluate(`${dialog}.scrollWidth <= ${dialog}.clientWidth + 1`),
        true,
        'The mobile editor scrolls teeth within the chart instead of overflowing the dialog',
    )
    await click('Close dental chart editor')
    await wait(`!${dialog}`)
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
    })

    for (const role of ['reviewer', 'mixed']) {
        actor = role
        await reload()
        await wait(panelText('Read-only'))
        assert.equal(
            await evaluate(
                `${panel}.innerText.includes('Record chart observation')`,
            ),
            false,
        )
        await click('View chart history')
        await click('View version 1')
        await wait(
            `document.querySelector('[aria-label="Historical chart version 1"] ${toothSelector(
                '16',
            )}')`,
        )
    }
    actor = 'creator'
    const beforeDenied = requests.length
    await reload()
    await wait(panelText('You do not have permission'))
    assert.equal(
        requests
            .slice(beforeDenied)
            .filter(item => item.path.includes('dental-chart')).length,
        0,
    )
    actor = 'dentist'
    tenant = 38
    await reload()
    await wait(panelText('No chart recorded'))
    assert.equal(
        await evaluate(`${panel}.innerText.includes('Treatment completed')`),
        false,
        'Clinic change clears clinical data',
    )
    tenant = 37
    readFailure = 500
    await reload()
    await wait(panelText('Retry dental chart'))
    readFailure = 0
    await click('Retry dental chart')
    await wait(panelText('Version 3'))
    readFailure = 403
    await click('Refresh dental chart')
    await wait(panelText('unavailable for the current patient'))
    assert.equal(
        await evaluate(toothCount(panel)),
        0,
        'Forbidden refresh hides previous chart',
    )
    readFailure = 0
    await reload()
    await wait(panelText('Version 3'))
    await click('Record chart observation')
    await input(
        '[aria-label="Reason for observation"]',
        'Observation denied by server',
    )
    writeFailure = 403
    await click('Save chart observation')
    await wait(dialogText('Clinical editing is no longer available'))
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('button[type="submit"]').disabled`,
        ),
        true,
    )
    await click('Close dental chart editor')
    await wait(`!${dialog}`)
    writeFailure = 0
    await click('Back to patient list')
    await click('View patient Pat Smith')
    await wait(
        `document.querySelector('[aria-label="Patient detail for Pat Smith"][aria-busy="false"]')`,
    )
    await click('Medical Record')
    await wait(panelText('Archived patients cannot'))
    assert.equal(
        await evaluate(
            `${panel}.innerText.includes('Record chart observation')`,
        ),
        false,
    )
    assert.deepEqual(browserErrors, [])
    console.log(
        'Dental chart browser scenarios passed: load/save, surfaces and findings, treatments/notes, keyboard, history, conflict reconciliation, mixed dentition, validation, roles, archived patients and clinic isolation.',
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
            path.basename(target).startsWith('dental-chart-test-')
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
