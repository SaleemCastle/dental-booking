const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { metadata } = require('./dental-chart-fixtures.cjs')
const compile = (file, dependencies = {}) => {
    const code = ts.transpileModule(
        fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
        {
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
const workflow = compile('lib/treatment-plans.ts')
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
const item = (id, status = 'proposed', sequence = id) => ({
    id,
    treatment_plan_id: 8,
    treatment_id: 31,
    treatment_name: 'Captured filling',
    dentist_id: 21,
    tooth_context: null,
    catalog_price: '125.50',
    estimated_price: '125.50',
    sequence,
    priority: 'normal',
    status,
    notes: null,
})
const plan = {
    id: 8,
    patient_id: 4,
    title: 'Restorative care',
    status: 'draft',
    notes: null,
    items: [],
}
for (const [roles, grants, view, write] of [
    [['admin'], [], true, true],
    [['dentist'], [], true, true],
    [['dentist', 'receptionist'], [], true, false],
    [['admin', 'receptionist'], [], true, true],
    [['reviewer'], ['treatment_plans.view'], true, false],
    [['receptionist'], ['*'], true, false],
    [['receptionist'], ['treatment_plans.*'], true, false],
    [
        ['reviewer'],
        ['treatment_plans.create', 'treatment_plans.update'],
        false,
        false,
    ],
    [['reviewer'], ['dental_charts.view'], false, false],
])
    assert.deepEqual(
        permissions.getTreatmentPlanPermissions({
            current_tenant_id: 37,
            roles: roles.map(slug => ({ slug })),
            permissions: grants,
        }),
        { canView: view, canWrite: write },
    )
assert.deepEqual(permissions.getTreatmentPlanPermissions(null), {
    canView: false,
    canWrite: false,
})
assert.equal(
    permissions.getTreatmentPlanPermissions({
        current_tenant_id: 37,
        roles: [{ name: 'admin' }],
        is_super_admin: true,
    }).canWrite,
    false,
)
for (const [value, result] of [
    ['0', 0],
    ['0.00', 0],
    ['0.1', 10],
    ['125.50', 12550],
    ['99999999.99', 9999999999],
    ['100000000', null],
    ['-1', null],
    ['1e2', null],
    ['1.001', null],
    ['NaN', null],
    ['', null],
])
    assert.equal(workflow.priceInCents(value), result)
assert.equal(
    workflow.planTotalCents([
        { ...item(1), estimated_price: '0.10' },
        { ...item(2), estimated_price: '0.20' },
        item(3, 'cancelled'),
    ]),
    30,
)
assert.equal(workflow.formatPlanAmount(30), '0.30')
assert.deepEqual(workflow.availablePlanTransitions(plan), ['cancelled'])
assert.deepEqual(
    workflow.availablePlanTransitions({ ...plan, items: [item(1)] }),
    ['active', 'cancelled'],
)
assert.deepEqual(
    workflow.availablePlanTransitions({
        ...plan,
        status: 'active',
        items: [item(1, 'completed'), item(2, 'cancelled')],
    }),
    ['completed', 'cancelled'],
)
assert.deepEqual(
    workflow.availablePlanTransitions({
        ...plan,
        status: 'active',
        items: [item(1), item(2, 'completed')],
    }),
    ['cancelled'],
)
assert.deepEqual(
    workflow.availablePlanTransitions({ ...plan, status: 'completed' }),
    [],
)
assert.deepEqual(workflow.availableItemTransitions(plan, item(1)), [
    'cancelled',
])
assert.deepEqual(
    workflow.availableItemTransitions({ ...plan, status: 'active' }, item(1)),
    ['in_progress', 'completed', 'cancelled'],
)
assert.deepEqual(
    workflow.availableItemTransitions(
        { ...plan, status: 'active' },
        item(1, 'in_progress'),
    ),
    ['completed', 'cancelled'],
)
for (const status of ['completed', 'cancelled'])
    assert.deepEqual(
        workflow.availableItemTransitions(
            { ...plan, status: 'active' },
            item(1, status),
        ),
        [],
    )
assert.ok(workflow.validatePlanHeader(' ', '').title)
assert.ok(workflow.validatePlanHeader('a'.repeat(256), '').title)
assert.ok(workflow.validatePlanHeader('Plan', 'a'.repeat(10001)).notes)
const context = {
    dentition: 'adult',
    numbering_system: 'fdi',
    tooth: '16',
    surfaces: ['M', 'O'],
}
assert.equal(workflow.validatePlanningContext(context, metadata), '')
assert.equal(workflow.validatePlanningContext(null), '')
assert.notEqual(
    workflow.validatePlanningContext({ ...context, tooth: '11' }, metadata),
    '',
)
assert.notEqual(
    workflow.validatePlanningContext(
        { ...context, surfaces: ['F', 'B'] },
        metadata,
    ),
    '',
)
assert.equal(
    workflow.validatePlanningContext(
        {
            dentition: 'primary',
            numbering_system: 'fdi',
            tooth: '51',
            surfaces: ['I'],
        },
        metadata,
    ),
    '',
)
assert.equal(
    workflow.planningContextLabel(context, metadata),
    'Adult tooth 3 · M, O',
)
assert.match(workflow.planningContextLabel(context), /16 \(FDI\)/)
assert.equal(workflow.planningContextLabel(null), 'General procedure')
for (const order of [
    [item(3), item(2), item(1)],
    [item(1), item(3), item(2)],
    [item(1, 'completed', 10), item(3), item(2), item(4, 'cancelled', 20)],
]) {
    const changes = workflow.reorderedItemUpdates(order)
    assert.ok(changes)
    const saved = order.map(item => ({
        ...item,
        sequence:
            changes.find(change => change.id === item.id)?.sequence ??
            item.sequence,
    }))
    assert.deepEqual(
        workflow.sortPlanItems(saved).map(item => item.id),
        order.map(item => item.id),
    )
    assert.equal(
        changes.some(
            change =>
                order.find(item => item.id === change.id).status ===
                'completed',
        ),
        false,
    )
}
assert.equal(
    workflow.reorderedItemUpdates([item(3), item(2, 'completed', 1)]),
    null,
)

async function main() {
    let response
    const calls = []
    const service = compile('services/treatment-plans.ts', {
        '../lib/api': {
            apiClient: {
                get: async (...args) => {
                    calls.push(['GET', ...args])
                    return response
                },
                getData: async (...args) => {
                    calls.push(['GET', ...args])
                    return response
                },
                postData: async (...args) => {
                    calls.push(['POST', ...args])
                    return response
                },
                patchData: async (...args) => {
                    calls.push(['PATCH', ...args])
                    return response
                },
            },
        },
    })
    response = {
        data: [plan],
        meta: { pagination: { current_page: 2, last_page: 3 } },
    }
    assert.equal(
        (await service.getTreatmentPlans(4, { page: 2, status: 'draft' })).meta
            .lastPage,
        3,
    )
    assert.deepEqual(calls.pop(), [
        'GET',
        '/api/patients/4/treatment-plans',
        { params: { page: 2, per_page: 15, status: 'draft' } },
    ])
    response = { data: {} }
    await assert.rejects(service.getTreatmentPlans(4), /could not be read/)
    response = { treatmentPlan: plan }
    assert.deepEqual(await service.getTreatmentPlan(8), plan)
    const proposal = {
        treatment_id: 31,
        dentist_id: 21,
        estimated_price: '125.50',
        sequence: 2,
        priority: 'urgent',
        notes: null,
        tooth_context: { ...context, tenant_id: 999 },
        catalog_price: '0.01',
        treatment_name: 'Forged',
        status: 'completed',
        treatment_plan_id: 999,
    }
    await service.createTreatmentPlan(4, {
        title: 'Plan',
        notes: null,
        items: [proposal],
        patient_id: 999,
        tenant_id: 999,
        status: 'active',
    })
    const cleanItem = {
        treatment_id: 31,
        dentist_id: 21,
        estimated_price: '125.50',
        sequence: 2,
        priority: 'urgent',
        notes: null,
        tooth_context: context,
    }
    assert.deepEqual(calls.pop(), [
        'POST',
        '/api/patients/4/treatment-plans',
        { title: 'Plan', notes: null, items: [cleanItem] },
    ])
    await service.updateTreatmentPlan(8, {
        status: 'active',
        title: 'Revised',
        patient_id: 999,
        items: [],
    })
    assert.deepEqual(calls.pop(), [
        'PATCH',
        '/api/treatment-plans/8',
        { title: 'Revised', status: 'active' },
    ])
    response = { treatmentPlanItem: item(1) }
    await service.addTreatmentPlanItem(8, proposal)
    assert.deepEqual(calls.pop(), [
        'POST',
        '/api/treatment-plans/8/items',
        cleanItem,
    ])
    await service.updateTreatmentPlanItem(8, 1, {
        tooth_context: context,
        status: 'completed',
        treatment_id: 77,
        catalog_price: '0.00',
    })
    assert.deepEqual(calls.pop(), [
        'PATCH',
        '/api/treatment-plans/8/items/1',
        { status: 'completed', tooth_context: context },
    ])
    await service.updateTreatmentPlanItem(8, 1, { tooth_context: null })
    assert.deepEqual(calls.pop(), [
        'PATCH',
        '/api/treatment-plans/8/items/1',
        { tooth_context: null },
    ])
    assert.equal(workflow.priceInCents('0000000001.01'), 101)
    assert.match(
        workflow.treatmentPlanFailureMessage({
            message: 'Invalid transition.',
            errors: { status: ['Finish the open items first.'] },
        }),
        /Finish the open items first/,
    )

    // An unrelated remote title change must not be overwritten by a notes edit.
    const slots = []
    let cursor = 0,
        submitted
    const hookedReact = {
        ...React,
        useState: initial => {
            const index = cursor++
            if (!(index in slots))
                slots[index] =
                    typeof initial === 'function' ? initial() : initial
            return [
                slots[index],
                next => {
                    slots[index] =
                        typeof next === 'function' ? next(slots[index]) : next
                },
            ]
        },
        useRef: value => {
            const index = cursor++
            if (!(index in slots)) slots[index] = { current: value }
            return slots[index]
        },
    }
    const Form = compile('components/TreatmentPlanForm.tsx', {
        react: hookedReact,
        '../lib/api': { normalizeAxiosError: error => error },
        '../lib/treatment-plans': workflow,
        './InputError': { __esModule: true, default: () => null },
        './AppointmentDialog': { __esModule: true, default: () => null },
    }).default
    const render = current => {
        cursor = 0
        return Form({
            plan: current,
            canWrite: true,
            onSave: async payload => {
                submitted = payload
            },
            onClose() {},
            onDenied() {},
        }).props.children
    }
    const find = (node, name) =>
        !node || typeof node !== 'object'
            ? undefined
            : node.props?.name === name
            ? node
            : React.Children.toArray(node.props?.children)
                  .map(child => find(child, name))
                  .find(Boolean)
    find(render(plan), 'notes').props.onChange({
        target: { value: 'Local note change' },
    })
    await render({ ...plan, title: 'Another clinician title' }).props.onSubmit({
        preventDefault() {},
    })
    assert.deepEqual(submitted, { notes: 'Local note change' })

    let reader = {
            current_tenant_id: 37,
            roles: [{ slug: 'reviewer' }],
            permissions: ['treatment_plans.view'],
        },
        denied = false,
        reads = 0
    const Panel = compile('components/PatientTreatmentPlans.tsx', {
        swr: {
            __esModule: true,
            default: () =>
                reads++ % 3 === 0
                    ? {
                          data: {
                              plans: [
                                  {
                                      ...plan,
                                      title: 'Visible plan snapshot',
                                      items: [item(1)],
                                  },
                              ],
                              meta: { lastPage: 1 },
                          },
                          error: denied ? { statusCode: 403 } : undefined,
                      }
                    : {},
        },
        '../context/AuthSessionContext': {
            useAuthSession: () => ({ user: reader, status: 'authenticated' }),
        },
        '../lib/api': { normalizeAxiosError: error => error },
        '../lib/permissions': permissions,
        '../lib/treatment-plans': workflow,
        '../services/dental-charts': {},
        '../services/treatment-plans': service,
        './PatientRowDetails': {
            isArchivedPatient: patient => patient.archived,
        },
        './TreatmentPlanForm': { __esModule: true, default: () => null },
        './TreatmentPlanItemForm': { __esModule: true, default: () => null },
        './TreatmentPlanOrderForm': { __esModule: true, default: () => null },
        './AppointmentDialog': { __esModule: true, default: () => null },
    }).default
    const panelMarkup = () =>
        renderToStaticMarkup(
            React.createElement(Panel, {
                patient: { id: 4 },
                onViewTooth() {},
            }),
        )
    assert.match(panelMarkup(), /Visible plan snapshot/)
    assert.doesNotMatch(panelMarkup(), /Create treatment plan/)
    denied = true
    assert.doesNotMatch(panelMarkup(), /Visible plan snapshot/)
    assert.match(panelMarkup(), /unavailable for this patient or clinic access/)
    console.log(
        'Treatment plans: clinical roles, decimal totals, workflows, context validation, fixed-history ordering, partial payloads and typed API contract passed.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
