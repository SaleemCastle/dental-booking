// Every API request is stubbed; these checks never contact a payment provider.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.BILLING_TEST_URL || 'http://localhost:3017'
const apiOrigin = process.env.BILLING_TEST_API_URL || 'http://localhost:8000'
let browser,
    actor = 'billing',
    grants = [],
    tenant = 37,
    createTimeout = true,
    nextStatus = 'pending',
    historyFailure = false
let cancellationSupported = false
const requests = [],
    payments = []
const invoice = {
    id: 1,
    patient_id: 4,
    invoice_number: 'ONLINE-001',
    appointment_id: null,
    currency: 'USD',
    status: 'partially_paid',
    amount_due: '0.30',
    amount_paid: '0.10',
    balance: '0.20',
    due_date: null,
    items: [],
    created_at: '2026-10-26T12:00:00Z',
}
const makeLink = (id, changes = {}) => ({
    id,
    invoice_id: 1,
    provider: 'handypay',
    status: 'failed',
    amount: '0.20',
    currency: 'USD',
    external_reference: `session-${id}`,
    checkout_url: null,
    expires_at: null,
    idempotency_key: `old-${id}`,
    created_at: '2026-10-26T12:00:00Z',
    updated_at: '2026-10-26T12:00:00Z',
    ...changes,
})
const links = Array.from({ length: 6 }, (_, index) => makeLink(index + 1))
const apiError = (status, code) => ({
    status,
    bodyBase64: Buffer.from(
        JSON.stringify({
            success: false,
            statusCode: status,
            code,
            message: 'Safe provider failure.',
            data: null,
            errors: {},
        }),
    ).toString('base64'),
})
const onRequest = async ({ method, url, headers, payload }) => {
    requests.push({
        method,
        path: url.pathname,
        params: Object.fromEntries(url.searchParams),
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
                roles: actor ? [{ slug: actor }] : [],
                permissions: grants,
            },
        }
    if (url.pathname === '/api/tenants')
        return {
            data: {
                tenants: [
                    {
                        id: tenant,
                        name: 'Test clinic',
                        slug: 'test',
                        active: true,
                    },
                ],
            },
        }
    if (url.pathname === '/api/invoices')
        return {
            data: [invoice],
            meta: { pagination: { current_page: 1, last_page: 1 } },
        }
    if (url.pathname === '/api/invoices/1') return { data: { invoice } }
    if (url.pathname === '/api/payments')
        return {
            data: payments,
            meta: { pagination: { current_page: 1, last_page: 1 } },
        }
    if (url.pathname === '/api/invoices/1/payment-links') {
        if (method === 'GET') {
            if (historyFailure) return apiError(503, 'UNAVAILABLE')
            const page = Number(url.searchParams.get('page') || 1)
            const records = [...links].reverse()
            return {
                data: records.slice((page - 1) * 2, page * 2),
                meta: {
                    pagination: {
                        current_page: page,
                        last_page: Math.ceil(records.length / 2) || 1,
                    },
                },
            }
        }
        assert.deepEqual(Object.keys(payload), ['idempotency_key'])
        const existing = links.find(
            link => link.idempotency_key === payload.idempotency_key,
        )
        if (existing)
            return existing.status === 'unknown'
                ? apiError(409, 'PAYMENT_LINK_RECONCILIATION_REQUIRED')
                : { data: { payment_link: existing } }
        await new Promise(resolve => setTimeout(resolve, 250))
        const saved = makeLink(links.length + 1, {
            idempotency_key: payload.idempotency_key,
            status: createTimeout ? 'unknown' : 'active',
            checkout_url: createTimeout
                ? null
                : 'https://checkout.example/hosted',
        })
        links.push(saved)
        return createTimeout
            ? apiError(504, 'PAYMENT_PROVIDER_TIMEOUT')
            : { status: 201, data: { payment_link: saved } }
    }
    if (/^\/api\/payment-links\/\d+/.test(url.pathname)) {
        const id = Number(url.pathname.split('/')[3])
        const link = links.find(link => link.id === id)
        if (!link) return apiError(404, 'NOT_FOUND')
        if (url.pathname.endsWith('/cancel')) {
            if (!cancellationSupported)
                return apiError(409, 'PAYMENT_PROVIDER_OPERATION_UNSUPPORTED')
            link.status = 'cancelled'
            link.checkout_url = null
        }
        if (url.pathname.endsWith('/refresh')) {
            assert.deepEqual(payload, {})
            link.status = nextStatus
            if (nextStatus !== 'active') link.checkout_url = null
            if (nextStatus === 'completed') {
                invoice.amount_paid = '0.30'
                invoice.balance = '0.00'
                invoice.status = 'paid'
                if (!payments.length)
                    payments.push({
                        id: 1,
                        invoice_id: 1,
                        amount: '0.20',
                        currency: 'USD',
                        payment_method: 'card',
                        status: 'paid',
                        reference: 'TX-SANDBOX',
                        receipt_number: null,
                        paid_at: '2026-10-28T12:00:00Z',
                        created_at: '2026-10-28T12:00:00Z',
                    })
            }
        }
        return { data: { payment_link: link } }
    }
    if (url.pathname === '/api/dashboard/summary')
        return {
            data: {
                bookedToday: 0,
                waitingRoom: 0,
                treatmentsDone: 0,
                unpaidInvoiceAmount: 0,
                collectionRate: 0,
                billingTotals: [],
                todayAppointments: [],
                staffWorklist: [],
            },
        }
    throw new Error(`Unexpected API request: ${method} ${url.pathname}`)
}
async function run() {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, wait, click } = browser
    const online = 'document.querySelector(\'[aria-label="Online payments"]\')'
    const details = 'document.querySelector(\'[aria-label="Invoice details"]\')'
    const button = label =>
        `Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === ${JSON.stringify(
            label,
        )})`
    const has = text => `${online}?.innerText.includes(${JSON.stringify(text)})`
    const load = async () => {
        await send('Page.navigate', {
            url: `${origin}/?tab=payment_information&test=${Date.now()}`,
        })
        await click('View invoice ONLINE-001')
        await wait(has('Checkout attempts'))
        await wait(
            `${button('Reload link history')} && !${button(
                'Reload link history',
            )}.disabled`,
        )
    }
    const disabled = async label =>
        assert.equal(await evaluate(`${button(label)}?.disabled`), true, label)
    await load()
    await wait(`!${button('Generate payment link')}.disabled`)
    assert.ok(
        requests.some(
            request =>
                request.params.page === '3' &&
                request.params.per_page === '100',
        ),
    )
    await click('Next links')
    await wait(has('Page 2 of 2'))
    await click('Previous links')
    await evaluate(
        `${button('Generate payment link')}.click(); ${button(
            'Generate payment link',
        )}.click()`,
    )
    await wait(has('Creating checkout...'))
    await wait(has('The provider timed out.'))
    assert.equal(
        requests.filter(
            request =>
                request.method === 'POST' &&
                request.path.endsWith('/payment-links'),
        ).length,
        1,
    )
    const key = requests.find(
        request =>
            request.method === 'POST' &&
            request.path.endsWith('/payment-links'),
    ).payload.idempotency_key
    assert.match(key, /^checkout-[a-f0-9-]+$/)
    await disabled('Record payment')
    await load() // Retain an unresolved request across a page reload.
    await click('Retry same checkout request')
    await wait(has('The checkout outcome is uncertain.'))
    assert.equal(
        requests
            .filter(
                request =>
                    request.method === 'POST' &&
                    request.path.endsWith('/payment-links'),
            )
            .at(-1).payload.idempotency_key,
        key,
    )
    assert.equal(links.length, 7)
    // A signed callback could recover creation; stored-state reload shows that.
    Object.assign(links.at(-1), {
        status: 'active',
        checkout_url: 'https://checkout.example/hosted',
        expires_at: '2020-01-01T00:00:00Z',
    })
    await click('Reload link history')
    await wait(has('Active'))
    await disabled('Generate payment link') // Local expiry does not release it.
    await disabled('Record payment')
    await evaluate(
        `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedCheckout = value } } }); window.open = () => ({ opener: null, close() {}, location: { replace: value => { window.openedCheckout = value } } })`,
    )
    await click('Copy link')
    await wait(has('Payment link copied.'))
    assert.equal(
        await evaluate('window.copiedCheckout'),
        'https://checkout.example/hosted',
    )
    await click('Open checkout')
    await wait('window.openedCheckout === "https://checkout.example/hosted"')
    assert.equal(invoice.status, 'partially_paid')
    await click('Resend link')
    await wait(
        'document.querySelector("[role=dialog]")?.innerText.includes("No message has been sent.")',
    )
    const draft = await evaluate(
        'document.querySelector("[role=dialog] a").getAttribute("href")',
    )
    assert.ok(draft.startsWith('mailto:'))
    assert.ok(
        decodeURIComponent(draft).includes('https://checkout.example/hosted'),
    )
    await click('Close resend payment link')
    await click('Cancel link')
    await click('Confirm cancellation')
    await wait(has('This provider does not support cancellation.'))
    assert.equal(links.at(-1).status, 'active')
    await disabled('Generate payment link')
    await click('Refresh payment status')
    await wait(has('Pending payment'))
    assert.equal(invoice.status, 'partially_paid')
    assert.equal(payments.length, 0)
    assert.equal(await evaluate(`${button('Copy link')} === undefined`), true)
    nextStatus = 'expired'
    await click('Refresh payment status')
    await wait(has('Expired'))
    await wait(
        `!${button('Generate payment link')}.disabled && !${button(
            'Record payment',
        )}.disabled`,
    )
    createTimeout = false
    await click('Generate payment link')
    await wait(has('Active'))
    const secondKey = requests
        .filter(
            request =>
                request.method === 'POST' &&
                request.path.endsWith('/payment-links'),
        )
        .at(-1).payload.idempotency_key
    assert.notEqual(secondKey, key)
    cancellationSupported = true
    await click('Cancel link')
    await click('Confirm cancellation')
    await wait(has('Cancelled'))
    await wait(`!${button('Generate payment link')}.disabled`)
    await click('Generate payment link')
    await wait(has('Active'))
    nextStatus = 'completed'
    await click('Refresh payment status')
    await wait(has('Paid'))
    await wait(
        `${details}?.innerText.includes('TX-SANDBOX') && ${details}?.innerText.includes('USD 0.00')`,
    )
    await disabled('Generate payment link')
    assert.equal(payments.length, 1)
    await click('Refresh payment status')
    await wait(has('Payment status refreshed.'))
    assert.equal(payments.length, 1)
    // Backend webhook state appears on a normal read without a provider call.
    invoice.status = 'void'
    await load()
    await disabled('Generate payment link')
    actor = 'auditor'
    await load()
    assert.equal(
        await evaluate(
            `${button('Generate payment link')} === undefined && ${button(
                'Refresh payment status',
            )} === undefined && ${button('Cancel link')} === undefined`,
        ),
        true,
    )
    actor = ''
    grants = ['invoices.view', 'payment_links.view', 'payment_links.refresh']
    await load()
    assert.equal(
        await evaluate(
            `${button('Generate payment link')} === undefined && ${button(
                'Refresh payment status',
            )} !== undefined && ${button('Cancel link')} === undefined`,
        ),
        true,
    )
    // Failed history cannot be treated as proof that no checkout exists.
    actor = 'billing'
    grants = []
    invoice.status = 'issued'
    invoice.amount_paid = '0.00'
    invoice.balance = '0.30'
    historyFailure = true
    await load()
    await wait(has('Unable to load checkout history.'))
    await disabled('Generate payment link')
    await disabled('Record payment')
    await disabled('Void invoice')
    historyFailure = false
    // Tenant changes never reuse the other clinic's creation request key.
    tenant = 52
    links.length = 0
    await load()
    await wait(`!${button('Generate payment link')}.disabled`)
    assert.equal(
        await evaluate(
            `${button('Retry same checkout request')} === undefined`,
        ),
        true,
    )
    await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    })
    assert.equal(
        await evaluate('document.documentElement.scrollWidth <= 390'),
        true,
        JSON.stringify(
            await evaluate(
                `Array.from(document.querySelectorAll('body *')).filter(e => e.getBoundingClientRect().right > 390 && e.getBoundingClientRect().width > 0).map(e => ({ tag: e.tagName, label: e.getAttribute('aria-label'), class: e.className, width: e.getBoundingClientRect().width, right: e.getBoundingClientRect().right })).slice(0, 20)`,
            ),
        ),
    )
    for (const request of requests.filter(request =>
        /^\/api\/(invoices|payment-links|payments)/.test(request.path),
    ))
        assert.ok(
            [37, 52].includes(
                Number(
                    request.headers['X-Tenant-Id'] ??
                        request.headers['x-tenant-id'],
                ),
            ),
        )
    assert.deepEqual(browser.errors, [])
    console.log(
        'Payment-link browser tests passed: safe creation, retained retries, full history, sharing, unsupported cancellation, pending/expired/paid refresh, ledger updates, read-only and explicit grants, tenant isolation, failed reads and mobile layout.',
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
