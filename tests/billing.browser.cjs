// All backend requests are intercepted. No live clinic records are modified.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.BILLING_TEST_URL || 'http://localhost:3017'
const apiOrigin = process.env.BILLING_TEST_API_URL || 'http://localhost:8000'
let actor = 'billing',
    tenant = 37,
    failure = 0,
    paymentFailure = 0,
    delayed = false,
    browser
const requests = [],
    invoices = [],
    payments = []
let nextId = 1
let dashboardTotals = [
    { currency: 'COP', unpaidInvoiceAmount: 10000, collectionRate: 0 },
    { currency: 'USD', unpaidInvoiceAmount: 75, collectionRate: 25 },
]
const patient = id => ({
    id,
    firstName: id === 4 ? 'Jane' : 'Archived',
    lastName: 'Doe',
    archived: id === 5,
    city: 'Bogota',
    appointments: '',
    notes: '',
    sex: '',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
})
const makeInvoice = changes => ({
    id: nextId++,
    tenant,
    patient_id: 4,
    appointment_id: null,
    invoice_number: `INV-${nextId}`,
    currency: 'USD',
    status: 'issued',
    amount_due: '10.00',
    amount_paid: '0.00',
    balance: '10.00',
    due_date: null,
    items: [
        {
            id: 1,
            description: 'Captured service',
            quantity: 1,
            unit_price: '10.00',
            line_total: '10.00',
        },
    ],
    created_at: '2026-10-26T12:00:00Z',
    ...changes,
})
invoices.push(
    makeInvoice({ invoice_number: 'USD-HISTORY' }),
    makeInvoice({
        invoice_number: 'EUR-HISTORY',
        currency: 'EUR',
        amount_due: '5.00',
        balance: '5.00',
    }),
    makeInvoice({
        invoice_number: 'USD-OLDER',
        balance: '0.20',
        amount_due: '0.20',
    }),
    makeInvoice({ invoice_number: 'ARCHIVED-OPEN', patient_id: 5 }),
)
const plan = {
    id: 8,
    patient_id: 4,
    title: 'Restorative care',
    status: 'active',
    items: [
        {
            id: 12,
            treatment_name: 'Plan snapshot',
            estimated_price: '7.25',
            status: 'proposed',
        },
        {
            id: 13,
            treatment_name: 'Cancelled item',
            estimated_price: '8.00',
            status: 'cancelled',
        },
    ],
}
const paginate = (records, url) => {
    const page = Number(url.searchParams.get('page') || 1)
    const size = Math.min(Number(url.searchParams.get('per_page') || 15), 2)
    return {
        data: records.slice((page - 1) * size, page * size),
        meta: {
            pagination: {
                current_page: page,
                last_page: Math.max(1, Math.ceil(records.length / size)),
                total: records.length,
            },
        },
    }
}
const cents = value => Math.round(Number(value) * 100)
const decimal = value => (value / 100).toFixed(2)
const onRequest = async ({ method, url, headers, payload }) => {
    requests.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers,
        payload,
    })
    if (url.pathname === '/api/user')
        return {
            data: {
                id: 90,
                name: 'Billing user',
                current_tenant_id: tenant,
                email_verified_at: '2026-01-01',
                roles: [{ slug: actor }],
                permissions: [
                    'dashboard.view',
                    'patients.view',
                    'treatments.view',
                    'treatment_plans.view',
                    ...(actor === 'payment_writer'
                        ? ['invoices.view', 'payments.view', 'payments.create']
                        : []),
                ],
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
    if (url.pathname === '/api/dashboard/summary')
        return {
            data: {
                bookedToday: 0,
                waitingRoom: 0,
                treatmentsDone: 0,
                unpaidInvoiceAmount:
                    dashboardTotals?.length === 1
                        ? dashboardTotals[0].unpaidInvoiceAmount
                        : dashboardTotals?.length === 0
                        ? 0
                        : null,
                collectionRate:
                    dashboardTotals?.length === 1
                        ? dashboardTotals[0].collectionRate
                        : dashboardTotals?.length === 0
                        ? 0
                        : null,
                billingTotals: dashboardTotals,
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
    if (url.pathname === '/api/treatments')
        return {
            data: {
                treatments: [
                    {
                        id: 3,
                        name: 'Catalog snapshot',
                        price: '10.10',
                        active: true,
                    },
                    {
                        id: 9,
                        name: 'Inactive catalog',
                        price: '1.00',
                        active: false,
                    },
                ],
            },
        }
    if (url.pathname === '/api/patients/4/treatment-plans')
        return {
            data: [
                plan,
                {
                    ...plan,
                    id: 9,
                    title: 'Cancelled plan',
                    status: 'cancelled',
                },
            ],
            meta: { pagination: { current_page: 1, last_page: 1 } },
        }
    if (url.pathname === '/api/treatment-plans/8')
        return { data: { treatmentPlan: plan } }
    if (/^\/api\/invoices\/\d+\/payment-links$/.test(url.pathname) && method === 'GET')
        return paginate([], url)
    if (url.pathname === '/api/invoices' && method === 'GET') {
        if (delayed) await new Promise(resolve => setTimeout(resolve, 500))
        if (failure)
            return {
                status: failure,
                message: 'Invoices temporarily unavailable.',
            }
        let rows = invoices.filter(item => item.tenant === tenant)
        if (url.searchParams.has('patient_id'))
            rows = rows.filter(
                item =>
                    item.patient_id ===
                    Number(url.searchParams.get('patient_id')),
            )
        if (url.searchParams.has('status'))
            rows = rows.filter(
                item => item.status === url.searchParams.get('status'),
            )
        return paginate([...rows].reverse(), url)
    }
    if (url.pathname === '/api/invoices' && method === 'POST') {
        const items = payload.items.map((item, index) => ({
            id: index + 1,
            quantity: item.quantity,
            description: item.treatment_id
                ? 'Catalog snapshot'
                : item.treatment_plan_item_id
                ? 'Plan snapshot'
                : item.description,
            unit_price: item.treatment_id
                ? '10.10'
                : item.treatment_plan_item_id
                ? '7.25'
                : item.unit_price,
        }))
        items.forEach(
            item =>
                (item.line_total = decimal(
                    cents(item.unit_price) * item.quantity,
                )),
        )
        const total = decimal(
            items.reduce((sum, item) => sum + cents(item.line_total), 0),
        )
        const saved = makeInvoice({
            ...payload,
            status: 'draft',
            amount_due: total,
            balance: total,
            items,
        })
        invoices.push(saved)
        return { status: 201, data: { invoice: saved } }
    }
    const match = url.pathname.match(/^\/api\/invoices\/(\d+)$/)
    if (match) {
        const invoice = invoices.find(
            item => item.id === Number(match[1]) && item.tenant === tenant,
        )
        if (!invoice) return { status: 404 }
        if (method === 'PATCH') {
            Object.assign(invoice, payload)
            if (invoice.status === 'issued' && cents(invoice.amount_due) === 0)
                invoice.status = 'paid'
            if (invoice.status === 'void') invoice.balance = '0.00'
        }
        return { data: { invoice } }
    }
    if (url.pathname === '/api/payments' && method === 'GET')
        return paginate(
            payments
                .filter(
                    item =>
                        item.tenant === tenant &&
                        (!url.searchParams.has('invoice_id') ||
                            item.invoice_id ===
                                Number(url.searchParams.get('invoice_id'))),
                )
                .slice()
                .reverse(),
            url,
        )
    if (url.pathname === '/api/payments' && method === 'POST') {
        const existing = payments.find(
            item =>
                item.invoice_id === payload.invoice_id &&
                item.idempotency_key === payload.idempotency_key &&
                item.tenant === tenant,
        )
        if (existing) return { data: { payment: existing } }
        if (paymentFailure === 422)
            return {
                status: 422,
                message: 'Payment rejected.',
                errors: { reference: ['Use the bank transaction identifier.'] },
            }
        const invoice = invoices.find(
            item => item.id === payload.invoice_id && item.tenant === tenant,
        )
        assert.ok(invoice)
        assert.ok(['issued', 'partially_paid'].includes(invoice.status))
        assert.ok(cents(payload.amount) <= cents(invoice.balance))
        invoice.amount_paid = decimal(
            cents(invoice.amount_paid) + cents(payload.amount),
        )
        invoice.balance = decimal(
            cents(invoice.amount_due) - cents(invoice.amount_paid),
        )
        invoice.status = cents(invoice.balance) ? 'partially_paid' : 'paid'
        const saved = {
            id: payments.length + 1,
            tenant,
            ...payload,
            status: 'paid',
            paid_at: payload.paid_at || '2026-10-26T14:00:00Z',
            created_at: '2026-10-26T14:00:00Z',
        }
        payments.push(saved)
        return paymentFailure === 503
            ? { status: 503, message: 'Response lost after commit.' }
            : { status: 201, data: { payment: saved } }
    }
    throw new Error(`Unexpected API request: ${method} ${url.pathname}`)
}
async function run() {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, click: clickPage, wait, select } = browser
    const click = async label => {
        const local = `Array.from(document.querySelectorAll('[role=dialog] button')).find(e => (e.textContent.trim() === ${JSON.stringify(
            label,
        )} || e.getAttribute('aria-label') === ${JSON.stringify(
            label,
        )}) && !e.disabled)`
        if (await evaluate(`Boolean(${local})`))
            await evaluate(`${local}.click()`)
        else await clickPage(label)
    }
    const panel = 'document.querySelector(\'[aria-label="Billing workspace"]\')'
    const dialog = 'document.querySelector("[role=dialog]")'
    const has = text => `${panel}?.innerText.includes(${JSON.stringify(text)})`
    const inDialog = text =>
        `${dialog}?.innerText.includes(${JSON.stringify(text)})`
    const fill = (selector, value) =>
        evaluate(
            `(() => { const e = document.querySelector(${JSON.stringify(
                selector,
            )}); Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(
                value,
            )}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`,
        )
    const openPatient = async (id = 4) => {
        await send('Page.navigate', {
            url: `${origin}/?tab=patient_list&billingCheck=${Date.now()}`,
        })
        await click(
            id === 4 ? 'View patient Jane Doe' : 'View patient Archived Doe',
        )
        await wait(
            `document.querySelector('[aria-label="Patient detail for ${
                id === 4 ? 'Jane' : 'Archived'
            } Doe"]')?.getAttribute('aria-busy') === 'false'`,
        )
        await click('Billing')
        await wait(panel)
    }
    delayed = true
    await openPatient()
    await wait(has('Loading complete balance...'))
    await wait(has('USD 10.20'))
    await wait(has('EUR 5.00'))
    delayed = false
    assert.ok(
        requests.some(
            item =>
                item.path === '/api/invoices' &&
                item.query.page === '2' &&
                item.query.per_page === '100',
        ),
    )
    await click('Create invoice')
    await fill('[name=invoice_number]', 'INV-WORKFLOW')
    await fill('[name=currency]', 'USD')
    await fill('[aria-label="Line 1 description"]', 'Custom service')
    await fill('[aria-label="Line 1 unit price"]', '0.30')
    await click('Add line')
    await wait(
        `${dialog}?.querySelector('[aria-label="Line 2 source"] option[value=catalog]:not(:disabled)')`,
    )
    await select('[aria-label="Line 2 source"]', 'catalog')
    await select('[aria-label="Line 2 treatment"]', '3')
    await fill('[aria-label="Line 2 quantity"]', '2')
    await select('[aria-label="Treatment plan"]', '8')
    await wait(
        `${dialog}?.querySelector('[aria-label="Line 1 source"] option[value=plan]:not(:disabled)')`,
    )
    await click('Add line')
    await select('[aria-label="Line 3 source"]', 'plan')
    await select('[aria-label="Line 3 treatment"]', '12')
    await wait(inDialog('Estimated total: USD 27.75'))
    assert.equal(
        await evaluate(
            `${dialog}.innerText.includes('Cancelled item') || ${dialog}.innerText.includes('Cancelled plan') || ${dialog}.innerText.includes('Inactive catalog')`,
        ),
        false,
    )
    await click('Create draft')
    await wait(has('Original total'))
    await wait(has('USD 27.75'))
    const created = invoices.at(-1)
    const createRequest = requests.find(
        item => item.method === 'POST' && item.path === '/api/invoices',
    )
    assert.deepEqual(createRequest.payload.items, [
        { quantity: 1, description: 'Custom service', unit_price: '0.30' },
        { quantity: 2, treatment_id: 3 },
        { quantity: 1, treatment_plan_item_id: 12 },
    ])
    await click('Edit draft details')
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Line 1 source"]') === null`,
        ),
        true,
    )
    await fill('[name=due_date]', '2026-12-01')
    await click('Save draft details')
    await wait(`${dialog} === null`)
    assert.deepEqual(
        requests.filter(item => item.method === 'PATCH').at(-1).payload,
        { invoice_number: 'INV-WORKFLOW', due_date: '2026-12-01' },
    )
    await click('Issue invoice')
    await click('Confirm issue')
    await wait(has('Issued'))
    await click('Record payment')
    await fill('[name=amount]', '27.76')
    await click('Record payment')
    await wait(inDialog('cannot exceed'))
    assert.equal(payments.length, 0)
    await fill('[name=amount]', '0.10')
    await fill('[name=reference]', 'BANK-001')
    await fill('[name=receipt_number]', 'RCPT-001')
    paymentFailure = 422
    await click('Record payment')
    await wait(inDialog('Use the bank transaction identifier.'))
    assert.equal(
        await evaluate(`${dialog}.querySelector('[name=amount]').value`),
        '0.10',
    )
    paymentFailure = 0
    await click('Record payment')
    await wait(`${dialog} === null`)
    await wait(has('Partially paid. USD 27.65'))
    await wait(has('RCPT-001'))
    assert.equal(
        await evaluate(
            `Array.from(${panel}.querySelectorAll('button')).some(e => e.textContent === 'Void invoice')`,
        ),
        false,
    )
    await click('Record payment')
    await fill('[name=amount]', '27.65')
    paymentFailure = 503
    await click('Record payment')
    await wait(inDialog('outcome is unconfirmed'))
    assert.equal(created.status, 'paid')
    await send('Page.bringToFront')
    await evaluate("window.dispatchEvent(new Event('focus'))")
    await click('Retry same payment')
    await wait(`${dialog} === null`)
    await wait(has('Collectible balance'))
    const retryRequests = requests
        .filter(item => item.method === 'POST' && item.path === '/api/payments')
        .slice(-2)
    assert.deepEqual(retryRequests[0].payload, retryRequests[1].payload)
    assert.equal(
        payments.filter(item => item.invoice_id === created.id).length,
        2,
    )
    assert.equal(created.balance, '0.00')
    paymentFailure = 0
    // Unpaid void requires a reason and explicit confirmation.
    await select('[aria-label="Invoice status filter"]', 'issued')
    await click('Next')
    await click('View invoice USD-HISTORY')
    await click('Void invoice')
    await click('Keep invoice')
    assert.equal(
        invoices.find(item => item.invoice_number === 'USD-HISTORY').status,
        'issued',
    )
    await click('Void invoice')
    await fill('[name=void_reason]', '   ')
    await click('Confirm void')
    await wait(inDialog('Enter a reason'))
    await fill('[name=void_reason]', 'Duplicate invoice')
    await click('Confirm void')
    await wait(`${dialog} === null`)
    await wait(has('Reason: Duplicate invoice'))
    assert.equal(
        invoices.find(item => item.invoice_number === 'USD-HISTORY').amount_due,
        '10.00',
    )
    await wait(has('USD 0.20'))
    // Browser rendering stays usable at phone width.
    await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    })
    assert.equal(
        await evaluate('document.documentElement.scrollWidth <= 390'),
        true,
    )
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
    })
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    fs.mkdirSync('.next-billing-checks', { recursive: true })
    fs.writeFileSync(
        '.next-billing-checks/billing-workspace.png',
        Buffer.from(screenshot.data, 'base64'),
    )
    // Archived patient history remains collectible, with no new invoice action.
    await openPatient(5)
    await wait(has('ARCHIVED-OPEN'))
    assert.equal(
        await evaluate(
            `Array.from(${panel}.querySelectorAll('button')).some(e => e.textContent === 'Create invoice')`,
        ),
        false,
    )
    await click('View invoice ARCHIVED-OPEN')
    await click('Record payment')
    await fill('[name=amount]', '10.00')
    await click('Record payment')
    await wait(`${dialog} === null`)
    assert.equal(
        invoices.find(item => item.invoice_number === 'ARCHIVED-OPEN').status,
        'paid',
    )
    // Auditor reads; payment-only writer can settle without invoice update.
    actor = 'auditor'
    await openPatient()
    await wait(has('Invoice history'))
    assert.equal(
        await evaluate(
            `Array.from(${panel}.querySelectorAll('button')).some(e => ['Create invoice', 'Record payment', 'Void invoice', 'Edit draft details'].includes(e.textContent))`,
        ),
        false,
    )
    actor = 'payment_writer'
    await openPatient()
    await click('View invoice USD-OLDER')
    await click('Record payment')
    await fill('[name=amount]', '0.20')
    await click('Record payment')
    await wait(`${dialog} === null`)
    // Read failures suppress balances instead of showing partial/stale money.
    actor = 'billing'
    failure = 500
    await openPatient()
    await wait(has('Unable to load the complete patient balance.'))
    await wait(has('Invoices temporarily unavailable.'))
    failure = 0
    await click('Retry balance')
    await click('Retry invoices')
    await wait(has('EUR 5.00'))
    // A new clinic gets an empty ledger and the verified tenant header.
    tenant = 52
    await openPatient()
    await wait(has('No invoices found.'))
    await wait(has('No issued balance.'))
    // The main billing entry supports patient selection and zero-total issue.
    await send('Page.navigate', { url: `${origin}/?tab=payment_information` })
    await wait(has('Invoice history'))
    await click('Create invoice')
    await wait(
        `${dialog}?.querySelector('#appointment-patient_id option[value="4"]')`,
    )
    await select('#appointment-patient_id', '4')
    await fill('[name=invoice_number]', 'ZERO-INVOICE')
    await fill('[name=currency]', 'USD')
    await fill('[aria-label="Line 1 description"]', 'Complimentary service')
    await fill('[aria-label="Line 1 unit price"]', '0.00')
    await click('Create draft')
    await wait(`${dialog} === null`)
    await click('Issue invoice')
    await wait(inDialog('zero-total invoice will be marked paid'))
    await click('Confirm issue')
    await wait(`${dialog} === null`)
    await wait(has('Paid'))
    assert.equal(invoices.at(-1).status, 'paid')
    assert.equal(
        await evaluate(
            `Array.from(${panel}.querySelectorAll('button')).some(e => ['Issue invoice', 'Void invoice', 'Record payment'].includes(e.textContent.trim()))`,
        ),
        false,
    )
    await click('Payments')
    await wait(has('No settled payments recorded.'))
    await click('Record settled payment')
    await wait(`${dialog}?.querySelector('[name=invoice_id]')`)
    await click('Cancel')
    for (const request of requests.filter(item =>
        /^\/api\/(invoices|payments)/.test(item.path),
    ))
        assert.ok(
            [37, 52].includes(
                Number(
                    request.headers['X-Tenant-Id'] ??
                        request.headers['x-tenant-id'],
                ),
            ),
        )
    // Clinical roles have no implicit billing tab or API reads.
    actor = 'dentist'
    const previousReads = requests.filter(item =>
        /^\/api\/(invoices|payments)/.test(item.path),
    ).length
    await send('Page.navigate', { url: `${origin}/?tab=patient_list` })
    await click('View patient Jane Doe')
    await wait(
        'document.querySelector(\'[aria-label="Patient detail for Jane Doe"]\')?.getAttribute("aria-busy") === "false"',
    )
    assert.equal(
        await evaluate(
            'Array.from(document.querySelectorAll("[role=tab]")).some(e => e.textContent === "Billing")',
        ),
        false,
    )
    assert.equal(
        requests.filter(item => /^\/api\/(invoices|payments)/.test(item.path))
            .length,
        previousReads,
    )
    // Dashboard renders the backend's currency breakdown when scalars are null.
    actor = 'billing'
    await send('Page.navigate', { url: `${origin}/?tab=dashboard` })
    const currencyBalances =
        'document.querySelector(\'[aria-label="Unpaid invoice balances by currency"]\')'
    const currencyRates =
        'document.querySelector(\'[aria-label="Collection rates by currency"]\')'
    await wait(`${currencyBalances}?.innerText.includes('10,000.00')`)
    await wait(`${currencyBalances}?.innerText.includes('75.00')`)
    await wait(`${currencyRates}?.innerText.includes('25% collected')`)
    assert.ok(
        await evaluate(
            `${currencyBalances}.innerText.includes('COP') && ${currencyBalances}.innerText.includes('USD')`,
        ),
    )
    assert.ok(
        !(await evaluate(
            'document.body.innerText.includes("View currency totals in billing if authorized")',
        )),
    )
    dashboardTotals = [
        { currency: 'USD', unpaidInvoiceAmount: 0, collectionRate: 100 },
    ]
    await click('Refresh dashboard')
    await wait(
        `${currencyBalances}?.innerText.includes('0.00') && !${currencyBalances}?.innerText.includes('COP')`,
    )
    await wait(`${currencyRates}?.innerText.includes('100% collected')`)
    dashboardTotals = []
    await click('Refresh dashboard')
    await wait('document.body.innerText.includes("No issued invoices")')
    assert.ok(await evaluate(`${currencyBalances} === null`))
    actor = 'dentist'
    await send('Page.navigate', { url: `${origin}/?tab=dashboard` })
    await wait(
        'document.body.innerText.includes("Invoice read access required")',
    )
    assert.ok(
        await evaluate(
            `${currencyBalances} === null && ${currencyRates} === null`,
        ),
    )
    assert.deepEqual(browser.errors, [])
    console.log(
        'Billing browser tests passed: sourced drafts, immutable edits, issue, partial/full payment, overpayment/422 handling, committed retry, receipts, confirmed void, archived settlement, permissions, all-page balances, failures, clinic isolation, mobile layout, global billing and zero-total issue.',
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
