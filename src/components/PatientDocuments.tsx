import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FiFileText, FiUploadCloud } from 'react-icons/fi'
import { useAuthSession } from '../context/AuthSessionContext'
import { normalizeAxiosError } from '../lib/api'
import { getPatientDocumentPermissions } from '../lib/permissions'
import { formatDocumentSize } from '../lib/patient-documents'
import { formatNoteDate } from '../lib/clinical-notes'
import {
    archivePatientDocument,
    deletePatientDocument,
    DocumentPage,
    DocumentStatus,
    downloadPatientDocument,
    getPatientDocuments,
    PatientDocument,
} from '../services/patient-documents'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'
import PatientDocumentUpload from './PatientDocumentUpload'
import PatientDocumentPreview from './PatientDocumentPreview'

export default function PatientDocuments({ patient }: { patient: Patient }) {
    const session = useAuthSession()
    const { canView, canWrite } = getPatientDocumentPermissions(
        session.status === 'authenticated' ? session.user : null,
    )
    const tenantId = session.currentTenant?.id
    const [filter, setFilter] = useState<DocumentStatus>('active')
    const [page, setPage] = useState(1)
    const [feed, setFeed] = useState<DocumentPage | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [denied, setDenied] = useState(false)
    const [notice, setNotice] = useState('')
    const [uploading, setUploading] = useState(false)
    const [preview, setPreview] = useState<PatientDocument | null>(null)
    const [confirm, setConfirm] = useState<{
        document: PatientDocument
        action: 'archive' | 'remove'
    } | null>(null)
    const [actionError, setActionError] = useState('')
    const [busy, setBusy] = useState(false)
    const [pending, setPending] = useState<PatientDocument[]>([])
    const [downloading, setDownloading] = useState<number | null>(null)
    const listRequest = useRef<AbortController | null>(null)
    const downloadRequest = useRef<AbortController | null>(null)
    const actionBusy = useRef(false)
    const mounted = useRef(true)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
            listRequest.current?.abort()
            downloadRequest.current?.abort()
        }
    }, [])
    const load = useCallback(async () => {
        listRequest.current?.abort()
        if (!canView || !tenantId) return
        const controller = new AbortController()
        listRequest.current = controller
        setLoading(true)
        setError('')
        setDenied(false)
        // Do not retain records from a different page/filter while loading.
        setFeed(null)
        try {
            const result = await getPatientDocuments(patient.id, filter, page, {
                tenantId,
                signal: controller.signal,
            })
            if (!controller.signal.aborted) setFeed(result)
        } catch (error) {
            if (controller.signal.aborted) return
            const failure = normalizeAxiosError(error)
            setError(failure.message)
            setDenied([401, 403, 404].includes(failure.statusCode))
        } finally {
            if (!controller.signal.aborted) setLoading(false)
        }
    }, [patient.id, filter, page, canView, tenantId])
    useEffect(() => {
        void load()
        return () => listRequest.current?.abort()
    }, [load])
    const beginAction = (
        document: PatientDocument,
        action: 'archive' | 'remove',
    ) => {
        setActionError('')
        setNotice('')
        setConfirm({ document, action })
    }
    const mutate = async () => {
        if (!confirm || !canWrite || !tenantId || actionBusy.current) return
        actionBusy.current = true
        setBusy(true)
        setActionError('')
        const { document, action } = confirm
        try {
            if (action === 'archive')
                await archivePatientDocument(patient.id, document.id, tenantId)
            else await deletePatientDocument(patient.id, document.id, tenantId)
            if (!mounted.current) return
            setPending(current =>
                current.filter(item => item.id !== document.id),
            )
            setConfirm(null)
            setNotice(
                action === 'archive'
                    ? 'Document archived. It remains available in Archived documents.'
                    : 'Document removed.',
            )
            await load()
        } catch (error) {
            if (!mounted.current) return
            const failure = normalizeAxiosError(error)
            if (action === 'remove' && failure.statusCode === 503) {
                setPending(current =>
                    Array.from(
                        new Map(
                            [...current, document].map(item => [item.id, item]),
                        ).values(),
                    ),
                )
                setFeed(current =>
                    current
                        ? {
                              ...current,
                              documents: current.documents.filter(
                                  item => item.id !== document.id,
                              ),
                          }
                        : current,
                )
                setActionError(
                    'Access has been revoked, but storage removal is pending. Retry removal to finish. It is safe to retry.',
                )
            } else setActionError(failure.message)
            if ([401, 403, 404].includes(failure.statusCode)) {
                setDenied(true)
                setFeed(null)
                setConfirm(null)
                setError(failure.message)
            }
        } finally {
            actionBusy.current = false
            if (mounted.current) setBusy(false)
        }
    }
    const download = async (document: PatientDocument) => {
        if (downloadRequest.current || !canView || !tenantId || denied) return
        const controller = new AbortController()
        downloadRequest.current = controller
        setDownloading(document.id)
        setNotice('')
        try {
            const blob = await downloadPatientDocument(patient.id, document, {
                tenantId,
                signal: controller.signal,
            })
            if (controller.signal.aborted) return
            const url = URL.createObjectURL(blob)
            const anchor = window.document.createElement('a')
            anchor.href = url
            anchor.download = document.original_filename
            window.document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            // Give the browser time to accept the download before revocation.
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            setNotice('Download started.')
        } catch (error) {
            if (controller.signal.aborted) return
            const failure = normalizeAxiosError(error)
            setError(failure.message)
            if ([401, 403, 404].includes(failure.statusCode)) {
                setDenied(true)
                setFeed(null)
            }
        } finally {
            downloadRequest.current = null
            if (!controller.signal.aborted) setDownloading(null)
        }
    }
    const documents = (feed?.documents ?? [])
        .filter(item => !pending.some(deleted => deleted.id === item.id))
        .sort((a, b) => b.id - a.id)
    return (
        <section
            aria-label="Patient documents"
            className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-extrabold text-clinic-ink">
                        Documents &amp; imaging
                    </h3>
                    <p className="mt-1 text-sm text-clinic-muted">
                        Clinical files and images for this patient.
                    </p>
                </div>
                {canWrite && !denied && (
                    <button
                        type="button"
                        onClick={() => {
                            setNotice('')
                            setUploading(true)
                        }}
                        className={`${primaryClass} flex items-center gap-2`}>
                        <FiUploadCloud aria-hidden="true" />
                        Upload document
                    </button>
                )}
            </div>
            {!canView ? (
                <p className="mt-5 text-sm text-clinic-muted">
                    You do not have permission to view patient documents.
                </p>
            ) : (
                <>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <label className="text-sm font-bold text-clinic-ink">
                            Show{' '}
                            <select
                                aria-label="Document status"
                                className="ml-2 rounded-md border-clinic-line text-sm"
                                value={filter}
                                onChange={event => {
                                    setPage(1)
                                    setFilter(
                                        event.target.value as DocumentStatus,
                                    )
                                }}>
                                <option value="active">Active documents</option>
                                <option value="archived">
                                    Archived documents
                                </option>
                                <option value="all">All documents</option>
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading || busy}
                            className={buttonClass}>
                            Refresh documents
                        </button>
                    </div>
                    {notice && (
                        <p
                            role="status"
                            className="mt-4 text-sm text-clinic-blue">
                            {notice}
                        </p>
                    )}
                    {error && (
                        <div
                            role="alert"
                            className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-red-700">
                            {error}{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => void load()}>
                                Retry documents
                            </button>
                        </div>
                    )}
                    {loading && (
                        <p
                            role="status"
                            className="py-8 text-sm text-clinic-muted">
                            Loading documents...
                        </p>
                    )}
                    {!loading && !error && !documents.length && (
                        <div className="mt-4 rounded-md border border-dashed border-clinic-line px-5 py-9 text-center">
                            <FiFileText
                                aria-hidden="true"
                                className="mx-auto h-7 w-7 text-clinic-muted"
                            />
                            <p className="mt-3 font-bold text-clinic-ink">
                                {filter === 'archived'
                                    ? 'No archived documents'
                                    : filter === 'all'
                                    ? 'No documents yet'
                                    : 'No active documents'}
                            </p>
                            <p className="mt-1 text-sm text-clinic-muted">
                                {canWrite
                                    ? 'Upload a clinical file or image to keep it with this patient.'
                                    : 'Patient files will appear here when uploaded by the clinical team.'}
                            </p>
                        </div>
                    )}
                    {!denied && documents.length > 0 && (
                        <ul className="mt-4 divide-y divide-clinic-line">
                            {documents.map(document => (
                                <li
                                    key={document.id}
                                    className="flex min-w-0 flex-wrap items-start justify-between gap-4 py-5">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <FiFileText
                                                aria-hidden="true"
                                                className="shrink-0 text-clinic-blue"
                                            />
                                            <p className="break-all font-bold text-clinic-ink">
                                                {document.original_filename}
                                            </p>
                                        </div>
                                        <p className="mt-2 text-xs text-clinic-muted">
                                            {document.mime_type} ·{' '}
                                            {formatDocumentSize(
                                                document.size_bytes,
                                            )}{' '}
                                            ·{' '}
                                            {formatNoteDate(
                                                document.created_at,
                                            )}
                                        </p>
                                        <p className="mt-1 text-xs text-clinic-muted">
                                            Uploaded by{' '}
                                            {document.uploadedByName ||
                                                (document.uploaded_by_user_id
                                                    ? `User #${document.uploaded_by_user_id}`
                                                    : 'Unknown uploader')}
                                        </p>
                                        {(document.appointment_id ||
                                            document.clinical_note_id) && (
                                            <p className="mt-1 text-xs text-clinic-muted">
                                                {[
                                                    document.appointment_id
                                                        ? `Appointment #${document.appointment_id}`
                                                        : '',
                                                    document.clinical_note_id
                                                        ? `Clinical note #${document.clinical_note_id}`
                                                        : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </p>
                                        )}
                                        {document.archived_at && (
                                            <p className="mt-2 text-xs font-bold text-amber-700">
                                                Archived ·{' '}
                                                {formatNoteDate(
                                                    document.archived_at,
                                                )}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            aria-label={`Preview ${document.original_filename}`}
                                            onClick={() =>
                                                setPreview(document)
                                            }>
                                            Preview
                                        </button>
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={downloading !== null}
                                            aria-label={`Download ${document.original_filename}`}
                                            onClick={() =>
                                                void download(document)
                                            }>
                                            {downloading === document.id
                                                ? 'Downloading...'
                                                : 'Download'}
                                        </button>
                                        {canWrite && (
                                            <>
                                                {!document.archived_at && (
                                                    <button
                                                        type="button"
                                                        className={buttonClass}
                                                        aria-label={`Archive ${document.original_filename}`}
                                                        onClick={() =>
                                                            beginAction(
                                                                document,
                                                                'archive',
                                                            )
                                                        }>
                                                        Archive
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className={`${buttonClass} text-red-700`}
                                                    aria-label={`Remove ${document.original_filename}`}
                                                    onClick={() =>
                                                        beginAction(
                                                            document,
                                                            'remove',
                                                        )
                                                    }>
                                                    Remove
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {!denied && !loading && feed && (
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-clinic-line pt-4">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={page <= 1}
                                onClick={() => setPage(value => value - 1)}>
                                Previous documents
                            </button>
                            <p className="text-xs text-clinic-muted">
                                Page {page} of {feed.meta.lastPage}
                            </p>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={page >= Number(feed.meta.lastPage)}
                                onClick={() => setPage(value => value + 1)}>
                                Next documents
                            </button>
                        </div>
                    )}
                    {canWrite && !denied && pending.length > 0 && (
                        <div className="mt-5 rounded-md bg-amber-50 p-4">
                            <p className="text-sm font-bold text-amber-900">
                                Storage removal pending
                            </p>
                            <p className="mt-1 text-xs text-amber-900">
                                These documents are inaccessible. Retry to
                                finish removing their stored files.
                            </p>
                            {pending.map(document => (
                                <div
                                    key={document.id}
                                    className="mt-3 flex flex-wrap items-center gap-3">
                                    <span className="break-all text-sm">
                                        {document.original_filename}
                                    </span>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        onClick={() =>
                                            beginAction(document, 'remove')
                                        }>
                                        Retry removal
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
            {uploading && canWrite && !denied && (
                <PatientDocumentUpload
                    patient={patient}
                    tenantId={tenantId}
                    onClose={() => setUploading(false)}
                    onUploaded={() => {
                        setUploading(false)
                        setNotice('Document uploaded.')
                        if (filter !== 'active' || page !== 1) {
                            setFilter('active')
                            setPage(1)
                        } else void load()
                    }}
                />
            )}
            {preview && canView && !denied && (
                <PatientDocumentPreview
                    patientId={patient.id}
                    document={preview}
                    tenantId={tenantId}
                    onClose={() => setPreview(null)}
                />
            )}
            {confirm && canWrite && !denied && (
                <AppointmentDialog
                    title={
                        confirm.action === 'archive'
                            ? 'Archive document?'
                            : 'Remove document?'
                    }
                    closeLabel="Close document action"
                    busy={busy}
                    onClose={() => setConfirm(null)}>
                    <div className="space-y-4 p-6">
                        <p className="break-all text-sm font-bold text-clinic-ink">
                            {confirm.document.original_filename}
                        </p>
                        <p className="text-sm text-clinic-muted">
                            {confirm.action === 'archive'
                                ? 'This hides the document from the active list. The file remains available for authorized download. Archiving cannot be undone here.'
                                : 'This revokes access and removes the stored file. You cannot restore it here. The clinic retains a record of the removal.'}
                        </p>
                        {actionError && (
                            <p role="alert" className="text-sm text-red-700">
                                {actionError}
                            </p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy}
                                onClick={() => setConfirm(null)}>
                                Close
                            </button>
                            <button
                                type="button"
                                className={primaryClass}
                                disabled={busy}
                                onClick={() => void mutate()}>
                                {busy
                                    ? 'Working...'
                                    : confirm.action === 'archive'
                                    ? 'Archive document'
                                    : 'Remove document'}
                            </button>
                        </div>
                    </div>
                </AppointmentDialog>
            )}
        </section>
    )
}
