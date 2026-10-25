const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
require.extensions['.css'] = module => {
    module.exports = {}
}
const {
    metadata,
    emptyChart,
    finding,
    tooth,
} = require('./dental-chart-fixtures.cjs')
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
const workflow = compile('lib/dental-charts.ts')
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
for (const [roles, grants, view, write] of [
    [[], [], false, false],
    [['admin'], [], true, true],
    [['dentist'], [], true, true],
    [['receptionist'], [], false, false],
    [['dentist', 'receptionist'], [], true, false],
    [['admin', 'dentist', 'receptionist'], [], true, true],
    [['reviewer'], ['dental_charts.view'], true, false],
    [['reviewer'], ['dental_charts.create'], false, false],
    [['receptionist'], ['*'], true, false],
    [['receptionist'], ['dental_charts.*'], true, false],
]) {
    assert.deepEqual(
        permissions.getDentalChartPermissions({
            current_tenant_id: 37,
            roles: roles.map(slug => ({ slug })),
            permissions: grants,
        }),
        { canView: view, canWrite: write },
    )
}
assert.deepEqual(permissions.getDentalChartPermissions(null), {
    canView: false,
    canWrite: false,
})
assert.equal(
    permissions.getDentalChartPermissions({
        current_tenant_id: 37,
        roles: [{ name: 'admin' }],
        is_super_admin: true,
    }).canWrite,
    false,
)

const arches = workflow.dentalArches(metadata.dentitions.adult)
assert.deepEqual(
    arches.map(arch => arch.length),
    [16, 16],
)
assert.deepEqual(
    arches[0].map(position => position.tooth),
    Array.from({ length: 16 }, (_, i) => String(i + 1)),
)
assert.deepEqual(
    arches[1].map(position => position.tooth),
    Array.from({ length: 16 }, (_, i) => String(32 - i)),
)
const primary = workflow.dentalArches(metadata.dentitions.primary)
assert.deepEqual(
    primary.map(arch => arch.length),
    [10, 10],
)
assert.equal(primary[0][0].tooth, 'A')
assert.equal(primary[1][0].tooth, 'T')
assert.equal(
    workflow.toothLabel(metadata.dentitions.adult[2], 'universal'),
    '3',
)
assert.equal(workflow.toothLabel(metadata.dentitions.adult[2], 'fdi'), '16')
assert.equal(workflow.validateDentalSnapshot([tooth()], metadata, 'adult'), '')
assert.notEqual(
    workflow.validateDentalSnapshot([tooth()], metadata, 'primary'),
    '',
)
const molar = metadata.dentitions.adult.find(position => position.fdi === '16')
const incisor = metadata.dentitions.adult.find(
    position => position.fdi === '11',
)
assert.equal(
    workflow.validateDentalFinding(finding('caries', []), incisor, []),
    '',
)
assert.notEqual(
    workflow.validateDentalFinding(finding('caries', ['O']), incisor, []),
    '',
)
assert.notEqual(
    workflow.validateDentalFinding(finding('caries', ['I']), molar, []),
    '',
)
assert.notEqual(
    workflow.validateDentalFinding(finding('caries', ['F', 'B']), molar, []),
    '',
)
assert.notEqual(
    workflow.validateDentalFinding(finding('caries', ['O', 'M']), molar, [
        finding(),
    ]),
    '',
)
assert.equal(
    workflow.validateDentalFinding(finding('restored', ['M']), molar, [
        finding(),
    ]),
    '',
)
assert.equal(
    workflow.validateDentalFinding(finding('custom_code_1', ['B']), molar, []),
    '',
)
assert.notEqual(
    workflow.validateDentalFinding(finding('Invalid-code', []), molar, []),
    '',
)
assert.notEqual(
    workflow.validateDentalFinding(
        { ...finding(), note: 'x'.repeat(1001) },
        molar,
        [],
    ),
    '',
)
assert.notEqual(
    workflow.validateDentalFinding(
        finding(),
        molar,
        Array.from({ length: 20 }, () => finding()),
    ),
    '',
)
assert.notEqual(
    workflow.validateDentalSnapshot([tooth(), tooth()], metadata, 'adult'),
    '',
)
assert.equal(workflow.describeDentalTooth(undefined), 'Uncharted')
assert.equal(workflow.replaceDentalTooth([tooth()], '16').length, 0)
assert.notEqual(
    workflow.findingColor(finding()),
    workflow.findingColor(finding('restored')),
)
assert.notEqual(
    workflow.findingColor(finding()),
    workflow.findingColor({ ...finding(), status: 'resolved' }),
)

// Competing edits, remote-only changes, removals, and disjoint changes.
const base = [tooth()]
const mine = [tooth('16', [finding('fracture')])]
const theirs = [tooth('16', [finding('restored')]), tooth('26')]
const conflict = workflow.reconcileDentalTeeth(base, mine, theirs)
assert.deepEqual(conflict.unresolved, ['16'])
assert.equal(conflict.teeth[0].tooth, '26')
const merged = workflow.reconcileDentalTeeth(base, mine, theirs, {
    16: 'local',
})
assert.deepEqual(merged.unresolved, [])
assert.equal(merged.teeth[0].findings[0].code, 'fracture')
assert.equal(merged.teeth[1].tooth, '26')
assert.deepEqual(
    workflow.reconcileDentalTeeth(base, base, theirs).teeth,
    theirs,
)
assert.deepEqual(workflow.reconcileDentalTeeth(base, [], base).teeth, [])
assert.deepEqual(workflow.reconcileDentalTeeth(base, mine, []).unresolved, [
    '16',
])
assert.deepEqual(
    workflow.reconcileDentalTeeth(base, mine, [], { 16: 'latest' }).teeth,
    [],
)
assert.deepEqual(
    base,
    [tooth()],
    'Reconciliation cannot mutate its base snapshot',
)

