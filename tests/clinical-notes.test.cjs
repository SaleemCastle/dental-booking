const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

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
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
const workflow = compile('lib/clinical-notes.ts')
const fixture = {
    id: 8,
    patient_id: 4,
    dentist_id: 27,
    appointment_id: 91,
    note_text: 'Sensitivity improving.',
    author_user_id: 100,
    updated_by_user_id: 102,
    authorName: 'Original dentist',
    updatedByName: 'Collaborating dentist',
    created_at: '2026-10-15T14:00:00Z',
    updated_at: '2026-10-16T15:30:00Z',
}

async function main() {
    for (const [user, view, write] of [
        [null, false, false],
        [{ id: 1 }, false, false],
        [{ roles: ['admin', 'receptionist'] }, true, true],
        [{ roles: ['dentist'] }, true, true],
        [{ role: { slug: ' Dentist ' } }, true, true],
        [{ role_name: 'dentist' }, true, true],
        [{ roles: ['dentist', 'receptionist'] }, false, false],
        [
            {
                roles: ['dentist', 'receptionist'],
                permissions: ['clinical_notes.view'],
            },
            true,
            false,
        ],
        [{ roles: ['receptionist'] }, false, false],
        [
            { roles: ['receptionist'], permissions: ['clinical_notes.view'] },
            true,
            false,
        ],
        [
            { roles: ['billing'], permissions: ['clinical_notes.view'] },
            true,
            false,
        ],
        [
            {
                roles: [
                    { name: 'reviewer', permissions: [{ code: '*.view' }] },
                ],
            },
            true,
            false,
        ],
        [
            { role: { key: 'reviewer', permissions: ['clinical_notes.*'] } },
            true,
            false,
        ],
        [
            {
                can: {
                    'clinical_notes.view': true,
                    'clinical_notes.update': true,
                },
            },
            true,
            false,
        ],
        [{ abilities: ['*'] }, true, false],
        [
            {
                permissions: [
                    'clinical_notes.create',
                    'clinical_notes.update',
                    '*.update',
                ],
            },
            false,
            false,
        ],
        [{ isSuperAdmin: true }, false, false],
    ]) {
        assert.deepEqual(
            permissions.getClinicalNotePermissions(user),
            { canView: view, canWrite: write },
            JSON.stringify(user),
        )
    }
    for (const wildcard of ['clinical_notes.*', '*.view', '*']) {
        for (const roles of [
            ['receptionist'],
            ['dentist', 'receptionist'],
            ['billing'],
            [],
        ]) {
            assert.deepEqual(
                permissions.getClinicalNotePermissions({
                    roles,
                    permissions: [wildcard],
                }),
                { canView: true, canWrite: false },
            )
        }
    }
    const values = workflow.clinicalNoteValues(fixture)
    assert.deepEqual(workflow.validateClinicalNote(values), {})
    assert.deepEqual(workflow.clinicalNotePayload(4, values, fixture), {})
    assert.deepEqual(
        workflow.clinicalNotePayload(
            4,
            { ...values, note_text: 'Updated collaboratively.' },
            fixture,
        ),
        { note_text: 'Updated collaboratively.' },
    )
    assert.deepEqual(
        workflow.clinicalNotePayload(
            4,
            { ...values, appointment_id: '' },
            fixture,
        ),
        { appointment_id: null },
    )
    assert.deepEqual(
        workflow.clinicalNotePayload(
            4,
            { ...values, appointment_id: '92', dentist_id: '28' },
            fixture,
        ),
        { dentist_id: 28, appointment_id: 92 },
    )
    assert.deepEqual(
        workflow.clinicalNotePayload(4, {
            dentist_id: '27',
            appointment_id: '',
            note_text: 'New note',
        }),
        {
            patient_id: 4,
            dentist_id: 27,
            appointment_id: null,
            note_text: 'New note',
        },
    )
    assert.equal(
        Object.keys(
            workflow.validateClinicalNote({
                dentist_id: '',
                appointment_id: '-1',
                note_text: '  \n',
            }),
        ).length,
        3,
    )
    assert.ok(
        workflow.validateClinicalNote({
            ...values,
            note_text: 'a'.repeat(16001),
        }).note_text,
    )
    assert.deepEqual(
        workflow.validateClinicalNote({
            ...values,
            note_text: '🦷'.repeat(16000),
        }),
        {},
    )
    assert.match(workflow.formatNoteDate(fixture.created_at), /14:00 UTC/)
    assert.equal(workflow.formatNoteDate(null), 'Date unknown')

    let response
    const requests = []
    const request = async (method, ...args) => {
        requests.push([method, ...args])
        return response
    }
    const service = compile('services/clinical-notes.ts', {
        '../lib/api': {
            apiClient: {
                get: (...args) => request('GET', ...args),
                postData: (...args) => request('POST', ...args),
                patchData: (...args) => request('PATCH', ...args),
                delete: (...args) => request('DELETE', ...args),
            },
        },
    })
    response = {
        data: { clinicalNotes: [fixture] },
        meta: {
            pagination: {
                current_page: 2,
                last_page: 3,
                per_page: 15,
                total: 37,
            },
        },
    }
    const page = await service.getClinicalNotes({
        patient_id: 4,
        dentist_id: 27,
        appointment_id: 91,
        page: 2,
    })
    assert.deepEqual(page.notes, [fixture])
    assert.equal(page.meta.currentPage, 2)
    assert.equal(page.meta.lastPage, 3)
    assert.deepEqual(requests.pop(), [
        'GET',
        '/api/clinical-notes',
        {
            params: {
                patient_id: 4,
                dentist_id: 27,
                appointment_id: 91,
                page: 2,
                per_page: 15,
            },
        },
    ])
    response = { clinicalNote: fixture }
    assert.deepEqual(
        await service.createClinicalNote({
            patient_id: 4,
            dentist_id: 27,
            note_text: fixture.note_text,
            author_user_id: 999,
            created_at: null,
        }),
        fixture,
    )
    assert.deepEqual(requests.pop(), [
        'POST',
        '/api/clinical-notes',
        { patient_id: 4, dentist_id: 27, note_text: fixture.note_text },
    ])
    await service.updateClinicalNote(8, {
        appointment_id: null,
        note_text: 'Edited',
        updated_by_user_id: 999,
    })
    assert.deepEqual(requests.pop(), [
        'PATCH',
        '/api/clinical-notes/8',
        { appointment_id: null, note_text: 'Edited' },
    ])
    await service.deleteClinicalNote(8)
    assert.deepEqual(requests.pop(), ['DELETE', '/api/clinical-notes/8'])

    const state = {
        canView: true,
        canWrite: true,
        user: { id: 100 },
        notes: [fixture],
        error: undefined,
        isLoading: false,
        isValidating: false,
        hasMore: false,
        sync: async () => true,
    }
    const Panel = compile('components/PatientClinicalNotes.tsx', {
        '../hooks/clinical-notes': { usePatientClinicalNotes: () => state },
        '../lib/api': { normalizeAxiosError: e => e },
        '../lib/clinical-notes': workflow,
        '../services/clinical-notes': {},
        './ClinicalNoteForm': { __esModule: true, default: () => null },
        './AppointmentDialog': { __esModule: true, default: () => null },
    }).default
    const render = () =>
        renderToStaticMarkup(React.createElement(Panel, { patient: { id: 4 } }))
    assert.match(render(), /Original dentist/)
    assert.match(render(), /Collaborating dentist/)
    assert.match(render(), /Appointment #91/)
    assert.match(render(), /Add visit note/)
    state.canWrite = false
    assert.match(render(), /Read-only/)
    assert.doesNotMatch(
        render(),
        /Edit clinical note|Delete clinical note|Add visit note/,
    )
    state.error = { statusCode: 403, message: 'Forbidden' }
    assert.doesNotMatch(render(), /Sensitivity improving/)
    state.error = { statusCode: 500, message: 'Unavailable' }
    assert.match(render(), /Retry notes/)
    state.error = undefined
    state.notes = []
    state.isLoading = true
    assert.match(render(), /Loading clinical notes/)
    state.isLoading = false
    assert.match(render(), /No clinical notes yet/)
    state.canView = false
    state.notes = [fixture]
    assert.doesNotMatch(render(), /Sensitivity improving/)
    console.log(
        'Clinical notes: role restrictions, API contract, validation, partial updates, attribution and panel states passed.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
