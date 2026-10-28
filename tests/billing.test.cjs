const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const compile = (file, dependencies = {}) => {
    const code = ts.transpileModule(
        fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
        {
            fileName: file,
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                jsx: ts.JsxEmit.React,
                esModuleInterop: true,
            },
        },
    ).outputText
    const module = { exports: {} }
    new Function('module', 'exports', 'require', code)(
        module,
        module.exports,
        key => (key in dependencies ? dependencies[key] : require(key)),
    )
    return module.exports
}
const money = compile('lib/billing.ts')
const paymentLinks = compile('lib/payment-links.ts')
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
const invoice = {
    id: 1,
    patient_id: 4,
    status: 'issued',
    amount_due: '0.30',
    amount_paid: '0.10',
    balance: '0.20',
    currency: 'USD',
}
const payment = {
    invoice_id: 1,
    amount: '0.20',
    currency: 'USD',
    payment_method: 'card',
    idempotency_key: 'Receipt:Case-1',
    reference: 'TX-2026.01',
    receipt_number: 'R/001',
}
for (const value of [
    '-1',
    '1e2',
    'NaN',
    '.1',
    '1.',
    '1.001',
    ' 1',
    '100000000.00',
    'Infinity',
])
    assert.equal(money.moneyMinor(value), null, value)
assert.equal(money.moneyMinor('99999999.99'), 9999999999)
assert.equal(
    money.decimalMoney(money.moneyMinor('0.10') + money.moneyMinor('0.20')),
    '0.30',
)
assert.equal(money.moneyMinor('0'), 0)
assert.deepEqual(money.validatePayment(payment, invoice), {})
for (const change of [
    { amount: '0' },
    { amount: '0.21' },
    { amount: '2e-1' },
    { currency: 'EUR' },
    { idempotency_key: 'bad key' },
    { paid_at: '2999-01-01' },
    { payment_method: 'gateway' },
    { reference: 'invalid\npayload' },
    { receipt_number: 'a'.repeat(256) },
])
    assert.ok(
        Object.keys(money.validatePayment({ ...payment, ...change }, invoice))
            .length,
        JSON.stringify(change),
    )
for (const status of ['draft', 'paid', 'void'])
    assert.equal(money.canSettleInvoice({ ...invoice, status }), false)
