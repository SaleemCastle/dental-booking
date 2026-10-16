const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const compileModule = (file, requireMap = {}) => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', file),
        'utf8',
    )
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            esModuleInterop: true,
        },
    }).outputText
    const moduleRef = { exports: {} }
    new Function('exports', 'module', 'require', compiled)(
        moduleRef.exports,
        moduleRef,
        id => (id in requireMap ? requireMap[id] : require(id)),
    )
    return moduleRef.exports
}

const active = {
    id: 1,
    name: 'Cleaning',
    description: null,
    category: 'Preventive',
    duration_minutes: 30,
    price: '125.00',
    active: true,
    created_at: null,
    updated_at: null,
}
const inactive = {
    ...active,
    id: 2,
    name: 'Historical treatment',
    active: false,
}
const constants = compileModule('Constants/index.tsx')
const permissions = compileModule('lib/permissions.ts', {
    '../Constants': constants,
})
const form = compileModule('lib/treatment-form.ts')
const valid = {
    name: ' Cleaning ',
    description: ' ',
    category: ' Preventive ',
    duration_minutes: '30',
    price: '125.00',
    active: true,
}

const main = async () => {
    const requests = []
    let response = { treatments: [active, inactive] }
    let failure
    const request = async (method, ...args) => {
        requests.push([method, ...args])
        if (failure) throw failure
        return response
    }
    const services = compileModule('services/treatments.ts', {
        '../lib/api': {
            apiClient: {
                getData: (...args) => request('get', ...args),
                postData: (...args) => request('post', ...args),
                patchData: (...args) => request('patch', ...args),
                delete: (...args) => request('delete', ...args),
            },
        },
    })
    assert.deepEqual(await services.getTreatments(), [active, inactive])
    assert.deepEqual(requests.pop(), ['get', '/api/treatments', { params: {} }])
    response = [active]
    assert.deepEqual(await services.getActiveTreatments(), [active])
    assert.deepEqual(requests.pop(), [
        'get',
        '/api/treatments',
        { params: { active: 1 } },
    ])
    await services.getTreatments(false)
    assert.deepEqual(requests.pop(), [
        'get',
        '/api/treatments',
        { params: { active: 0 } },
    ])

    response = { treatment: inactive }
    assert.deepEqual(await services.getTreatment(2), inactive)
    assert.deepEqual(requests.pop(), ['get', '/api/treatments/2'])
    const payload = form.toTreatmentPayload(valid)
    response = { treatment: active }
    assert.deepEqual(await services.createTreatment(payload), active)
    assert.deepEqual(requests.pop(), ['post', '/api/treatments', payload])
    response = active
    assert.deepEqual(
        await services.updateTreatment(1, { price: '0.00' }),
        active,
    )
    assert.deepEqual(requests.pop(), [
        'patch',
        '/api/treatments/1',
        { price: '0.00' },
    ])
    await services.activateTreatment(2)
    assert.deepEqual(requests.pop(), [
        'patch',
        '/api/treatments/2',
        { active: true },
    ])
    response = { data: null, message: 'Treatment successfully deactivated.' }
    await services.deactivateTreatment(1)
    assert.deepEqual(requests.pop(), ['delete', '/api/treatments/1'])

    for (const statusCode of [401, 403, 404, 422, 500]) {
        failure = Object.assign(new Error('API error'), {
            statusCode,
            errors: statusCode === 422 ? { price: ['Invalid price.'] } : {},
        })
        await assert.rejects(
            services.createTreatment(payload),
            error => error === failure,
        )
    }
    failure = undefined

    assert.deepEqual(form.validateTreatmentForm(valid), {})
    assert.deepEqual(payload, {
        name: 'Cleaning',
        description: null,
        category: 'Preventive',
        duration_minutes: 30,
        price: '125.00',
        active: true,
    })
    assert.equal(form.getTreatmentFormValues().active, true)
    assert.equal(form.getTreatmentFormValues(inactive).active, false)
    assert.equal(form.getTreatmentFormValues(inactive).price, '125.00')
    for (const duration of ['', '0', '-1', '1.5', '1441', 'NaN']) {
        assert.ok(
            form.validateTreatmentForm({ ...valid, duration_minutes: duration })
                .duration_minutes,
        )
    }
    for (const price of [
        '',
        '-1',
        '1.001',
        '100000000',
        '1e3',
        'NaN',
        'Infinity',
    ]) {
        assert.ok(form.validateTreatmentForm({ ...valid, price }).price)
    }
    for (const price of ['0', '0.00', '12.1', '99999999.99']) {
        assert.equal(
            form.validateTreatmentForm({ ...valid, price }).price,
            undefined,
        )
    }
    for (const duration of ['1', '1440']) {
        assert.equal(
            form.validateTreatmentForm({ ...valid, duration_minutes: duration })
                .duration_minutes,
            undefined,
        )
    }
    assert.ok(form.validateTreatmentForm({ ...valid, name: '   ' }).name)
    assert.ok(
        form.validateTreatmentForm({ ...valid, name: 'a'.repeat(256) }).name,
    )
    assert.ok(
        form.validateTreatmentForm({ ...valid, category: '   ' }).category,
    )
    assert.ok(
        form.validateTreatmentForm({ ...valid, category: 'a'.repeat(101) })
            .category,
    )

    let session = { status: 'authenticated', user: { id: 3, permissions: [] } }
    let capturedKey
    let fetcher
    const cache = new Map()
    const hook = compileModule('hooks/treatments.ts', {
        swr: {
            __esModule: true,
            default: (key, fetch) => {
                capturedKey = key
                fetcher = fetch
                return {
                    data: [active, inactive],
                    error: undefined,
                    isValidating: false,
                    mutate: async () => {},
                }
            },
            useSWRConfig: () => ({
                mutate: async (key, updater) => {
                    const serialized = JSON.stringify(key)
                    cache.set(serialized, updater(cache.get(serialized)))
                },
            }),
        },
        '../context/AuthSessionContext': { useAuthSession: () => session },
        '../lib/permissions': permissions,
        '../services/treatments': { getTreatments: services.getTreatments },
    })
    let state = hook.useTreatments()
    assert.equal(capturedKey, null)
    assert.equal(state.canView, false)
    assert.equal(state.treatments, undefined)
    assert.equal(state.canCreate, false)
    session = { status: 'loading', user: { roles: ['admin'] } }
    assert.equal(hook.useTreatments().canView, false)
    assert.equal(capturedKey, null)
    session = {
        status: 'authenticated',
        user: { id: 4, permissions: ['treatments.view'] },
    }
    state = hook.useTreatments(true)
    assert.equal(state.canView, true)
    assert.equal(state.canCreate, false)
    assert.equal(state.canUpdate, false)
    assert.equal(state.canDeactivate, false)
    assert.equal(capturedKey[2], 'active')
    response = [active]
    await fetcher()
    assert.deepEqual(requests.pop(), [
        'get',
        '/api/treatments',
        { params: { active: 1 } },
    ])

    session = { status: 'authenticated', user: { id: 5, roles: ['admin'] } }
    state = hook.useTreatments()
    assert.equal(state.canCreate, true)
    assert.equal(state.canUpdate, true)
    assert.equal(state.canDeactivate, true)
    for (const filter of ['all', 'active', 'inactive']) {
        cache.set(
            JSON.stringify(['treatments', session.user, filter]),
            filter === 'all'
                ? [active, inactive]
                : filter === 'active'
                ? [active]
                : [inactive],
        )
    }
    await state.refreshLists({ ...active, active: false })
    assert.deepEqual(
        cache.get(JSON.stringify(['treatments', session.user, 'active'])),
        [],
    )
    assert.equal(
        cache.get(JSON.stringify(['treatments', session.user, 'all'])).length,
        2,
    )
    assert.equal(
        cache.get(JSON.stringify(['treatments', session.user, 'inactive']))
            .length,
        2,
    )
    await state.refreshLists(active)
    assert.deepEqual(
        cache.get(JSON.stringify(['treatments', session.user, 'active'])),
        [active],
    )
    assert.deepEqual(
        cache.get(JSON.stringify(['treatments', session.user, 'inactive'])),
        [inactive],
    )

    let uiState = { ...state, treatments: [active, inactive], isLoading: false }
    const hookMock = { useTreatments: () => uiState }
    const Selector = compileModule('components/TreatmentSelector.tsx', {
        '../hooks/treatments': hookMock,
    }).default
    const selectorMarkup = () =>
        renderToStaticMarkup(
            React.createElement(Selector, { value: null, onChange: () => {} }),
        )
    let html = selectorMarkup()
    assert.ok(html.includes('Cleaning'))
    assert.ok(!html.includes('Historical treatment'))
    uiState = { ...uiState, error: { message: 'Permission denied.' } }
    html = selectorMarkup()
    assert.match(html, /disabled=""/)
    assert.ok(html.includes('Permission denied.'))
    assert.ok(html.includes('Retry treatments'))

    const Catalog = compileModule('components/TreatmentCatalog.tsx', {
        '../hooks/treatments': hookMock,
        '../lib/api': { normalizeAxiosError: error => error },
        '../services/treatments': services,
        './TreatmentForm': { default: () => null },
    }).default
    const catalogMarkup = () =>
        renderToStaticMarkup(React.createElement(Catalog))
    uiState = { ...state, treatments: [active, inactive], canView: false }
    html = catalogMarkup()
    assert.ok(html.includes('do not have permission'))
    assert.ok(!html.includes('Cleaning'))
    uiState = {
        ...state,
        treatments: [active, inactive],
        canCreate: false,
        canUpdate: false,
        canDeactivate: false,
    }
    html = catalogMarkup()
    assert.ok(html.includes('Read only'))
    assert.ok(!html.includes('Create treatment'))
    assert.ok(!html.includes('Deactivate Cleaning'))
    uiState = { ...state, treatments: [active, inactive] }
    html = catalogMarkup()
    assert.ok(html.includes('Create treatment'))
    assert.ok(html.includes('Edit Cleaning'))
    assert.ok(html.includes('Activate Historical treatment'))
    uiState = { ...uiState, error: { message: 'Permission denied.' } }
    html = catalogMarkup()
    assert.ok(html.includes('Permission denied.'))
    assert.ok(!html.includes('Cleaning'))

    console.log(
        'Treatment API, validation, permissions, cache, and rendering tests passed.',
    )
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
