import React, { FormEvent, useRef, useState } from 'react'
import useSWR from 'swr'
import { ApiError, ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    getAppointmentFormValues,
    AppointmentFormValues,
    isTerminalAppointment,
    normalizeAppointmentFieldErrors,
    toAppointmentPayload,
    validateAppointmentForm,
} from '../lib/appointment-workflow'
import { useAppointmentPermissions } from '../hooks/appointments'
import {
    Appointment,
    AppointmentPayload,
    AppointmentProvider,
    getAppointmentProviders,
    getProviderName,
} from '../services/appointments'
import AppointmentDialog, {
    appointmentButtonClass,
    appointmentInputClass,
    appointmentPrimaryClass,
} from './AppointmentDialog'
import AppointmentPatientSelector from './AppointmentPatientSelector'
import AppointmentLocationSelector from './AppointmentLocationSelector'
import TreatmentSelector from './TreatmentSelector'
import InputError from './InputError'

const AppointmentForm = ({
    appointment,
    date,
    onClose,
    onSave,
}: {
    appointment: Appointment | null
    date: string
    onClose: () => void
    onSave: (payload: Partial<AppointmentPayload>) => Promise<void>
}) => {
    const { user, canView, canCreate, canUpdate } = useAppointmentPermissions()
    const [values, setValues] = useState(() =>
        getAppointmentFormValues(appointment, date),
    )
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [errorMessage, setErrorMessage] = useState('')
    const [saving, setSaving] = useState(false)
    const [forbidden, setForbidden] = useState(false)
    const savingRef = useRef(false)
    const formRef = useRef<HTMLFormElement>(null)
    const typeRef = useRef<HTMLInputElement>(null)
    const terminal = appointment && isTerminalAppointment(appointment.status)
    const canSave = appointment ? canUpdate : canCreate
    const {
        data: providers,
        error: providerError,
        isValidating,
        mutate: retryProviders,
    } = useSWR<AppointmentProvider[], ApiError>(
        canView ? ['appointment-providers', user] : null,
        getAppointmentProviders,
        { shouldRetryOnError: false },
    )
    const providerChoices = providerError ? [] : providers ?? []
    const dirty =
        JSON.stringify(values) !==
        JSON.stringify(getAppointmentFormValues(appointment, date))

    const update = (changes: Partial<AppointmentFormValues>) => {
        setValues(previous => ({ ...previous, ...changes }))
        setErrors(previous => ({
            ...previous,
            ...Object.fromEntries(
                Object.keys(changes).map(field => [field, []]),
            ),
        }))
        setErrorMessage('')
    }
    const focusError = (nextErrors: ApiFieldErrors) => {
        const element = formRef.current?.elements.namedItem(
            Object.keys(nextErrors)[0],
        )
        if (element instanceof HTMLElement) element.focus()
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (savingRef.current || !canSave || forbidden) return
        const nextErrors = validateAppointmentForm(values)
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length) {
            focusError(nextErrors)
            return
        }
        savingRef.current = true
        setSaving(true)
        setErrorMessage('')
        try {
            await onSave(toAppointmentPayload(values, appointment))
        } catch (error) {
            const apiError = normalizeAxiosError(error)
            const fieldErrors = normalizeAppointmentFieldErrors(apiError.errors)
            setErrors(fieldErrors)
            setErrorMessage(apiError.message)
            setForbidden(apiError.statusCode === 403)
            focusError(fieldErrors)
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }
    const renderInput = (
        field:
            | 'appointment_type'
            | 'appointment_date_time'
            | 'duration_minutes',
        label: string,
        props: React.InputHTMLAttributes<HTMLInputElement> = {},
    ) => (
        <label
            htmlFor={`appointment-${field}`}
            className="block text-sm font-bold text-clinic-ink">
            {label}
            <input
                {...props}
                ref={field === 'appointment_type' ? typeRef : undefined}
                id={`appointment-${field}`}
                name={field}
                value={values[field]}
                required
                className={appointmentInputClass}
                aria-invalid={Boolean(errors[field]?.length)}
                aria-describedby={`appointment-${field}-errors`}
                onChange={event => update({ [field]: event.target.value })}
            />
            <div id={`appointment-${field}-errors`}>
                <InputError messages={errors[field]} className="mt-2" />
            </div>
        </label>
    )

    return (
        <AppointmentDialog
            title={appointment ? 'Edit appointment' : 'Book appointment'}
            onClose={onClose}
            busy={saving}
            initialFocus={typeRef}>
            <form ref={formRef} noValidate onSubmit={submit}>
                <div className="space-y-5 px-6 py-5">
                    <p className="text-sm text-clinic-muted">
                        All dates and times are in UTC.{' '}
                        {appointment
                            ? 'Save changes to update the schedule.'
                            : 'New appointments start as scheduled.'}
                    </p>
                    {terminal && (
                        <p className="rounded-md bg-clinic-canvas p-3 text-sm text-clinic-muted">
                            This appointment is closed. You can update its type
                            and description; scheduling fields are locked.
                        </p>
                    )}
                    {(errorMessage ||
                        Object.values(errors).some(
                            messages => messages.length,
                        )) && (
                        <div
                            role="alert"
                            className="rounded-md bg-clinic-rose p-3 text-sm text-rose-700">
                            <p className="font-bold">
                                {errorMessage ||
                                    'Please review the highlighted fields.'}
                            </p>
                            <ul className="mt-2 list-inside list-disc">
                                {Object.entries(
                                    errors,
                                ).flatMap(([field, messages]) =>
                                    messages.map((message, index) => (
                                        <li key={`${field}-${index}`}>
                                            {message}
                                        </li>
                                    )),
                                )}
                            </ul>
                        </div>
                    )}
                    {!canSave && (
                        <p role="alert" className="text-sm text-rose-700">
                            You do not have permission to save appointments.
                        </p>
                    )}
                    <fieldset
                        disabled={saving || !canSave || forbidden}
                        className="space-y-5">
                        {renderInput('appointment_type', 'Appointment type', {
                            maxLength: 255,
                            placeholder: 'Consultation, cleaning, follow-up',
                        })}
                        <fieldset
                            disabled={Boolean(terminal)}
                            className="space-y-5">
                            <div className="grid gap-5 sm:grid-cols-2">
                                <AppointmentPatientSelector
                                    value={values.patient_id}
                                    onChange={patient_id =>
                                        update({ patient_id })
                                    }
                                    disabled={saving || Boolean(terminal)}
                                    errors={errors.patient_id}
                                    current={
                                        appointment
                                            ? {
                                                  id: appointment.patient_id,
                                                  name: appointment.patientName,
                                              }
                                            : undefined
                                    }
                                />
                                <div>
                                    <label
                                        htmlFor="appointment-dentist_id"
                                        className="block text-sm font-bold text-clinic-ink">
                                        Provider
                                        <select
                                            id="appointment-dentist_id"
                                            name="dentist_id"
                                            value={values.dentist_id}
                                            required
                                            disabled={
                                                !providers ||
                                                Boolean(providerError) ||
                                                saving ||
                                                Boolean(terminal)
                                            }
                                            className={appointmentInputClass}
                                            aria-invalid={Boolean(
                                                errors.dentist_id?.length,
                                            )}
                                            aria-describedby="appointment-provider-errors"
                                            onChange={event =>
                                                update({
                                                    dentist_id:
                                                        event.target.value,
                                                })
                                            }>
                                            <option value="">
                                                {!providers && !providerError
                                                    ? 'Loading providers...'
                                                    : providerChoices.length
                                                    ? 'Choose a provider'
                                                    : 'No providers available'}
                                            </option>
                                            {values.dentist_id &&
                                                !providerChoices.some(
                                                    provider =>
                                                        String(provider.id) ===
                                                        values.dentist_id,
                                                ) && (
                                                    <option
                                                        value={
                                                            values.dentist_id
                                                        }>
                                                        {appointment?.dentistName ??
                                                            `Provider #${values.dentist_id}`}{' '}
                                                        (current)
                                                    </option>
                                                )}
                                            {providerChoices.map(provider => (
                                                <option
                                                    key={provider.id}
                                                    value={provider.id}>
                                                    {getProviderName(provider)}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <div id="appointment-provider-errors">
                                        <InputError
                                            messages={errors.dentist_id}
                                            className="mt-2"
                                        />
                                    </div>
                                    {providerError && (
                                        <div
                                            role="alert"
                                            className="mt-2 text-sm text-rose-700">
                                            {providerError.message}{' '}
                                            <button
                                                type="button"
                                                disabled={isValidating}
                                                className={
                                                    appointmentButtonClass
                                                }
                                                onClick={() =>
                                                    void retryProviders()
                                                }>
                                                Retry providers
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <TreatmentSelector
                                id="appointment-treatment_id"
                                name="treatment_id"
                                value={
                                    values.treatment_id
                                        ? Number(values.treatment_id)
                                        : null
                                }
                                disabled={saving || Boolean(terminal)}
                                errorMessage={errors.treatment_id?.join(' ')}
                                retainedTreatment={
                                    appointment?.treatment_id != null
                                        ? {
                                              id: appointment.treatment_id,
                                              name:
                                                  appointment.treatmentName ??
                                                  `Treatment #${appointment.treatment_id}`,
                                          }
                                        : undefined
                                }
                                onRetainTreatment={() =>
                                    update({
                                        treatment_id: String(
                                            appointment.treatment_id,
                                        ),
                                        duration_minutes: String(
                                            appointment.duration_minutes,
                                        ),
                                    })
                                }
                                onChange={treatment =>
                                    update({
                                        treatment_id: treatment
                                            ? String(treatment.id)
                                            : '',
                                        ...(treatment
                                            ? {
                                                  duration_minutes: String(
                                                      treatment.duration_minutes,
                                                  ),
                                              }
                                            : {}),
                                    })
                                }
                            />
                            <div className="grid gap-5 sm:grid-cols-2">
                                {renderInput(
                                    'appointment_date_time',
                                    'Start date and time (UTC)',
                                    { type: 'datetime-local' },
                                )}
                                {renderInput(
                                    'duration_minutes',
                                    'Duration (minutes)',
                                    {
                                        type: 'number',
                                        min: 1,
                                        max: 1440,
                                        step: 1,
                                    },
                                )}
                            </div>
                            <AppointmentLocationSelector
                                roomId={values.room_id}
                                chairId={values.chair_id}
                                current={appointment}
                                disabled={saving || Boolean(terminal)}
                                errors={errors}
                                onChange={(room_id, chair_id) =>
                                    update({ room_id, chair_id })
                                }
                            />
                        </fieldset>
                        <label
                            htmlFor="appointment-description"
                            className="block text-sm font-bold text-clinic-ink">
                            Description / notes
                            <textarea
                                id="appointment-description"
                                name="description"
                                rows={4}
                                required
                                value={values.description}
                                className={appointmentInputClass}
                                aria-invalid={Boolean(
                                    errors.description?.length,
                                )}
                                aria-describedby="appointment-description-errors"
                                onChange={event =>
                                    update({ description: event.target.value })
                                }
                            />
                            <div id="appointment-description-errors">
                                <InputError
                                    messages={errors.description}
                                    className="mt-2"
                                />
                            </div>
                        </label>
                    </fieldset>
                </div>
                <div className="flex justify-end gap-3 border-t border-clinic-line px-6 py-4">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={onClose}
                        className={appointmentButtonClass}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={
                            saving ||
                            !canSave ||
                            forbidden ||
                            (Boolean(appointment) && !dirty)
                        }
                        className={appointmentPrimaryClass}>
                        {saving
                            ? 'Saving...'
                            : appointment
                            ? 'Save changes'
                            : 'Book appointment'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}

export default AppointmentForm
