// All backend requests are intercepted; no audit or clinic records are changed.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.AUDIT_LOGS_TEST_URL || 'http://localhost:3000'
const apiOrigin = process.env.AUDIT_LOGS_TEST_API_URL || 'http://localhost:8000'
let actor = 'admin',
    listFailure = 0,
    optionsFailure = 500,
    detailFailure = 0,
    browser,
    revokeTo
let heldActor, releaseList, heldDetail, releaseDetail
const requests = []
const makeRecord = (id, changes = {}) => ({
    id,
    actor_id: 90,
    actorName: 'Audit admin',
    action: 'updated',
    resource_type: 'patients',
    resource_id: String(id),
    occurred_at: '2026-10-18T14:30:12.123456Z',
    ip_address: '203.0.113.8',
    user_agent: '<img src=x onerror="window.__auditXss=1">',
    request_metadata: {
        method: 'PATCH',
        route: 'api/patients/{patient}',
        request_id: `mutation-${id}`,
    },
    ...changes,
})
let records = [
    makeRecord(281, {
        action: 'status_changed',
        resource_type: 'appointments',
        resource_id: '00042',
    }),
    makeRecord(280, { actor_id: 12, actorName: null }),
    makeRecord(279, {
        actor_id: null,
        actorName: null,
        request_metadata: null,
    }),
    ...Array.from({ length: 24 }, (_, index) => makeRecord(278 - index)),
]
const user = () => ({
    id: actor === 'admin' ? 90 : 91,
    name: actor === 'admin' ? 'Audit admin' : `Reader ${actor}`,
    email_verified_at: '2026-10-18',
    permissions:
        actor === 'wildcard' ? ['*', 'audit_logs.view'] : ['dashboard.view'],
    roles:
        actor === 'name-only'
            ? [{ name: 'admin', slug: 'staff' }]
            : actor === 'string-role'
            ? ['admin']
            : [{ name: 'Display label', slug: actor }],
})
const readAllowed = () => ['admin', 'auditor'].includes(actor)
const onRequest = async ({ method, url }) => {
    requests.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        url: url.href,
    })
    if (url.pathname === '/api/user')
        return actor === 'guest'
            ? { status: 401, message: 'Unauthenticated.' }
            : { data: user() }
    if (url.pathname === '/logout') {
        actor = 'guest'
        return { data: null }
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
    if (url.pathname === '/api/tasks')
        return { data: { tasks: [] }, meta: { pagination: { lastPage: 1 } } }
    if (url.pathname === '/api/appointments')
        return { data: { appointments: [] } }
    if (url.pathname.startsWith('/api/audit-logs')) {
        assert.equal(method, 'GET')
        if (!readAllowed())
            return {
                status: actor === 'guest' ? 401 : 403,
                message: 'Audit access denied.',
            }
        if (url.pathname === '/api/audit-logs/filters')
            return optionsFailure
                ? { status: optionsFailure, message: 'Options unavailable.' }
                : {
                      data: {
                          actions: ['created', 'status_changed', 'updated'],
                          resourceTypes: ['appointments', 'patients'],
                      },
                  }
        if (/^\/api\/audit-logs\/\d+$/.test(url.pathname)) {
            const id = Number(url.pathname.split('/').pop())
            const record = records.find(record => record.id === id)
            if (id === heldDetail)
                await new Promise(resolve => {
                    releaseDetail = resolve
                })
            if (detailFailure || !record)
                return {
                    status: detailFailure || 404,
                    message: 'Detail unavailable.',
                    requestId: 'failed-detail-read',
                }
            return { data: { auditLog: record }, requestId: `detail-get-${id}` }
        }
        if (url.pathname === '/api/audit-logs') {
            const filters = Object.fromEntries(url.searchParams)
            if (revokeTo) {
                actor = revokeTo
                revokeTo = undefined
                return { status: 403, message: 'Audit access revoked.' }
            }
            if (listFailure)
                return {
                    status: listFailure,
                    message: 'Audit query failed.',
                    errors:
                        listFailure === 422
                            ? { from: ['Date range is not supported.'] }
                            : {},
                    requestId: 'failed-list-read',
                }
            const filtered = records.filter(
                record =>
                    (!filters.actor_id ||
                        record.actor_id === Number(filters.actor_id)) &&
                    (!filters.actor_is_null ||
                        (filters.actor_is_null === '1'
                            ? record.actor_id === null
                            : record.actor_id !== null)) &&
                    (!filters.action || record.action === filters.action) &&
                    (!filters.resource_type ||
                        record.resource_type === filters.resource_type) &&
                    (!filters.resource_id ||
                        record.resource_id === filters.resource_id) &&
                    (!filters.request_id ||
                        record.request_metadata?.request_id ===
                            filters.request_id) &&
                    (!filters.from ||
                        Date.parse(record.occurred_at) >=
                            Date.parse(filters.from)) &&
                    (!filters.to ||
                        Date.parse(record.occurred_at) <=
                            Date.parse(filters.to)),
            )
            const page = Number(filters.page),
                perPage = Number(filters.per_page)
            const response = {
                data: {
                    auditLogs: filtered.slice(
                        (page - 1) * perPage,
                        page * perPage,
                    ),
                },
                meta: {
                    pagination: {
                        currentPage: page,
                        perPage,
                        total: filtered.length,
                        lastPage: Math.max(
                            1,
                            Math.ceil(filtered.length / perPage),
                        ),
                    },
                },
                requestId: 'list-get-123',
            }
            if (filters.actor_id && filters.actor_id === heldActor)
                await new Promise(resolve => {
                    releaseList = resolve
                })
            await new Promise(resolve => setTimeout(resolve, 150))
            return response
        }
    }
    return {
        status: 404,
        message: `Unmocked endpoint: ${method} ${url.pathname}`,
    }
}
const run = async () => {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, wait, click, select, delay } = browser
    const panel = `document.querySelector('[aria-label="Audit logs"]')`
    const dialog = `document.querySelector('[role="dialog"]')`
    const nav = `Array.from(document.querySelectorAll('nav a')).find(link => new URL(link.href).searchParams.get('tab') === 'audit_logs')`
    const text = value =>
        `${panel}?.innerText.includes(${JSON.stringify(value)})`
    const detailText = value =>
        `${dialog}?.innerText.includes(${JSON.stringify(value)})`
    const listReads = () =>
        requests.filter(item => item.path === '/api/audit-logs')
    const optionReads = () =>
        requests.filter(item => item.path === '/api/audit-logs/filters')
    const allReads = () =>
        requests.filter(item => item.path.startsWith('/api/audit-logs'))
    const fill = async (key, value) =>
        evaluate(
            `(() => { const element = document.querySelector('#audit-${key}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(
                value,
            )}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); })()`,
        )
    const reload = async (openAudit = true) => {
        await send('Page.navigate', {
            url: `${origin}/?tab=audit_logs&auditCheck=${Date.now()}`,
        })
        if (actor === 'guest') {
            await wait(`location.pathname === '/login'`)
            return
        }
        await wait(
            `document.querySelector('nav') && document.body.innerText.includes(${JSON.stringify(
                user().name,
            )})`,
        )
        if (openAudit) {
            await wait(nav)
            await evaluate(`${nav}.click()`)
            await wait(panel)
        }
    }
    await reload()
    await wait(text('Loading audit logs...'))
    await wait(text('Page 1 of 2'))
    await wait(text('Filter suggestions could not be loaded.'))
    optionsFailure = 0
    await click('Retry filter suggestions')
    await wait(
        `document.querySelector('#audit-options-action option[value="status_changed"]')`,
    )
    assert.equal(optionReads().length, 2)
    assert.ok(await evaluate(text('Deleted user #12')))
    assert.ok(await evaluate(text('System / unauthenticated')))
    assert.equal(await evaluate(text('203.0.113.8')), false)
    await click('View audit record 281')
    await wait(detailText('203.0.113.8'))
    assert.ok(await evaluate(detailText('.123456Z')))
    assert.ok(await evaluate(detailText('Mutation request ID')))
    assert.ok(await evaluate(detailText('mutation-281')))
    assert.ok(await evaluate(detailText('detail-get-281')))
    assert.equal(
        await evaluate(`${dialog}.querySelector('img') !== null`),
        false,
    )
    assert.equal(await evaluate('window.__auditXss || 0'), 0)
    await click('Close audit detail')
    await click('Show mutation history for audit 281')
    await wait(text('Page 1 of 1'))
    assert.equal(listReads().at(-1).query.request_id, 'mutation-281')
    assert.notEqual(listReads().at(-1).query.request_id, 'list-get-123')
    await click('Clear audit filters')
    await wait(text('Page 1 of 2'))
    const readsBeforeZone = listReads().length
    await select('#audit-display-timezone', 'America/Bogota')
    await wait(text('09:30:12 America/Bogota'))
    assert.equal(listReads().length, readsBeforeZone)
    await click('Next audit records')
    await wait(text('Page 2 of 2'))
    await click('Refresh audit logs')
    await wait(text('Page 1 of 2'))
    await fill('actor_id', '-1')
    await click('Apply audit filters')
    await wait(text('Enter a positive integer user ID.'))
    await fill('actor_id', '90')
    await fill('action', 'status_changed')
    await fill('resource_type', 'appointments')
    await fill('resource_id', '00042')
    await fill('from', '2026-10-18T00:00:00+05:30')
    await fill('to', '2026-10-18T23:59:59.999999+05:30')
    await click('Apply audit filters')
    await wait(text('Page 1 of 1'))
    assert.deepEqual(listReads().at(-1).query, {
        actor_id: '90',
        action: 'status_changed',
        resource_type: 'appointments',
        resource_id: '00042',
        from: '2026-10-18T00:00:00+05:30',
        to: '2026-10-18T23:59:59.999999+05:30',
        page: '1',
        per_page: '25',
    })
    assert.ok(listReads().at(-1).url.includes('%2B05%3A30'))
    assert.equal(
        optionReads().length,
        2,
        'Options do not refetch with active filters',
    )
    await select('#audit-actor_is_null', '1')
    assert.equal(
        await evaluate(`document.querySelector('#audit-actor_id').value`),
        '',
    )
    await click('Apply audit filters')
    await wait(text('No audit records match these filters.'))
    assert.equal(listReads().at(-1).query.actor_is_null, '1')
    assert.equal(listReads().at(-1).query.actor_id, undefined)
    await click('Clear audit filters')
    await wait(text('Page 1 of 2'))

    // A cancelled slow list response cannot replace the newer actor history.
    heldActor = '90'
    await fill('actor_id', '90')
    await click('Apply audit filters')
    for (let i = 0; i < 100 && !releaseList; i++) await delay(20)
    assert.ok(releaseList)
    await fill('actor_id', '12')
    await click('Apply audit filters')
    await wait(text('Deleted user #12'))
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('tbody tr').length`),
        1,
    )
    heldActor = undefined
    releaseList()
    releaseList = undefined
    await delay(300)
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('tbody tr').length`),
        1,
    )
    assert.equal(listReads().at(-1).query.actor_id, '12')
    await click('Clear audit filters')
    await wait(text('Page 1 of 2'))

    heldDetail = 281
    await click('View audit record 281')
    for (let i = 0; i < 100 && !releaseDetail; i++) await delay(20)
    assert.ok(releaseDetail)
    await click('Close audit detail')
    await click('View audit record 280')
    await wait(detailText('Deleted user #12'))
    heldDetail = undefined
    releaseDetail()
    releaseDetail = undefined
    await delay(200)
    assert.equal(await evaluate(detailText('mutation-281')), false)
    await click('Close audit detail')
    detailFailure = 404
    await click('View audit record 281')
    await wait(detailText('This audit record is no longer available.'))
    detailFailure = 0
    await click('Retry audit detail')
    await wait(detailText('mutation-281'))
    await click('Close audit detail')
    for (const status of [500, 422]) {
        listFailure = status
        await click('Refresh audit logs')
        await wait(text('failed-list-read'))
        if (status === 422)
            await wait(
                `document.querySelector('#audit-from-error').innerText.includes('Date range is not supported.')`,
            )
        assert.equal(
            await evaluate(`${panel}.querySelectorAll('tbody tr').length`),
            0,
        )
        listFailure = 0
        await click('Retry audit logs')
        await wait(text('Page 1 of 2'))
    }
    // Change to a different authorized account while detail is open.
    await click('View audit record 281')
    await wait(detailText('mutation-281'))
    records = [makeRecord(991, { actor_id: 91, actorName: 'New reader' })]
    revokeTo = 'auditor'
    await click('Refresh audit logs')
    await wait(`document.querySelector('[aria-label="Audit record 991"]')`)
    assert.equal(await evaluate(`Boolean(${dialog})`), false)
    assert.equal(await evaluate(text('mutation-281')), false)
    assert.equal(
        await evaluate(`document.querySelector('#audit-actor_id').value`),
        '',
    )
    assert.ok(
        await evaluate(`Boolean(${nav})`),
        'Auditor slug retains navigation',
    )
    records = []
    await click('Refresh audit logs')
    await wait(text('No audit records yet.'))
    records = [makeRecord(991)]
    await click('Refresh audit logs')
    await wait(text('mutation-991'))
    listFailure = 429
    const before429 = listReads().length
    await click('Refresh audit logs')
    await wait(text('Wait 30 seconds before retrying.'))
    assert.equal(
        await evaluate(
            `Array.from(${panel}.querySelectorAll('button')).find(button => button.innerText === 'Retry audit logs').disabled`,
        ),
        true,
    )
    await delay(500)
    assert.equal(
        listReads().length,
        before429 + 1,
        '429 does not automatically retry',
    )
    listFailure = 0
    await click('Logout')
    await wait(`location.pathname === '/login'`)
    assert.equal(
        await evaluate(`document.body.innerText.includes('mutation-991')`),
        false,
    )
    assert.equal(
        await evaluate(
            `JSON.stringify([localStorage, sessionStorage]).includes('mutation-991')`,
        ),
        false,
    )
    for (const mode of [
        'reviewer',
        'wildcard',
        'name-only',
        'string-role',
        'guest',
    ]) {
        actor = mode
        const before = allReads().length
        await reload(false)
        await delay(250)
        assert.equal(await evaluate(`Boolean(${nav})`), false, mode)
        assert.equal(await evaluate(`Boolean(${panel})`), false, mode)
        assert.equal(allReads().length, before, mode)
    }
    actor = 'auditor'
    await reload()
    await wait(text('mutation-991'))
    revokeTo = 'reviewer'
    await click('Refresh audit logs')
    await wait(`!(${nav})`)
    await wait(`!(${panel})`)
    assert.equal(
        await evaluate(`document.body.innerText.includes('mutation-991')`),
        false,
    )
    assert.ok(allReads().every(item => item.method === 'GET'))
    assert.ok(
        browser.cancelledRequests.size >= 2,
        'Obsolete list and detail HTTP requests are actually cancelled',
    )
    assert.deepEqual(browser.errors, [])
    console.log(
        'Audit browser checks passed: documented endpoints, admin/auditor slugs, filters/options/details, precision/offsets, cancellation races, 422/429/errors, account changes/logout and revoked access.',
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
