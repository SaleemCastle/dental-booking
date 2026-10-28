// Mock all API traffic; these checks never read or mutate live clinic records.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.REPORTING_TEST_URL || 'http://localhost:3019'
const apiOrigin = process.env.REPORTING_TEST_API_URL || 'http://localhost:8000'
const statuses = [
    'scheduled',
    'checked_in',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
]
const counts = amount =>
    Object.fromEntries(statuses.map(status => [status, amount]))
let role = 'custom',
    tenant = 37,
    grants = [
        'appointments.view',
        'treatments.view',
        'invoices.view',
        'payments.view',
        'provider_availabilities.view',
    ]
let failure = 0,
    empty = false,
    delayed = false,
    browser
const requests = []
const onRequest = async ({ method, url, headers }) => {
    requests.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers,
    })
    if (url.pathname === '/api/user')
        return {
            data: {
                id: 90,
                name: 'Report user',
                current_tenant_id: tenant,
                email_verified_at: '2026-01-01',
                roles: [{ slug: role }],
                permissions: grants,
            },
        }
    if (url.pathname === '/api/tenants')
        return {
            data: {
                tenants: [
                    {
                        id: tenant,
                        name: `Clinic ${tenant}`,
                        slug: 'default-clinic',
                        active: true,
                    },
                ],
            },
        }
    if (!url.pathname.startsWith('/api/reports/'))
        throw new Error(`Unexpected request ${method} ${url.pathname}`)
    if (failure)
        return {
            status: failure,
            message: failure === 422 ? 'Review report filters.' : 'Reporting service unavailable.',
            errors: failure === 422 ? { dentist_id: ['Provider is not in the selected clinic.'] } : {},
        }
    const selection = Object.fromEntries(url.searchParams)
    if (delayed && selection.dentist_id === '12')
        await new Promise(resolve => setTimeout(resolve, 1800))
    const meta = {
        timezone: 'UTC',
        filters: {
            date_from: selection.date_from,
            date_to: selection.date_to,
            dentist_id: selection.dentist_id
                ? Number(selection.dentist_id)
                : null,
        },
    }
    if (url.pathname.endsWith('/appointments')) {
        const amount = empty
            ? 0
            : selection.dentist_id === '12'
            ? 12
            : selection.dentist_id === '13'
            ? 13
            : 1
        return {
            data: {
                appointment_count: amount * 6,
                by_status: counts(amount),
                by_date: empty
                    ? []
                    : [
                          {
                              date: selection.date_from,
                              appointment_count: amount * 6,
                              by_status: counts(amount),
                          },
                      ],
            },
            meta,
        }
    }
    if (url.pathname.endsWith('/billing'))
        return {
            data: {
                by_currency: empty
                    ? []
                    : [
                          {
                              currency: 'EUR',
                              invoice_count: 0,
                              invoiced_total: '0.00',
                              paid_total: '0.00',
                              outstanding_balance: '0.00',
                              payment_count: 1,
                              collections_total: '3.25',
                          },
                          {
                              currency: 'USD',
                              invoice_count: 1,
                              invoiced_total: '199999999.98',
                              paid_total: '2.00',
                              outstanding_balance: '199999997.98',
                              payment_count: 1,
                              collections_total: '7.30',
                          },
                      ],
            },
            meta,
        }
    const page = Number(selection.page)
    meta.pagination = {
        currentPage: page,
        lastPage: empty ? 1 : 2,
        perPage: Number(selection.per_page),
        total: empty ? 0 : 2,
    }
    if (url.pathname.endsWith('/providers'))
        return {
            data: empty
                ? []
                : [
                      {
                          dentist_id: page === 1 ? 12 : 13,
                          appointment_count: page === 1 ? 6 : 0,
                          by_status: counts(page === 1 ? 1 : 0),
                          booked_minutes: 240,
                          completed_minutes: 60,
                          available_minutes: page === 1 ? 480 : 0,
                          occupied_minutes: page === 1 ? 120 : 0,
                          utilization_percent: page === 1 ? 25 : null,
                      },
                  ],
            meta,
        }
    return {
        data: empty
            ? []
            : [
                  {
                      treatment_id: page === 1 ? 8 : 9,
                      appointment_count: 5,
                      completed_count: 2,
                  },
              ],
        meta,
    }
}
async function run() {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, wait, click, select } = browser
    const panel = `document.querySelector('[aria-label="Reporting workspace"]')`
    const has = text => `${panel}?.innerText.includes(${JSON.stringify(text)})`
    const navigate = async () => {
        await send('Page.navigate', {
            url: `${origin}/?tab=reports&check=${Date.now()}`,
        })
        await wait(panel)
    }
    const fill = (selector, value) =>
        evaluate(
            `(() => { const e = document.querySelector(${JSON.stringify(
                selector,
            )}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(
                value,
            )}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`,
        )
    await navigate()
    await wait(has('Total appointments'))
    assert.equal(
        await evaluate(`${panel}.querySelector('table tbody td').textContent`),
        '6',
    )
    await fill('[name=date_from]', '2026-10-01')
    await fill('[name=date_to]', '2026-10-31')
    await click('Apply filters')
    await wait(has('2026-10-01 – 2026-10-31'))
    await wait(has('Total appointments'))
    const requestCount = requests.length
    await fill('[name=date_to]', '2028-01-01')
    await click('Apply filters')
    await wait(has('Choose at most 366'))
    assert.equal(requests.length, requestCount)
    assert.equal(await evaluate('document.activeElement.name'), 'date_to')
    await fill('[name=date_to]', '2026-10-31')
    await fill('[name=dentist_id]', '12')
    delayed = true
    await click('Apply filters')
    await wait(has('Loading appointments report'))
    await fill('[name=dentist_id]', '13')
    await click('Apply filters')
    await wait(has('Provider #13'))
    await wait(has('Total appointments'))
    assert.equal(
        await evaluate(`${panel}.querySelector('table tbody td').textContent`),
        '78',
    )
    await browser.delay(1900)
    assert.equal(
        await evaluate(`${panel}.querySelector('table tbody td').textContent`),
        '78',
    )
    delayed = false
    await fill('[name=dentist_id]', '')
    await click('Apply filters')
    await wait(has('Total appointments'))
    await click('Provider activity')
    await wait(has('25.00%'))
    await click('Next page')
    await wait(has('Page 2 of 2'))
    await wait(has('Unavailable'))
    await click('Treatments / procedures')
    await wait(has('Treatment #8'))
    await click('Next page')
    await wait(has('Treatment #9'))
    await select('[aria-label="Rows per page"]', '50')
    await wait(has('Page 1 of 2'))
    await click('Billing / collections')
    await wait(has('USD 199,999,999.98'))
    await wait(has('EUR 3.25'))
    await wait(has('USD 7.30'))
    const financialRequests = requests.filter(request =>
        request.path.endsWith('/billing'),
    )
    assert.ok(
        financialRequests.every(request => request.query.page === undefined),
    )
    await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    })
    assert.ok(
        await evaluate(
            'document.documentElement.scrollWidth <= window.innerWidth',
        ),
        'Financial cards must fit mobile viewport',
    )
    await click('Provider activity')
    await wait(has('25.00%'))
    assert.ok(
        await evaluate(
            'document.documentElement.scrollWidth <= window.innerWidth',
        ),
        'Provider table must scroll within its region',
    )
    assert.equal(
        await evaluate(`${panel}.querySelector('[role=region]').tabIndex`),
        0,
    )
    failure = 500
    await click('Refresh report')
    await wait(has('Reporting service unavailable.'))
    assert.equal(
        await evaluate(`${panel}.querySelector('table') === null`),
        true,
    )
    failure = 0
    await click('Retry report')
    await wait(has('25.00%'))
    failure = 422
    await click('Refresh report')
    await wait(has('Provider is not in the selected clinic.'))
    failure = 0
    empty = true
    await click('Appointments')
    await wait(has('No appointments in this period'))
    await click('Treatments / procedures')
    await wait(has('No treatment activity'))
    await click('Provider activity')
    await wait(has('No providers match'))
    await click('Billing / collections')
    await wait(has('No issued invoices or settled collections'))
    empty = false
    // A source permission is removed; financial and capacity values must vanish.
    grants = ['appointments.view', 'treatments.view']
    tenant = 38
    let start = requests.length
    await navigate()
    await wait(has('Total appointments'))
    assert.equal(await evaluate(has('Billing / collections')), false)
    await click('Provider activity')
    await wait(has('Provider #12'))
    assert.equal(
        await evaluate(
            `${panel}.querySelector('table').innerText.includes('Utilization')`,
        ),
        false,
    )
    assert.ok(
        !requests
            .slice(start)
            .some(request => request.path.endsWith('/billing')),
    )
    for (const request of requests.filter(request =>
        request.path.startsWith('/api/reports/'),
    )) {
        assert.ok(
            ['37', '38'].includes(
                String(
                    request.headers['X-Tenant-Id'] ??
                        request.headers['x-tenant-id'],
                ),
            ),
        )
        assert.equal(request.method, 'GET')
    }
    for (const billingRole of ['billing', 'auditor']) {
        role = billingRole
        grants = []
        start = requests.length
        await navigate()
        await wait(has('USD 7.30'))
        assert.equal(await evaluate(has('Provider activity')), false)
        assert.ok(
            requests
                .slice(start)
                .filter(request => request.path.startsWith('/api/reports/'))
                .every(request => request.path.endsWith('/billing')),
        )
    }
    role = 'custom'
    grants = ['appointments.view']
    await navigate()
    await wait(has('Total appointments'))
    failure = 403
    await click('Refresh report')
    await wait(has('Access to this report was denied.'))
    assert.equal(
        await evaluate(`${panel}.querySelector('table') === null`),
        true,
    )
    assert.deepEqual(browser.errors, [])
    console.log(
        'Reporting browser checks passed: filters, cancellation, permissions, pagination, financial decimals, states and mobile layout.',
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
