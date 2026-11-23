const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const compile = (file, dependencies) => {
    const source = read(`src/${file}`)
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            esModuleInterop: true,
            jsx: ts.JsxEmit.React,
        },
    }).outputText
    const moduleRef = { exports: {} }
    new Function('exports', 'module', 'require', output)(
        moduleRef.exports,
        moduleRef,
        id => dependencies[id] ?? require(id),
    )
    return moduleRef.exports
}

async function run() {
    const estimateCalls = []
    const estimates = compile('services/insurance-estimates.ts', {
        '../lib/api': {
            apiClient: {
                getData: async (...args) => {
                    estimateCalls.push(['get', ...args])
                    return []
                },
                postData: async (...args) => {
                    estimateCalls.push(['post', ...args])
                    return { estimate: { id: 5 } }
                },
            },
        },
    })
    assert.deepEqual(await estimates.listTreatmentPlanEstimates(12, 34), [])
    assert.deepEqual(estimateCalls[0], [
        'get',
        '/api/patients/12/insurance-estimates',
        { params: { treatment_plan_id: 34, latest_only: true, per_page: 100 } },
    ])
    assert.deepEqual(
        await estimates.createTreatmentPlanItemEstimate(34, 56, {
            service_date: '2026-11-23',
            currency: 'COP',
            association_id: 7,
            benefit_rule_id: 8,
        }),
        { estimate: { id: 5 } },
    )
    assert.deepEqual(estimateCalls[1], [
        'post',
        '/api/treatment-plans/34/items/56/insurance-estimates',
        {
            service_date: '2026-11-23',
            currency: 'COP',
            association_id: 7,
            benefit_rule_id: 8,
        },
    ])

    const permissionSet = user => new Set(user?.permissions ?? [])
    const Coverage = compile('components/TreatmentPlanItemCoverageEstimate.tsx', {
        '../lib/api': { normalizeAxiosError: error => error },
        '../lib/permissions': { getUserPermissionSet: permissionSet },
        '../services/insurance-estimates': {
            createTreatmentPlanItemEstimate: async () => ({ estimate: {} }),
        },
        '../lib/billing': { displayMoney: (value, currency) => `${currency} ${value}` },
        './AppointmentDialog': {
            __esModule: true,
            default: () => null,
            appointmentButtonClass: 'button',
            appointmentInputClass: 'input',
            appointmentPrimaryClass: 'primary',
        },
    }).default
    const item = { id: 56, treatment_name: 'Exam', estimated_price: '100.00' }
    const denied = renderToStaticMarkup(
        React.createElement(Coverage, { user: null, planId: 34, item }),
    )
    assert.equal(denied, '')
    for (const omitted of [
        'patients.view',
        'treatment_plans.view',
        'insurance_estimates.create',
    ]) {
        const permissions = [
            'patients.view',
            'treatment_plans.view',
            'insurance_estimates.create',
        ].filter(permission => permission !== omitted)
        assert.equal(
            renderToStaticMarkup(
                React.createElement(Coverage, {
                    user: { permissions },
                    planId: 34,
                    item,
                }),
            ),
            '',
        )
    }
    const allowed = renderToStaticMarkup(
        React.createElement(Coverage, {
            user: { permissions: ['patients.view', 'treatment_plans.view', 'insurance_estimates.create'] },
            planId: 34,
            item,
        }),
    )
    assert.match(allowed, /Request provisional coverage estimate/)
    const estimateUi = read('src/components/TreatmentPlanItemCoverageEstimate.tsx')
    const invoiceUi = read('src/components/InvoiceForm.tsx')
    assert.match(estimateUi, /type="date" required/)
    assert.match(estimateUi, /pattern="\[A-Za-z\]\{3\}"/)
    assert.match(estimateUi, /No payment or receivable was recorded/)
    assert.match(estimateUi, /do not confirm payment or insurer acceptance/)
    assert.match(estimateUi, /role="alert"/)
    assert.match(estimateUi, /busy \? 'Saving\.\.\.'/)
    assert.match(invoiceUi, /No snapshot; request one from treatment planning/)
    assert.match(invoiceUi, /Coverage estimates are unavailable\./)

    const payment = read('src/lib/billing.ts')
    assert.doesNotMatch(payment, /insurance|insurer|remittance/i)
    assert.doesNotMatch(payment, /allocation|refund/i)
    const permissions = read('src/lib/permissions.ts')
    assert.doesNotMatch(permissions, /insurance_(?!estimates)/)
    assert.doesNotMatch(read('src/services/reporting.ts'), /insurance/i)

    console.log('Insurance frontend compatibility checks passed: 21 assertions.')
}

run().catch(error => {
    console.error(error)
    process.exitCode = 1
})