assert.equal(
    money.canSettleInvoice({ ...invoice, status: 'partially_paid' }),
    true,
)
assert.equal(money.canVoidInvoice(invoice), false)
assert.equal(money.canVoidInvoice({ ...invoice, amount_paid: '0.00' }), true)
for (const role of ['admin', 'billing', 'auditor', 'dentist', 'receptionist']) {
    const user = {
        current_tenant_id: 37,
        roles: [{ slug: role }],
        permissions: [],
    }
    const access = permissions.getBillingPermissions(user)
    assert.equal(
        access.canViewInvoices,
        ['admin', 'billing', 'auditor'].includes(role),
    )
    assert.equal(
        access.canViewPayments,
        ['admin', 'billing', 'auditor'].includes(role),
    )
    assert.equal(access.canCreateInvoice, ['admin', 'billing'].includes(role))
    assert.equal(access.canRecordPayment, ['admin', 'billing'].includes(role))
    assert.equal(
        access.canViewPaymentLinks,
        ['admin', 'billing', 'auditor'].includes(role),
    )
    for (const action of ['Create', 'Cancel', 'Refresh'])
        assert.equal(
            access[`can${action}PaymentLink`],
            ['admin', 'billing'].includes(role),
        )
    assert.equal(
        permissions.canAccessModuleId(user, 'payment_information'),
        ['admin', 'billing', 'auditor'].includes(role),
    )
}
assert.equal(
    permissions.getBillingPermissions({
        current_tenant_id: 37,
        roles: [{ name: 'admin' }],
        permissions: [],
    }).canRecordPayment,
    false,
)
assert.equal(
    permissions.getBillingPermissions({ id: 1, isSuperAdmin: true })
        .canViewInvoices,
    false,
)
for (const grant of ['*', '*.create', 'payments.*', 'payments.create']) {
    const user = { current_tenant_id: 37, roles: [], permissions: [grant] }
    assert.equal(permissions.getBillingPermissions(user).canRecordPayment, true)
    assert.equal(
        permissions.canAccessModuleId(user, 'payment_information'),
        true,
    )
}
const writer = permissions.getBillingPermissions({
    permissions: ['payments.create'],
})
assert.equal(writer.canUpdateInvoice, false)
assert.equal(writer.canRecordPayment, true)
assert.ok(
    !Object.values(
        permissions.getBillingPermissions({
            permissions: [
                'invoices.delete',
                'payments.update',
                'payments.delete',
            ],
        }),
    ).some(Boolean),
)
const requests = []
let reply
const service = compile('services/billing.ts', {
    '../lib/billing': money,
    '../lib/api': {
        apiRequestWithSignal: async (request, signal) => {
            requests.push({ ...request, signal })
            return typeof reply === 'function' ? reply(request) : reply
        },
    },
})
const options = { tenantId: 37, signal: new AbortController().signal }
const link = {
    id: 9,
    invoice_id: 1,
    status: 'active',
    amount: '0.20',
    currency: 'USD',
    checkout_url: 'https://checkout.example/session-9',
    expires_at: '2020-01-01T00:00:00Z',
    idempotency_key: 'Checkout:Case-1',
}
for (const status of [
    'creating',
    'active',
    'pending',
    'unknown',
    'completed',
    'expired',
    'cancelled',
    'failed',
]) {
    assert.equal(
        paymentLinks.blocksInvoicePayments({ ...link, status }),
        !['expired', 'cancelled', 'failed'].includes(status),
    )
    assert.equal(
        paymentLinks.activeCheckoutUrl({ ...link, status }),
        status === 'active' ? link.checkout_url : null,
    )
}
for (const checkout_url of [
    'javascript:alert(1)',
    'data:text/html,test',
    '//checkout.example',
    'http://checkout.example',
    'https://key:secret@checkout.example',
    'invalid',
])
    assert.equal(
        paymentLinks.activeCheckoutUrl({ ...link, checkout_url }),
        null,
    )