async function main() {
    const requests = []
    let response = { chart: emptyChart() }
    const api = compile('services/dental-charts.ts', {
        '../lib/api': {
            apiClient: {
                getData: async (...args) => {
                    requests.push(['GET', ...args])
                    return response
                },
                get: async (...args) => {
                    requests.push(['GET', ...args])
                    return response
                },
                postData: async (...args) => {
                    requests.push(['POST', ...args])
                    return response
                },
            },
        },
    })
    assert.deepEqual(await api.getDentalChart(4), emptyChart())
    assert.deepEqual(requests.pop(), [
        'GET',
        '/api/patients/4/dental-chart',
        { params: { dentition: 'adult', numbering_system: 'universal' } },
    ])
    await api.getDentalChartRevision(4, 2, {
        dentition: 'primary',
        numbering_system: 'fdi',
    })
    assert.deepEqual(requests.pop(), [
        'GET',
        '/api/patients/4/dental-chart/revisions/2',
        { params: { dentition: 'primary', numbering_system: 'fdi' } },
    ])
    response = metadata
    assert.deepEqual(await api.getDentalChartMetadata(), metadata)
    response = {
        data: { revisions: [{ ...emptyChart(), version: 2 }] },
        meta: { pagination: { currentPage: 2, lastPage: 3 } },
    }
    assert.equal(
        (await api.getDentalChartHistory(4, { page: 2 })).meta.lastPage,
        3,
    )
    response = { chart: { ...emptyChart(), version: 1 } }
    const payload = {
        dentition: 'adult',
        expected_version: 0,
        dentist_id: 21,
        reason: 'Initial exam',
        teeth: [
            {
                ...tooth(),
                tenant_id: 999,
                findings: [{ ...finding(), author_user_id: 999 }],
            },
        ],
        author_user_id: 999,
        patient_id: 999,
        tenant_id: 999,
        version: 999,
        recorded_at: 'forged',
    }
    assert.equal((await api.appendDentalChart(4, payload)).version, 1)
    assert.deepEqual(requests.pop(), [
        'POST',
        '/api/patients/4/dental-chart/revisions',
        {
            dentition: 'adult',
            numbering_system: 'universal',
            expected_version: 0,
            dentist_id: 21,
            clinical_note_id: null,
            reason: 'Initial exam',
            teeth: [tooth()],
        },
    ])

    const Odontogram = compile('components/DentalOdontogram.tsx', {
        '../lib/dental-charts': workflow,
    }).default
    const markup = renderToStaticMarkup(
        React.createElement(Odontogram, {
            metadata,
            dentition: 'adult',
            numbering: 'universal',
            teeth: [tooth()],
            onSelect() {},
        }),
    )
    assert.equal((markup.match(/role="option"/g) ?? []).length, 32)
    assert.match(markup, /class="teeth-16 /)
    assert.match(markup, /data-colored="true"/)
    assert.doesNotMatch(markup, /healthy/i)
    const primaryMarkup = renderToStaticMarkup(
        React.createElement(Odontogram, {
            metadata,
            dentition: 'primary',
            numbering: 'fdi',
            teeth: [],
            onSelect() {},
        }),
    )
    assert.equal((primaryMarkup.match(/data-tooth=/g) ?? []).length, 20)
    assert.equal((primaryMarkup.match(/role="option"/g) ?? []).length, 20)
    assert.match(primaryMarkup, /class="Odontogram"/)
    assert.doesNotMatch(primaryMarkup, /<button/)
    assert.match(primaryMarkup, /Tooth 55: Uncharted/)
    let stateIndex = 0,
        requestIndex = 0
    const cached = {
        ...emptyChart(),
        version: 1,
        reason: 'Confidential history',
        teeth: [tooth()],
    }
    const History = compile('components/DentalChartHistory.tsx', {
        react: {
            ...React,
            useState: () => [[1, 1, ''][stateIndex++], () => {}],
        },
        swr: {
            __esModule: true,
            default: () =>
                requestIndex++ === 0
                    ? {
                          error: { statusCode: 403 },
                          data: { revisions: [cached] },
                      }
                    : { data: cached },
        },
        '../context/AuthSessionContext': {
            useAuthSession: () => ({ user: {} }),
        },
        '../lib/dental-charts': workflow,
        '../lib/clinical-notes': { formatNoteDate: () => 'Date' },
        '../services/dental-charts': api,
        './DentalOdontogram': {
            __esModule: true,
            default: () => React.createElement('p', null, 'Confidential teeth'),
        },
        './AppointmentDialog': { appointmentButtonClass: '' },
    }).default
    const deniedHistory = renderToStaticMarkup(
        React.createElement(History, {
            patientId: 4,
            dentition: 'adult',
            numbering: 'universal',
            metadata,
        }),
    )
    assert.match(deniedHistory, /do not have permission/)
    assert.doesNotMatch(deniedHistory, /Confidential/)
    console.log(
        'Dental charts: clinical authorization, numbering, surfaces, validation, payload whitelist, revision API, reconciliation and odontogram rendering passed.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
