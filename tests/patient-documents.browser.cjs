// All clinical requests are intercepted; no live bucket or patient data is used.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.DOCUMENTS_TEST_URL || 'http://localhost:3013'
const apiOrigin = process.env.DOCUMENTS_TEST_API_URL || 'http://localhost:8000'
let actor = 'dentist',
    listFailure = 0,
    uploadFailure = 0,
    purgeFailure = 0,
    downloadFailure = 0
let holdUpload = false,
    releaseUpload,
    holdDownload = false,
    releaseDownload
let documents = [],
    browser
const requests = []
const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII='
const patient = id => ({
    id,
    firstName: id === 4 ? 'Jane' : 'Pat',
    lastName: id === 4 ? 'Doe' : 'Smith',
    city: 'Bogota',
    archived: id === 5,
    appointments: '',
    notes: '',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
})
const makeDocument = (id, changes = {}) => ({
    id,
    patient_id: 4,
    original_filename: `scan-${id}.png`,
    mime_type: 'image/png',
    size_bytes: Buffer.from(png, 'base64').length,
    uploaded_by_user_id: 90,
    appointment_id: null,
    clinical_note_id: null,
    created_at: '2026-10-26T12:00:00Z',
    archived_at: null,
    ...changes,
})
// Small, complete two-page PDF; page rendering is exercised in the real browser.
const makePdf = () => {
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 5 0 R >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 5 0 R >>',
        '<< /Length 23 >>\nstream\n0 0 1 rg 10 10 40 40 re f\nendstream',
    ]
    let source = '%PDF-1.4\n',
        offsets = [0]
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(source))
        source += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const start = Buffer.byteLength(source)
    source += `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map(value => `${String(value).padStart(10, '0')} 00000 n \n`)
        .join(
            '',
        )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
    return Buffer.from(source).toString('base64')
}
const pdf = makePdf()
const onRequest = async ({ method, url, headers, rawPostData, payload }) => {
    requests.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers,
        rawPostData,
        payload,
    })
    if (url.pathname === '/api/user')
        return {
            data: {
                id: 90,
                current_tenant_id: 37,
                name: 'Clinical user',
                email_verified_at: '2026-01-01',
                roles: (actor === 'mixed'
                    ? ['dentist', 'receptionist']
                    : [actor]
                ).map(slug => ({ slug })),
                permissions: [
                    'patients.view',
                    'appointments.view',
                    ...(actor === 'reviewer' ? ['patient_documents.*'] : []),
                ],
            },
        }
    if (url.pathname === '/api/tenants')
        return {
            data: {
                tenants: [
                    {
                        id: 37,
                        name: 'Default Clinic',
                        slug: 'default-clinic',
                        active: true,
                    },
                ],
            },
        }
    if (url.pathname === '/api/patients')
        return { data: { patients: [patient(4), patient(5)] } }
    if (/^\/api\/patients\/\d+$/.test(url.pathname))
        return {
            data: { patient: patient(Number(url.pathname.split('/').pop())) },
        }
    if (url.pathname === '/api/appointments')
        return {
            data: {
                appointments: [4, 5].map(id => ({
                    id: id + 4,
                    patient_id: id,
                    dentist_id: 21,
                    startsAt: '2026-10-26T12:00:00Z',
                    duration_minutes: 30,
                    status: 'completed',
                    dentistName: 'Dentist',
                })),
            },
        }
    if (url.pathname === '/api/clinical-notes')
        return {
            data: {
                clinicalNotes: [
                    {
                        id: 12,
                        patient_id: 4,
                        appointment_id: 8,
                        created_at: '2026-10-26',
                    },
                    {
                        id: 13,
                        patient_id: 4,
                        appointment_id: null,
                        created_at: '2026-10-26',
                    },
                ],
            },
            meta: { pagination: { currentPage: 1, lastPage: 1 } },
        }
    const route = url.pathname.match(
        /^\/api\/patients\/(\d+)\/documents(?:\/(\d+)(?:\/(download|archive))?)?$/,
    )
    if (!route)
        return {
            status: 500,
            message: 'Unrelated workspace fixture unavailable.',
        }
    assert.equal(String(headers['X-Tenant-Id'] ?? headers['x-tenant-id']), '37')
    const [, patientId, id, action] = route
    if (!id && method === 'GET') {
        await new Promise(resolve => setTimeout(resolve, 180))
        if (listFailure)
            return {
                status: listFailure,
                message: 'Document list unavailable.',
            }
        const filter = url.searchParams.get('status'),
            page = Number(url.searchParams.get('page'))
        const filtered = documents
            .filter(
                item =>
                    item.patient_id === Number(patientId) &&
                    !item.deleted &&
                    (filter === 'all' ||
                        (filter === 'archived'
                            ? Boolean(item.archived_at)
                            : !item.archived_at)),
            )
            .sort((a, b) => b.id - a.id)
        return {
            data: { documents: filtered.slice((page - 1) * 15, page * 15) },
            meta: {
                pagination: {
                    currentPage: page,
                    lastPage: Math.max(1, Math.ceil(filtered.length / 15)),
                },
            },
        }
    }
    if (!id && method === 'POST') {
        assert.match(
            headers['Content-Type'] ?? headers['content-type'],
            /^multipart\/form-data; boundary=/,
        )
        assert.match(rawPostData, /name="file"/)
        assert.ok(
            !/name="(?:patient_id|tenant_id|size_bytes|uploaded_by_user_id)"/.test(
                rawPostData,
            ),
        )
        if (holdUpload)
            await new Promise(resolve => {
                releaseUpload = resolve
            })
        if (uploadFailure)
            return {
                status: uploadFailure,
                message: 'Upload validation failed.',
                errors: {
                    clinical_note_id: [
                        'The selected note is no longer available.',
                    ],
                },
            }
        const document = makeDocument(100, {
            original_filename: 'visit.png',
            appointment_id: 8,
            clinical_note_id: 12,
        })
        documents.push(document)
        return { status: 201, data: { document } }
    }
    const document = documents.find(item => item.id === Number(id))
    if (action === 'download') {
        if (holdDownload)
            await new Promise(resolve => {
                releaseDownload = resolve
            })
        if (downloadFailure)
            return {
                status: downloadFailure,
                message: 'Document download denied.',
            }
        return {
            contentType: document.mime_type,
            bodyBase64: document.mime_type === 'application/pdf' ? pdf : png,
        }
    }
    if (action === 'archive') {
        document.archived_at ||= '2026-10-26T12:00:00Z'
        return { data: { document } }
    }
    if (method === 'DELETE') {
        document.deleted = true
        return purgeFailure
            ? { status: 503, message: 'Storage unavailable.' }
            : {}
    }
    return { data: { document } }
}
async function run() {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, wait, click, select } = browser
    const panel = `document.querySelector('[aria-label="Patient documents"]')`
    const dialog = 'document.querySelector("[role=dialog]")'
    const text = value =>
        `${panel}?.innerText.includes(${JSON.stringify(value)})`
    const dialogText = value =>
        `${dialog}?.innerText.includes(${JSON.stringify(value)})`
    const reload = async () => {
        await send('Page.navigate', {
            url: `${origin}/?tab=patient_list&documentCheck=${Date.now()}`,
        })
        await click('View patient Jane Doe')
        await wait(
            `document.querySelector('[aria-label="Patient detail for Jane Doe"]')?.getAttribute('aria-busy') === 'false'`,
        )
        await click('Medical Record')
        await wait(panel)
    }
    const choose = (name, type, size = 3, drop = false) =>
        evaluate(`(() => {
        const input = document.querySelector('#patient-document-file');
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(${size})], ${JSON.stringify(
            name,
        )}, { type: ${JSON.stringify(type)} }));
        ${
            drop
                ? "input.closest('[class*=border-dashed]').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }))"
                : "input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))"
        };
    })()`)
    await reload()
    await wait(text('Loading documents...'))
    await wait(text('No active documents'))
    await click('Upload document')
    await choose('bad.svg', 'image/svg+xml')
    await wait(dialogText('Choose a PDF, JPEG, PNG or WebP file.'))
    await choose('large.png', 'image/png', 20 * 1024 * 1024 + 1)
    await wait(dialogText('at most 20.0 MiB'))
    await choose('visit.png', 'image/png', 30, true)
    await wait(
        `${dialog}?.querySelector('[name=appointment_id] option[value="8"]')`,
    )
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[name=appointment_id] option[value="9"]') === null`,
        ),
        true,
    )
    await select('[name=appointment_id]', '8')
    await wait(
        `${dialog}?.querySelector('[name=clinical_note_id] option[value="12"]')`,
    )
    await select('[name=clinical_note_id]', '12')
    uploadFailure = 422
    await evaluate(`${dialog}.querySelector('button[type=submit]').click()`)
    await wait(dialogText('The selected note is no longer available.'))
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[name=clinical_note_id]').value`,
        ),
        '12',
    )
    uploadFailure = 0
    holdUpload = true
    await evaluate(`${dialog}.querySelector('button[type=submit]').click()`)
    await wait(`${dialog}?.querySelector('progress')`)
    assert.equal(
        await evaluate(
            `${dialog}.querySelector('[aria-label="Close document upload"]').disabled`,
        ),
        true,
    )
    await browser.delay(200)
    holdUpload = false
    releaseUpload()
    await wait(`!${dialog}`)
    await wait(text('visit.png'))
    await wait(text('User #90'))
    const upload = requests
        .filter(
            item =>
                item.method === 'POST' &&
                item.path === '/api/patients/4/documents',
        )
        .at(-1)
    assert.match(upload.rawPostData, /name="appointment_id"\r\n\r\n8/)
    assert.match(upload.rawPostData, /name="clinical_note_id"\r\n\r\n12/)
    await click('Preview visit.png')
    await wait(`${dialog}?.querySelector('img')?.naturalWidth > 0`)
    await click('Close document preview')
    // Closing a pending preview must not recreate it when retrieval completes.
    holdDownload = true
    await click('Preview visit.png')
    await wait(dialogText('Opening private document...'))
    for (let attempt = 0; !releaseDownload && attempt < 50; attempt++)
        await browser.delay(50)
    assert.ok(releaseDownload)
    await click('Close document preview')
    holdDownload = false
    releaseDownload()
    await browser.delay(250)
    assert.equal(await evaluate(`!!${dialog}`), false)
    await evaluate(
        `window.savedDownloads=[]; HTMLAnchorElement.prototype.click=function(){ window.savedDownloads.push({name:this.download,href:this.href}) }`,
    )
    await click('Download visit.png')
    await wait('window.savedDownloads.length === 1')
    assert.deepEqual(
        await evaluate('window.savedDownloads[0].name'),
        'visit.png',
    )
    assert.match(await evaluate('window.savedDownloads[0].href'), /^blob:/)
    await click('Archive visit.png')
    await click('Archive document')
    await wait(text('No active documents'))
    await select('[aria-label="Document status"]', 'archived')
    await wait(text('visit.png'))
    await click('Preview visit.png')
    await wait(`${dialog}?.querySelector('img')?.naturalWidth > 0`)
    await click('Close document preview')
    await click('Remove visit.png')
    purgeFailure = 503
    await click('Remove document')
    await wait(dialogText('Access has been revoked'))
    await click('Close document action')
    await wait(text('Storage removal pending'))
    assert.equal(
        await evaluate(
            `${panel}.querySelector('[aria-label="Download visit.png"]') === null`,
        ),
        true,
    )
    purgeFailure = 0
    await click('Retry removal')
    await click('Remove document')
    await wait(text('Document removed.'))
    await wait(`!${text('Storage removal pending')}`)
    documents = [
        makeDocument(200, {
            original_filename: 'report.pdf',
            mime_type: 'application/pdf',
            size_bytes: Buffer.from(pdf, 'base64').length,
        }),
    ]
    await select('[aria-label="Document status"]', 'active')
    await wait(text('report.pdf'))
    await click('Preview report.pdf')
    await wait(`${dialog}?.querySelector('canvas')?.width === 450`, 60000)
    await wait(dialogText('Page 1 of 2'))
    await wait(`!${dialog}?.innerText.includes('Rendering PDF page...')`)
    await click('Next PDF page')
    await wait(dialogText('Page 2 of 2'))
    await click('Close document preview')
    listFailure = 500
    await click('Refresh documents')
    await wait(text('Document list unavailable.'))
    listFailure = 0
    await click('Retry documents')
    await wait(text('report.pdf'))
    documents = Array.from({ length: 16 }, (_, index) =>
        makeDocument(index + 1),
    )
    await click('Refresh documents')
    await wait(text('Page 1 of 2'))
    await click('Next documents')
    await wait(text('Page 2 of 2'))
    await wait(text('scan-1.png'))
    for (const role of ['reviewer', 'mixed', 'receptionist']) {
        actor = role
        await reload()
        if (role === 'receptionist')
            await wait(text('You do not have permission'))
        else await wait(text('scan-16.png'))
        assert.equal(
            await evaluate(
                `${panel}.innerText.includes('Upload document') || !!${panel}.querySelector('[aria-label^="Remove "]')`,
            ),
            false,
        )
    }
    actor = 'reviewer'
    await reload()
    await wait(text('scan-16.png'))
    downloadFailure = 403
    await click('Download scan-16.png')
    await wait(text('Document download denied.'))
    assert.equal(
        await evaluate(
            `${panel}.querySelector('[aria-label^="Download "]') === null`,
        ),
        true,
    )
    assert.deepEqual(browser.errors, [])
    console.log(
        'Patient documents browser checks passed: upload/drop/progress, context, image/PDF preview, binary download, archive, purge retry, pagination, errors and roles.',
    )
}
run()
    .catch(error => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await browser?.close()
    })
