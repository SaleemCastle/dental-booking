import React, { FormEvent, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { FiUploadCloud } from 'react-icons/fi'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import {
    documentAccept,
    documentMaxSizeKb,
    formatDocumentSize,
    validateDocumentFile,
} from '../lib/patient-documents'
import { formatNoteDate } from '../lib/clinical-notes'
import { Appointment, getAppointments } from '../services/appointments'
import { ClinicalNote, getClinicalNotes } from '../services/clinical-notes'
import {
    PatientDocument,
    uploadPatientDocument,
} from '../services/patient-documents'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'
import InputError from './InputError'

export default function PatientDocumentUpload({
    patient,
    tenantId,
    onClose,
    onUploaded,
}: {
    patient: Patient
    tenantId: number
    onClose: () => void
    onUploaded: (document: PatientDocument) => void
}) {
    const { user } = useAuthSession()
    const [file, setFile] = useState<File | null>(null)
    const [appointment, setAppointment] = useState('')
    const [note, setNote] = useState('')
    const [notes, setNotes] = useState<ClinicalNote[]>([])
    const [notePage, setNotePage] = useState(1)
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [message, setMessage] = useState('')
    const [progress, setProgress] = useState(0)
    const [busy, setBusy] = useState(false)
    const [forbidden, setForbidden] = useState(false)
    const [dragging, setDragging] = useState(false)
    const input = useRef<HTMLInputElement>(null)
    const request = useRef<AbortController | null>(null)
    useEffect(() => () => request.current?.abort(), [])
    const canBrowseAppointments = getUserPermissionSet(user).has(
        'appointments.view',
    )
    const appointments = useSWR<Appointment[], ApiError>(
        canBrowseAppointments
            ? ['document-appointments', user, patient.id]
            : null,
        async () =>
            (await getAppointments()).filter(
                item => item.patient_id === patient.id,
            ),
        { shouldRetryOnError: false },
    )
    const noteFeed = useSWR(
        ['document-notes', user, patient.id, notePage],
        () =>
            getClinicalNotes({
                patient_id: patient.id,
                page: notePage,
                per_page: 100,
            }),
        { shouldRetryOnError: false },
    )
    useEffect(() => {
        if (noteFeed.data)
            setNotes(current =>
                Array.from(
                    new Map(
                        [...current, ...noteFeed.data.notes].map(item => [
                            item.id,
                            item,
                        ]),
                    ).values(),
                ),
            )
    }, [noteFeed.data])
    const selectedNote = notes.find(item => String(item.id) === note)
    const availableNotes = notes.filter(
        item =>
            !appointment ||
            item.appointment_id == null ||
            String(item.appointment_id) === appointment,
    )
    const choose = (files: FileList | null) => {
        if (busy) return
        setMessage('')
        if (!files?.length) return
        if (files.length !== 1) {
            setFile(null)
            setErrors({ file: ['Upload one file at a time.'] })
            return
        }
        const selected = files[0]
        const error = validateDocumentFile(selected)
        setFile(error ? null : selected)
        setErrors(error ? { file: [error] } : {})
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (request.current || forbidden) return
        const error = file
            ? validateDocumentFile(file)
            : 'Choose a file to upload.'
        if (error) {
            setErrors({ file: [error] })
            input.current?.focus()
            return
        }
        setBusy(true)
        setProgress(0)
        setMessage('')
        setErrors({})
        const controller = new AbortController()
        request.current = controller
        try {
            const saved = await uploadPatientDocument(
                patient.id,
                {
                    file,
                    ...(appointment
                        ? { appointment_id: Number(appointment) }
                        : {}),
                    ...(note ? { clinical_note_id: Number(note) } : {}),
                },
                {
                    tenantId,
                    signal: controller.signal,
                    onProgress: setProgress,
                },
            )
            if (!controller.signal.aborted) onUploaded(saved)
        } catch (error) {
            if (controller.signal.aborted) return
            const failure = normalizeAxiosError(error)
            setErrors(failure.errors)
            setMessage(
                failure.statusCode === 413
                    ? 'The server rejected this upload as too large. Choose a smaller file.'
                    : failure.statusCode === 0
                    ? 'The upload could not be confirmed. Close this form and refresh documents before retrying, to avoid uploading a duplicate.'
                    : failure.message,
            )
            setForbidden([401, 403, 404].includes(failure.statusCode))
        } finally {
            request.current = null
            if (!controller.signal.aborted) setBusy(false)
        }
    }
    return (
        <AppointmentDialog
            title="Upload patient document"
            closeLabel="Close document upload"
            busy={busy}
            onClose={onClose}
            initialFocus={input}>
            <form onSubmit={submit} noValidate className="space-y-5 p-6">
                <p className="text-sm font-bold text-clinic-ink">
                    Patient: {patient.firstName} {patient.lastName}
                </p>
                {message && (
                    <p role="alert" className="text-sm text-red-700">
                        {message}
                    </p>
                )}
                <fieldset disabled={busy || forbidden} className="space-y-5">
                    <div
                        onDragOver={event => {
                            event.preventDefault()
                            if (!busy) setDragging(true)
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={event => {
                            event.preventDefault()
                            setDragging(false)
                            if (!busy && input.current)
                                input.current.files = event.dataTransfer.files
                            choose(event.dataTransfer.files)
                        }}
                        className={`rounded-lg border-2 border-dashed p-6 text-center ${
                            dragging
                                ? 'border-clinic-blue bg-clinic-sky'
                                : 'border-clinic-line bg-clinic-canvas'
                        }`}>
                        <FiUploadCloud
                            aria-hidden="true"
                            className="mx-auto h-8 w-8 text-clinic-blue"
                        />
                        <label
                            htmlFor="patient-document-file"
                            className="mt-3 block text-sm font-bold text-clinic-ink">
                            Drag a file here or browse
                        </label>
                        <input
                            ref={input}
                            id="patient-document-file"
                            name="file"
                            type="file"
                            accept={documentAccept}
                            aria-invalid={Boolean(errors.file?.length)}
                            aria-describedby="document-file-help document-file-error"
                            className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:font-bold file:text-clinic-blue"
                            onChange={event => choose(event.target.files)}
                        />
                        <p
                            id="document-file-help"
                            className="mt-3 text-xs text-clinic-muted">
                            PDF, JPEG, PNG or WebP. One nonempty file, up to{' '}
                            {formatDocumentSize(documentMaxSizeKb * 1024)}. The
                            clinic verifies file contents and its configured
                            limit.
                        </p>
                        {file && (
                            <p className="mt-3 break-all text-sm font-semibold text-clinic-ink">
                                {file.name} ({formatDocumentSize(file.size)})
                            </p>
                        )}
                        <div
                            id="document-file-error"
                            role={errors.file?.length ? 'alert' : undefined}>
                            <InputError messages={errors.file} />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-bold text-clinic-ink">
                            Appointment (optional)
                            <select
                                name="appointment_id"
                                value={appointment}
                                className={inputClass}
                                disabled={
                                    !canBrowseAppointments || !appointments.data
                                }
                                onChange={event => {
                                    setAppointment(event.target.value)
                                    if (
                                        selectedNote?.appointment_id != null &&
                                        event.target.value &&
                                        String(selectedNote.appointment_id) !==
                                            event.target.value
                                    )
                                        setNote('')
                                    setErrors({})
                                }}>
                                <option value="">No appointment</option>
                                {(appointments.data ?? []).map(item => (
                                    <option key={item.id} value={item.id}>
                                        #{item.id} ·{' '}
                                        {formatNoteDate(item.startsAt)}
                                    </option>
                                ))}
                            </select>
                            <InputError messages={errors.appointment_id} />
                        </label>
                        <label className="text-sm font-bold text-clinic-ink">
                            Clinical note (optional)
                            <select
                                name="clinical_note_id"
                                value={note}
                                className={inputClass}
                                onChange={event => {
                                    setNote(event.target.value)
                                    setErrors({})
                                }}>
                                <option value="">No clinical note</option>
                                {availableNotes.map(item => (
                                    <option key={item.id} value={item.id}>
                                        Note #{item.id} ·{' '}
                                        {formatNoteDate(item.created_at)}
                                        {item.appointment_id
                                            ? ` · Appointment #${item.appointment_id}`
                                            : ''}
                                    </option>
                                ))}
                            </select>
                            <InputError messages={errors.clinical_note_id} />
                        </label>
                    </div>
                    {!canBrowseAppointments && (
                        <p className="text-xs text-clinic-muted">
                            Appointment browsing requires appointment view
                            permission.
                        </p>
                    )}
                    {canBrowseAppointments &&
                        !appointments.data &&
                        !appointments.error && (
                            <p
                                role="status"
                                className="text-sm text-clinic-muted">
                                Loading appointments...
                            </p>
                        )}
                    {appointments.error && (
                        <p role="alert" className="text-sm text-red-700">
                            Appointments could not be loaded. You can upload
                            without a link.{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() =>
                                    void appointments
                                        .mutate()
                                        .catch(() => undefined)
                                }>
                                Retry appointments
                            </button>
                        </p>
                    )}
                    {!noteFeed.data && !noteFeed.error && (
                        <p role="status" className="text-sm text-clinic-muted">
                            Loading clinical notes...
                        </p>
                    )}
                    {noteFeed.error && (
                        <p role="alert" className="text-sm text-red-700">
                            Clinical notes could not be loaded. You can upload
                            without a note.{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() =>
                                    void noteFeed
                                        .mutate()
                                        .catch(() => undefined)
                                }>
                                Retry clinical notes
                            </button>
                        </p>
                    )}
                    {noteFeed.data &&
                        notePage < Number(noteFeed.data.meta.lastPage) && (
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => setNotePage(value => value + 1)}>
                                Load older clinical notes
                            </button>
                        )}
                    <p className="text-xs text-clinic-muted">
                        Links must belong to this patient. The clinic checks
                        them again when saving.
                    </p>
                </fieldset>
                {busy && (
                    <div
                        role="status"
                        className="space-y-2 text-sm text-clinic-ink">
                        <p>
                            {progress === 100
                                ? 'Upload received. Validating and saving...'
                                : `Uploading... ${progress}%`}
                        </p>
                        <progress
                            aria-label="Document upload progress"
                            max={100}
                            value={progress}
                            className="w-full"
                        />
                    </div>
                )}
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={busy}
                        onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={busy || forbidden || !file}
                        className={primaryClass}>
                        {busy ? 'Uploading...' : 'Upload document'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
