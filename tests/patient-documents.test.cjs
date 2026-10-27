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
const permissions = compile('lib/permissions.ts', {
    '../Constants': compile('Constants/index.tsx'),
})
const workflow = compile('lib/patient-documents.ts')
const api = compile('lib/api.ts', {
    './api-contract': compile('lib/api-contract.ts'),
})
const service = compile('services/patient-documents.ts', {
    '../lib/api': api,
    '../lib/patient-documents': workflow,
})
const fixture = {
    id: 7,
    patient_id: 4,
    original_filename: 'image.png',
    mime_type: 'image/png',
    size_bytes: 3,
    uploaded_by_user_id: 90,
    appointment_id: null,
    clinical_note_id: null,
    archived_at: null,
    created_at: '2026-10-26T12:00:00Z',
}
let response, failure, last
api.http.defaults.adapter = async config => {
    last = config
    if (failure)
        throw {
            config,
            response: {
                status: failure,
                statusText: '',
                headers: {},
                data: new Blob(
                    [
                        JSON.stringify({
                            message: 'Membership revoked.',
                            code: 'FORBIDDEN',
                            errors: { file: ['Invalid file.'] },
                        }),
                    ],
                    { type: 'application/json' },
                ),
            },
        }
    return { status: 200, statusText: 'OK', headers: {}, config, ...response }
}
async function run() {
    for (const [roles, grants, read, write] of [
        [[], [], false, false],
        [['admin', 'receptionist'], [], true, true],
        [['dentist'], [], true, true],
        [['dentist', 'receptionist'], [], true, false],
        [['receptionist'], [], false, false],
        [['reviewer'], ['patient_documents.view'], true, false],
        [[], ['*'], true, false],
        [[], ['patient_documents.*'], true, false],
        [[], ['*.view'], true, false],
        [
            [],
            ['patient_documents.create', 'patient_documents.delete'],
            false,
            false,
        ],
    ])
        assert.deepEqual(
            permissions.getPatientDocumentPermissions({
                current_tenant_id: 37,
                roles: roles.map(slug => ({ slug })),
                permissions: grants,
            }),
            { canView: read, canWrite: write },
        )
    assert.deepEqual(permissions.getPatientDocumentPermissions(null), {
        canView: false,
        canWrite: false,
    })
    assert.deepEqual(
        permissions.getPatientDocumentPermissions({
            current_tenant_id: 37,
            roles: [{ name: 'Admin' }],
            permissions: [],
        }),
        { canView: false, canWrite: false },
    )
    for (const [type, extensions] of Object.entries(workflow.documentTypes))
        for (const ext of extensions) {
            assert.equal(
                workflow.validateDocumentFile({
                    name: `scan.${ext.toUpperCase()}`,
                    type,
                    size: 20 * 1024 * 1024,
                }),
                '',
            )
            assert.equal(
                workflow.validateDocumentFile({
                    name: `scan.${ext}`,
                    type: '',
                    size: 1,
                }),
                '',
            )
        }
    for (const file of [
        { name: 'empty.pdf', type: 'application/pdf', size: 0 },
        {
            name: 'large.pdf',
            type: 'application/pdf',
            size: 20 * 1024 * 1024 + 1,
        },
        { name: 'fake.jpg', type: 'application/pdf', size: 1 },
        ...[
            'x.svg',
            'x.html',
            'x.exe',
            'x.docx',
            'x.dcm',
            '../x.pdf',
            'x\\a.pdf',
            'x\n.pdf',
            `${'x'.repeat(252)}.pdf`,
        ].map(name => ({ name, type: '', size: 1 })),
    ])
        assert.ok(workflow.validateDocumentFile(file), file.name)
    response = {
        data: {
            data: { documents: [fixture] },
            meta: { pagination: { currentPage: 2, lastPage: 3 } },
            success: true,
        },
    }
    const page = await service.getPatientDocuments(4, 'archived', 2, {
        tenantId: 37,
    })
    assert.deepEqual(page.documents, [fixture])
    assert.equal(page.meta.lastPage, 3)
    assert.deepEqual(last.params, { status: 'archived', page: 2, per_page: 15 })
    assert.equal(last.headers['X-Tenant-Id'], 37)
    response = { data: { data: { document: fixture }, success: true } }
    const file = new File(['PDF'], 'scan.pdf', { type: 'application/pdf' })
    assert.deepEqual(
        await service.uploadPatientDocument(
            4,
            {
                file,
                appointment_id: 8,
                clinical_note_id: 9,
                tenant_id: 99,
                original_filename: 'bad',
                created_at: null,
            },
            { tenantId: 37 },
        ),
        fixture,
    )
    assert.deepEqual(
        [...last.data.keys()],
        ['file', 'appointment_id', 'clinical_note_id'],
    )
    assert.equal(last.data.get('appointment_id'), '8')
    // Axios's browser adapter clears its default header for FormData. We must
    // never supply a multipart header without the browser's boundary.
    assert.notEqual(last.headers['Content-Type'], 'multipart/form-data')
    await service.uploadPatientDocument(
        4,
        { file, appointment_id: null },
        { tenantId: 37 },
    )
    assert.deepEqual([...last.data.keys()], ['file'])
    await service.getPatientDocument(4, 7, 37)
    assert.equal(last.url, '/api/patients/4/documents/7')
    await service.archivePatientDocument(4, 7, 37)
    assert.equal(last.url, '/api/patients/4/documents/7/archive')
    assert.equal(last.data, undefined)
    await service.deletePatientDocument(4, 7, 37)
    assert.equal(last.method, 'delete')
    response = {
        data: new Blob(['PNG']),
        headers: { 'content-type': 'image/png' },
    }
    const binary = await service.downloadPatientDocument(4, fixture, {
        tenantId: 37,
    })
    assert.equal(await binary.text(), 'PNG')
    assert.equal(binary.type, 'image/png')
    assert.equal(last.responseType, 'blob')
    assert.equal(last.url, '/api/patients/4/documents/7/download')
    assert.equal(last.headers['X-Tenant-Id'], 37)
    response.headers['content-type'] = 'text/html'
    await assert.rejects(
        service.downloadPatientDocument(4, fixture, { tenantId: 37 }),
        /unexpected file type/,
    )
    failure = 403
    await assert.rejects(
        service.downloadPatientDocument(4, fixture, { tenantId: 37 }),
        error =>
            error.statusCode === 403 &&
            error.message === 'Membership revoked.' &&
            error.errors.file[0] === 'Invalid file.',
    )
    const aborted = new AbortController()
    aborted.abort()
    await assert.rejects(
        service.downloadPatientDocument(4, fixture, {
            tenantId: 37,
            signal: aborted.signal,
        }),
        { name: 'AbortError' },
    )
    console.log(
        'Patient document validation, permissions, multipart, binary and error tests passed.',
    )
}
run().catch(error => {
    console.error(error)
    process.exitCode = 1
})
