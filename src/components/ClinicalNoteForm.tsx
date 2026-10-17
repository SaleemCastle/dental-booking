import React, { FormEvent, useRef, useState } from 'react'
import useSWR from 'swr'
import { ApiError, ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import {
    clinicalNotePayload,
    clinicalNoteValues,
    formatNoteDate,
    validateClinicalNote,
} from '../lib/clinical-notes'
import { useClinicalNotePermissions } from '../hooks/clinical-notes'
import { ClinicalNote, ClinicalNotePayload } from '../services/clinical-notes'
import {
    Appointment,
    AppointmentProvider,
    getAppointments,
    getAppointmentProviders,
    getProviderName,
} from '../services/appointments'
import { appointmentStatusLabels } from '../lib/appointment-workflow'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'
import InputError from './InputError'

const ClinicalNoteForm = ({
    patient,
    note,
    onClose,
    onSave,
}: {
    patient: Patient
    note?: ClinicalNote
    onClose: () => void
    onSave: (payload: Partial<ClinicalNotePayload>) => Promise<void>
}) => {
    const { user, canWrite } = useClinicalNotePermissions()
    const [values, setValues] = useState(() => clinicalNoteValues(note))
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [errorMessage, setErrorMessage] = useState('')
    const [saving, setSaving] = useState(false)
    const [forbidden, setForbidden] = useState(false)
    const savingRef = useRef(false)
    const textRef = useRef<HTMLTextAreaElement>(null)
    const formRef = useRef<HTMLFormElement>(null)
    const canViewAppointments = getUserPermissionSet(user).has(
        'appointments.view',
    )
    const providers = useSWR<AppointmentProvider[], ApiError>(
        canWrite ? ['appointment-providers', user] : null,
        getAppointmentProviders,
        { shouldRetryOnError: false },
    )
    const appointments = useSWR<Appointment[], ApiError>(
        canWrite && canViewAppointments
            ? ['clinical-note-appointments', user, patient.id]
            : null,
        async () =>
            (await getAppointments()).filter(
                item => item.patient_id === patient.id,
            ),
        { shouldRetryOnError: false },
    )
    const selectedAppointment = appointments.data?.find(
        item => String(item.id) === values.appointment_id,
    )
    const changed =
        Object.keys(clinicalNotePayload(patient.id, values, note)).length > 0
    const update = (changes: Partial<typeof values>) => {
        setValues(current => ({ ...current, ...changes }))
        setErrors({})
        setErrorMessage('')
    }
    const focusError = (fieldErrors: ApiFieldErrors) => {
        const element = formRef.current?.elements.namedItem(
            Object.keys(fieldErrors)[0],
        )
        if (element instanceof HTMLElement) element.focus()
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (savingRef.current || !canWrite || forbidden || !changed) return
        const validation = validateClinicalNote(values)
        setErrors(validation)
        if (Object.keys(validation).length) {
            focusError(validation)
            return
        }
        savingRef.current = true
        setSaving(true)
        setErrorMessage('')
        try {
            await onSave(clinicalNotePayload(patient.id, values, note))
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setErrors(failure.errors)
            setErrorMessage(failure.message)
            setForbidden(
                failure.statusCode === 403 || failure.statusCode === 404,
            )
            focusError(failure.errors)
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }
    return (
        <AppointmentDialog
            title={note ? 'Edit clinical note' : 'Add visit note'}
            closeLabel="Close clinical note"
            initialFocus={textRef}
            busy={saving}
            onClose={onClose}>
            <form
                ref={formRef}
                onSubmit={submit}
                noValidate
                className="space-y-5 p-6">
                <p className="text-sm font-bold text-clinic-ink">
                    Patient: {patient.firstName} {patient.lastName}
                </p>
                {note && (
                    <p className="text-xs text-clinic-muted">
                        Original author:{' '}
                        {note.authorName ?? 'Unknown (legacy note)'}. Created{' '}
                        {formatNoteDate(note.created_at)}.
                    </p>
                )}
                {(!canWrite || forbidden) && (
                    <p role="alert" className="text-sm text-red-700">
                        {!canWrite
                            ? 'You do not have permission to edit clinical notes.'
                            : 'This note cannot be saved. Close the form and refresh the notes.'}
                    </p>
                )}
                {errorMessage && (
                    <p role="alert" className="text-sm text-red-700">
                        {errorMessage}
                    </p>
                )}
                <InputError messages={errors.patient_id} />
                <fieldset
                    disabled={saving || !canWrite || forbidden}
                    className="space-y-5">
                    <div>
                        <label
                            htmlFor="clinical-note-appointment"
                            className="text-sm font-bold text-clinic-ink">
                            Appointment (optional)
                        </label>
                        <select
                            id="clinical-note-appointment"
                            name="appointment_id"
                            className={inputClass}
                            value={values.appointment_id}
                            aria-invalid={Boolean(
                                errors.appointment_id?.length,
                            )}
                            aria-describedby="clinical-note-appointment-help clinical-note-appointment-error"
                            onChange={event => {
                                const appointment = appointments.data?.find(
                                    item =>
                                        String(item.id) === event.target.value,
                                )
                                update({
                                    appointment_id: event.target.value,
                                    ...(appointment
                                        ? {
                                              dentist_id: String(
                                                  appointment.dentist_id,
                                              ),
                                          }
                                        : {}),
                                })
                            }}>
                            <option value="">
                                Patient-level note — no appointment
                            </option>
                            {values.appointment_id && !selectedAppointment && (
                                <option value={values.appointment_id}>
                                    Appointment #{values.appointment_id}{' '}
                                    (current link)
                                </option>
                            )}
                            {(appointments.data ?? []).map(item => (
                                <option key={item.id} value={item.id}>
                                    #{item.id} · {formatNoteDate(item.startsAt)}{' '}
                                    · {item.dentistName} ·{' '}
                                    {appointmentStatusLabels[item.status]}
                                </option>
                            ))}
                        </select>
                        <p
                            id="clinical-note-appointment-help"
                            className="mt-2 text-xs text-clinic-muted">
                            {canViewAppointments
                                ? 'All visit statuses are available. Linking a visit uses its provider. Choose no appointment to detach an existing link.'
                                : 'Appointment browsing requires appointment view permission. You can keep or detach an existing link.'}
                        </p>
                        <div id="clinical-note-appointment-error">
                            <InputError messages={errors.appointment_id} />
                        </div>
                        {canViewAppointments &&
                            !appointments.data &&
                            !appointments.error && (
                                <p
                                    role="status"
                                    className="mt-2 text-sm text-clinic-muted">
                                    Loading appointments…
                                </p>
                            )}
                        {appointments.error && (
                            <div
                                role="alert"
                                className="mt-2 text-sm text-red-700">
                                Appointments could not be loaded. You can still
                                save a patient-level note or retain the current
                                link.{' '}
                                <button
                                    type="button"
                                    className={`${buttonClass} ml-2`}
                                    onClick={() =>
                                        void appointments
                                            .mutate()
                                            .catch(() => undefined)
                                    }>
                                    Retry appointments
                                </button>
                            </div>
                        )}
                        {appointments.data?.length === 0 && (
                            <p className="mt-2 text-xs text-clinic-muted">
                                No appointments for this patient.
                            </p>
                        )}
                    </div>
                    <div>
                        <label
                            htmlFor="clinical-note-provider"
                            className="text-sm font-bold text-clinic-ink">
                            Provider
                        </label>
                        <select
                            id="clinical-note-provider"
                            name="dentist_id"
                            className={inputClass}
                            value={values.dentist_id}
                            disabled={Boolean(values.appointment_id)}
                            aria-invalid={Boolean(errors.dentist_id?.length)}
                            aria-describedby="clinical-note-provider-error"
                            onChange={event =>
                                update({ dentist_id: event.target.value })
                            }>
                            <option value="">Select provider</option>
                            {values.dentist_id &&
                                !providers.data?.some(
                                    item =>
                                        String(item.id) === values.dentist_id,
                                ) && (
                                    <option value={values.dentist_id}>
                                        {selectedAppointment?.dentistName ??
                                            `Provider #${values.dentist_id}`}
                                    </option>
                                )}
                            {(providers.data ?? []).map(item => (
                                <option key={item.id} value={item.id}>
                                    {getProviderName(item)}
                                </option>
                            ))}
                        </select>
                        <div id="clinical-note-provider-error">
                            <InputError messages={errors.dentist_id} />
                        </div>
                        {!providers.data && !providers.error && (
                            <p
                                role="status"
                                className="mt-2 text-sm text-clinic-muted">
                                Loading providers…
                            </p>
                        )}
                        {providers.error && (
                            <div
                                role="alert"
                                className="mt-2 text-sm text-red-700">
                                Providers could not be loaded.{' '}
                                {providers.error.message}{' '}
                                <button
                                    type="button"
                                    className={`${buttonClass} ml-2`}
                                    onClick={() =>
                                        void providers
                                            .mutate()
                                            .catch(() => undefined)
                                    }>
                                    Retry providers
                                </button>
                            </div>
                        )}
                        {providers.data?.length === 0 && (
                            <p className="mt-2 text-sm text-clinic-muted">
                                No providers available. A provider is required
                                to create a note.
                            </p>
                        )}
                    </div>
                    <div>
                        <label
                            htmlFor="clinical-note-text"
                            className="text-sm font-bold text-clinic-ink">
                            Clinical note
                        </label>
                        <textarea
                            id="clinical-note-text"
                            name="note_text"
                            ref={textRef}
                            rows={8}
                            value={values.note_text}
                            className={inputClass}
                            aria-invalid={Boolean(errors.note_text?.length)}
                            aria-describedby="clinical-note-text-error clinical-note-text-count"
                            onChange={event =>
                                update({ note_text: event.target.value })
                            }
                        />
                        <div id="clinical-note-text-error">
                            <InputError messages={errors.note_text} />
                        </div>
                        <p
                            id="clinical-note-text-count"
                            className="mt-2 text-xs text-clinic-muted">
                            {Array.from(
                                values.note_text,
                            ).length.toLocaleString()}{' '}
                            / 16,000 characters
                        </p>
                    </div>
                </fieldset>
                <div className="flex justify-end gap-3 border-t border-clinic-line pt-4">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={onClose}
                        className={buttonClass}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={saving || !canWrite || forbidden || !changed}
                        className={primaryClass}>
                        {saving
                            ? 'Saving…'
                            : note
                            ? 'Save changes'
                            : 'Save note'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
export default ClinicalNoteForm