for (const action of ['view', 'create', 'cancel', 'refresh']) {
    for (const grant of [
        `payment_links.${action}`,
        'payment_links.*',
        `*.${action}`,
        '*',
    ]) {
        const access = permissions.getBillingPermissions({
            current_tenant_id: 37,
            roles: [],
            permissions: [grant],
        })
        const name =
            action === 'view'
                ? 'canViewPaymentLinks'
                : `can${action[0].toUpperCase() + action.slice(1)}PaymentLink`
        assert.equal(access[name], true, grant)
    }
}
assert.equal(
    permissions.getBillingPermissions({ permissions: ['payments.create'] })
        .canCreatePaymentLink,
    false,
)
const storage = new Map()
global.window = {
    sessionStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
    },
}
paymentLinks.savePaymentLinkKey(37, 1, 'Checkout:Case-1')
assert.equal(paymentLinks.readPaymentLinkKey(37, 1), 'Checkout:Case-1')
assert.equal(paymentLinks.readPaymentLinkKey(52, 1), null)
assert.equal(paymentLinks.readPaymentLinkKey(37, 2), null)
paymentLinks.savePaymentLinkKey(37, 1, null)
assert.equal(paymentLinks.readPaymentLinkKey(37, 1), null)
delete global.window
async function run() {
    reply = { data: { payment_link: link } }
    assert.deepEqual(
        await service.createPaymentLink(
            1,
            {
                idempotency_key: link.idempotency_key,
                amount: '999',
                currency: 'EUR',
                provider: 'fake',
                metadata: { card: 'forbidden' },
            },
            options,
        ),
        link,
    )
    assert.deepEqual(requests.at(-1).data, {
        idempotency_key: 'Checkout:Case-1',
    })
    assert.equal(requests.at(-1).url, '/api/invoices/1/payment-links')
    assert.deepEqual(requests.at(-1).headers, { 'X-Tenant-Id': 37 })
    assert.equal(requests.at(-1).signal, options.signal)
    await service.getPaymentLink(9, options)
    assert.equal(requests.at(-1).method, 'get')
    assert.equal(requests.at(-1).url, '/api/payment-links/9')
    for (const action of ['refresh', 'cancel']) {
        assert.deepEqual(
            await service[`${action}PaymentLink`](9, options),
            link,
        )
        assert.equal(requests.at(-1).url, `/api/payment-links/9/${action}`)
        assert.equal(requests.at(-1).method, 'post')
        assert.deepEqual(requests.at(-1).data, {})
    }
    reply = request => ({
        data: [
            {
                ...link,
                id: request.params.page,
                status: request.params.page === 2 ? 'unknown' : 'failed',
            },
        ],
        meta: {
            pagination: { current_page: request.params.page, last_page: 2 },
        },
    })
    const history = await service.getInvoicePaymentLinkHistory(1, options)
    assert.equal(history.length, 2)
    assert.ok(history.some(paymentLinks.blocksInvoicePayments))
    assert.equal(requests.at(-1).params.page, 2)
    assert.equal(requests.at(-1).params.per_page, 100)
    reply = {
        data: [{ ...link, invoice_id: 2 }],
        meta: { pagination: { last_page: 1 } },
    }
    await assert.rejects(
        service.getInvoicePaymentLinkHistory(1, options),
        /unavailable/,
    )
    reply = { data: [link], meta: {} }
    await assert.rejects(
        service.getInvoicePaymentLinkHistory(1, options),
        /pagination/,
    )
    reply = {
        data: [invoice],
        meta: { pagination: { current_page: 2, last_page: 3, total: 31 } },
    }
    const page = await service.getInvoices(
        { patient_id: 4, status: 'issued', page: 2 },
        options,
    )
    assert.equal(page.meta.currentPage, 2)
    assert.equal(page.meta.lastPage, 3)
    assert.deepEqual(requests.at(-1).headers, { 'X-Tenant-Id': 37 })
    assert.equal(requests.at(-1).signal, options.signal)
    assert.deepEqual(requests.at(-1).params, {
        page: 2,
        per_page: 15,
        patient_id: 4,
        status: 'issued',
    })
    reply = { data: { invoice } }
    await service.createInvoice(
        {
            patient_id: 4,
            invoice_number: 'INV-1',
            currency: 'USD',
            amount_due: '999',
            status: 'paid',
            items: [
                {
                    treatment_id: 3,
                    quantity: 2,
                    description: 'override',
                    unit_price: '0.01',
                },
                {
                    treatment_plan_item_id: 12,
                    quantity: 1,
                    description: 'override',
                    unit_price: '0.01',
                },
                {
                    description: 'Custom service',
                    unit_price: '10.25',
                    quantity: 1,
                    metadata: { card: 'forbidden' },
                },
            ],
        },
        options,
    )
    assert.deepEqual(requests.at(-1).data, {
        patient_id: 4,
        invoice_number: 'INV-1',
        currency: 'USD',
        items: [
            { treatment_id: 3, quantity: 2 },
            { treatment_plan_item_id: 12, quantity: 1 },
            { description: 'Custom service', unit_price: '10.25', quantity: 1 },
        ],
    })
    await service.updateInvoice(
        1,
        {
            invoice_number: 'INV-2',
            due_date: null,
            items: [],
            currency: 'EUR',
            balance: '0',
        },
        options,
    )
    assert.deepEqual(requests.at(-1).data, {
        invoice_number: 'INV-2',
        due_date: null,
    })
    await service.updateInvoice(
        1,
        { status: 'void', void_reason: 'Duplicate', invoice_number: 'ignored' },
        options,
    )
    assert.deepEqual(requests.at(-1).data, {
        status: 'void',
        void_reason: 'Duplicate',
    })
    reply = { data: { payment: { id: 8, ...payment } } }
    await service.recordPayment(
        { ...payment, status: 'paid', metadata: {}, card_number: 'forbidden' },
        options,
    )
    assert.deepEqual(requests.at(-1).data, payment)
    assert.equal(requests.at(-1).url, '/api/payments')
    assert.equal((await service.recordPayment(payment, options)).id, 8)
    assert.deepEqual(requests.at(-1).data, requests.at(-2).data)
    reply = request => ({
        data:
            request.params.page === 1
                ? [
                      invoice,
                      { ...invoice, status: 'draft', balance: '999.00' },
                      { ...invoice, status: 'void', balance: '999.00' },
                  ]
                : [
                      { ...invoice, currency: 'EUR', balance: '5.00' },
                      { ...invoice, balance: '0.10' },
                  ],
        meta: {
            pagination: { current_page: request.params.page, last_page: 2 },
        },
    })
    assert.deepEqual(await service.getPatientBillingBalances(4, options), {
        USD: 30,
        EUR: 500,
    })
    reply = request => {
        if (request.params.page === 2) throw new Error('read failed')
        return { data: [invoice], meta: { pagination: { last_page: 2 } } }
    }
    await assert.rejects(
        service.getPatientBillingBalances(4, options),
        /read failed/,
    )
    reply = {
        data: [{ ...invoice, patient_id: 5 }],
        meta: { pagination: { last_page: 1 } },
    }
    await assert.rejects(
        service.getPatientBillingBalances(4, options),
        /unavailable/,
    )
    reply = { data: { invoices: [] }, meta: {} }
    await assert.rejects(service.getInvoices({}, options), /could not be read/)
    reply = { data: [invoice], meta: {} }
    await assert.rejects(
        service.getPatientBillingBalances(4, options),
        /pagination could not be read/,
    )
    const summary = {
        bookedToday: 0,
        waitingRoom: 0,
        treatmentsDone: 0,
        unpaidInvoiceAmount: null,
        collectionRate: null,
        billingTotals: [
            { currency: 'COP', unpaidInvoiceAmount: 10000, collectionRate: 0 },
            { currency: 'USD', unpaidInvoiceAmount: 75, collectionRate: 25 },
        ],
        todayAppointments: [],
        staffWorklist: [],
    }
    const dashboard = compile('services/dashboard.ts', {
        '../lib/api': { apiClient: { getData: async () => ({ ...summary }) } },
    })
    const multiCurrency = await dashboard.getDashboardSummary()
    assert.equal(multiCurrency.metrics[3].value, 'By currency')
    assert.deepEqual(multiCurrency.metrics[3].currencyValues, [
        { currency: 'COP', value: '10,000.00' },
        { currency: 'USD', value: '75.00' },
    ])
    assert.equal(multiCurrency.metrics[3].detail, 'Open balance by currency')
    assert.deepEqual(multiCurrency.billingTotals, summary.billingTotals)
    assert.equal(
        (await dashboard.getDashboardSummary(false)).billingTotals,
        null,
    )
    const restricted = await dashboard.getDashboardSummary(false)
    assert.equal(restricted.metrics[3].value, 'Restricted')
    assert.equal(restricted.metrics[3].detail, 'Invoice read access required')
    assert.equal(restricted.metrics[3].currencyValues, undefined)
    summary.billingTotals = [
        { currency: 'USD', unpaidInvoiceAmount: 0, collectionRate: 100 },
    ]
    summary.unpaidInvoiceAmount = 0
    const singleCurrency = await dashboard.getDashboardSummary()
    assert.equal(singleCurrency.metrics[3].value, 'USD 0.00')
    assert.deepEqual(singleCurrency.metrics[3].currencyValues, [
        { currency: 'USD', value: '0.00' },
    ])
    summary.billingTotals = []
    const emptyBilling = await dashboard.getDashboardSummary()
    assert.equal(emptyBilling.metrics[3].value, '0.00')
    assert.equal(emptyBilling.metrics[3].detail, 'No issued invoices')
    summary.billingTotals = null
    summary.unpaidInvoiceAmount = null
    assert.equal(
        (await dashboard.getDashboardSummary()).metrics[3].value,
        'Restricted',
    )
    console.log(
        'Billing tests passed: money boundaries, lifecycle guards, clinic permissions, safe payloads, pagination, complete currency balances and dashboard null handling.',
    )
}
run().catch(error => {
    console.error(error)
    process.exitCode = 1
})
