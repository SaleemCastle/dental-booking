import React, { useRef, useState } from 'react'
import { usePatientClinicalNotes } from '../hooks/clinical-notes'
import { normalizeAxiosError } from '../lib/api'
import { formatNoteDate } from '../lib/clinical-notes'
import {
    ClinicalNote,
    ClinicalNotePayload,
    createClinicalNote,
    updateClinicalNote,
    deleteClinicalNote,
} from '../services/clinical-notes'
import ClinicalNoteForm from './ClinicalNoteForm'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const PatientClinicalNotes = ({ patient }: { patient: Patient }) => {
    const feed = usePatientClinicalNotes(patient.id)
    const [editor, setEditor] = useState<ClinicalNote | 'new' | null>(null)
    const [deleting, setDeleting] = useState<ClinicalNote | null>(null)
    const [busy, setBusy] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const [notice, setNotice] = useState('')
    const [denied, setDenied] = useState(false)
    const deletingRef = useRef(false)
    const canWrite = feed.canWrite && !denied && feed.error?.statusCode !== 403
    const save = async (payload: Partial<ClinicalNotePayload>) => {
        if (!canWrite)
            throw new Error(
                'You do not have permission to edit clinical notes.',
            )
        let saved: ClinicalNote
        try {
            saved =
                editor === 'new'
                    ? await createClinicalNote(payload as ClinicalNotePayload)
                    : await updateClinicalNote(
                          (editor as ClinicalNote).id,
                          payload,
                      )
        } catch (error) {
            if (normalizeAxiosError(error).statusCode === 403) setDenied(true)
            throw error
        }
        const refreshed = await feed.sync(saved)
        setEditor(null)
        setNotice(
            refreshed
                ? 'Clinical note saved.'
                : 'Clinical note saved. Refresh failed; retry to check for other changes.',
        )
    }
    const remove = async () => {
        if (!deleting || deletingRef.current || !canWrite) return
        deletingRef.current = true
        setBusy(true)
        setDeleteError('')
        try {
            await deleteClinicalNote(deleting.id)
            const refreshed = await feed.sync(undefined, deleting.id)
            setDeleting(null)
            setNotice(
                refreshed
                    ? 'Clinical note removed.'
                    : 'Clinical note removed. Refresh failed; retry to check for other changes.',
            )
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setDeleteError(failure.message)
            if (failure.statusCode === 403) setDenied(true)
        } finally {
            deletingRef.current = false
            setBusy(false)
        }
    }
    return (
        <section
            aria-label="Patient clinical notes"
            className="border-t border-clinic-line pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-extrabold text-clinic-ink">
                        Clinical notes
                    </h3>
                    <p className="mt-1 text-xs text-clinic-muted">
                        Patient timeline · newest notes first
                    </p>
                </div>
                {feed.canView && (
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={feed.isValidating}
                        onClick={() =>
                            void feed.retry().catch(() => undefined)
                        }>
                        Refresh notes
                    </button>
                )}
                {canWrite && (
                    <button
                        type="button"
                        className={primaryClass}
                        onClick={() => {
                            setNotice('')
                            setEditor('new')
                        }}>
                        Add visit note
                    </button>
                )}
            </div>
            {!feed.canView ? (
                <p role="status" className="mt-4 text-sm text-clinic-muted">
                    You do not have permission to view clinical notes.
                </p>
            ) : (
                <>
                    {!canWrite && (
                        <p className="mt-3 text-xs text-clinic-muted">
                            Read-only. Clinical notes can be managed by
                            authorized clinical staff.
                        </p>
                    )}
                    {notice && (
                        <p
                            role="status"
                            className="mt-3 text-sm text-clinic-ink">
                            {notice}
                        </p>
                    )}
                    {feed.isLoading && (
                        <p
                            role="status"
                            className="mt-4 text-sm text-clinic-muted">
                            Loading clinical notes…
                        </p>
                    )}
                    {feed.error && (
                        <div role="alert" className="mt-4 text-sm text-red-700">
                            {feed.error.statusCode === 403
                                ? 'You do not have permission to view clinical notes.'
                                : `Clinical notes could not be refreshed. ${feed.error.message}`}{' '}
                            <button
                                type="button"
                                className={`${buttonClass} mt-2`}
                                disabled={feed.isValidating}
                                onClick={() =>
                                    void feed.retry().catch(() => undefined)
                                }>
                                Retry notes
                            </button>
                        </div>
                    )}
                    {!feed.isLoading && !feed.error && !feed.notes.length && (
                        <p className="mt-4 text-sm text-clinic-muted">
                            No clinical notes yet.
                        </p>
                    )}
                    {feed.error?.statusCode !== 403 && (
                        <ol
                            aria-label="Clinical note timeline"
                            className="mt-4 space-y-4">
                            {feed.notes.map(note => (
                                <li
                                    key={note.id}
                                    className="rounded-md border border-clinic-line bg-clinic-canvas/40 p-4">
                                    <article
                                        aria-label={`Clinical note ${note.id}`}>
                                        <p className="text-xs font-bold text-clinic-ink">
                                            {formatNoteDate(note.created_at)}
                                        </p>
                                        <p className="mt-1 text-xs text-clinic-muted">
                                            By{' '}
                                            {note.authorName ??
                                                'Unknown (legacy note)'}{' '}
                                            · Provider #{note.dentist_id}
                                        </p>
                                        <p className="mt-1 text-xs text-clinic-muted">
                                            {note.appointment_id == null
                                                ? 'Patient-level note'
                                                : `Appointment #${note.appointment_id}`}
                                        </p>
                                        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-clinic-ink">
                                            {note.note_text}
                                        </p>
                                        {(note.updated_at !== note.created_at ||
                                            note.updated_by_user_id !==
                                                note.author_user_id) && (
                                            <p className="mt-3 text-xs text-clinic-muted">
                                                Last edited{' '}
                                                {formatNoteDate(
                                                    note.updated_at,
                                                )}{' '}
                                                by{' '}
                                                {note.updatedByName ??
                                                    'Unknown (legacy editor)'}
                                            </p>
                                        )}
                                        {canWrite && (
                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    type="button"
                                                    aria-label={`Edit clinical note ${note.id}`}
                                                    className={buttonClass}
                                                    onClick={() => {
                                                        setNotice('')
                                                        setEditor(note)
                                                    }}>
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Delete clinical note ${note.id}`}
                                                    className={buttonClass}
                                                    onClick={() => {
                                                        setDeleteError('')
                                                        setDeleting(note)
                                                    }}>
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </article>
                                </li>
                            ))}
                        </ol>
                    )}
                    {feed.hasMore && feed.error?.statusCode !== 403 && (
                        <button
                            type="button"
                            disabled={feed.isValidating}
                            className={`${buttonClass} mt-4 w-full`}
                            onClick={() =>
                                void feed.loadMore().catch(() => undefined)
                            }>
                            {feed.isValidating
                                ? 'Loading notes…'
                                : 'Load older notes'}
                        </button>
                    )}
                </>
            )}
            {editor && (
                <ClinicalNoteForm
                    key={editor === 'new' ? 'new' : editor.id}
                    patient={patient}
                    note={editor === 'new' ? undefined : editor}
                    onClose={() => setEditor(null)}
                    onSave={save}
                />
            )}
            {deleting && (
                <AppointmentDialog
                    title="Delete clinical note?"
                    closeLabel="Close delete clinical note"
                    busy={busy}
                    onClose={() => setDeleting(null)}>
                    <div className="space-y-4 p-6">
                        <p className="text-sm text-clinic-ink">
                            Remove this note from the patient timeline? Its
                            clinical history is retained by the clinic.
                        </p>
                        {deleteError && (
                            <p role="alert" className="text-sm text-red-700">
                                {deleteError}
                            </p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy}
                                onClick={() => setDeleting(null)}>
                                Keep note
                            </button>
                            <button
                                type="button"
                                className={primaryClass}
                                disabled={busy || !canWrite}
                                onClick={() => void remove()}>
                                {busy ? 'Deleting…' : 'Delete note'}
                            </button>
                        </div>
                    </div>
                </AppointmentDialog>
            )}
        </section>
    )
}
export default PatientClinicalNotes
