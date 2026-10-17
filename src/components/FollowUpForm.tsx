import React, { FormEvent, useRef, useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import {
    TaskValues,
    taskPayload,
    taskPriorityLabels,
    validateTask,
} from '../lib/tasks'
import { formatNoteDate } from '../lib/clinical-notes'
import { appointmentStatusLabels } from '../lib/appointment-workflow'
import { Appointment, getAppointments } from '../services/appointments'
import { TaskAssignee, TaskPayload, getTaskAssignees } from '../services/tasks'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'
import InputError from './InputError'

const FollowUpForm = ({
    patient,
    canCreate,
    onSave,
    onClose,
}: {
    patient: Patient
    canCreate: boolean
    onSave: (payload: TaskPayload) => Promise<void>
    onClose: () => void
}) => {
    const { user, status } = useAuthSession()
    const permissions = getUserPermissionSet(
        status === 'authenticated' ? user : null,
    )
    const allowed = canCreate && permissions.has('tasks.create')
    const canViewAppointments = permissions.has('appointments.view')
    const currentUserId = Number(user?.id)
    const self =
        Number.isSafeInteger(currentUserId) && currentUserId > 0
            ? { id: currentUserId, name: `${user?.name ?? 'Me'} (me)` }
            : null
    const [values, setValues] = useState<TaskValues>({
        appointment_id: '',
        assignee_id: self ? String(self.id) : '',
        due_date: '',
        priority: 'normal',
        description: '',
    })
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [message, setMessage] = useState('')
    const [saving, setSaving] = useState(false)
    const [forbidden, setForbidden] = useState(false)
    const lock = useRef(false)
    const textRef = useRef<HTMLTextAreaElement>(null)
    const formRef = useRef<HTMLFormElement>(null)
    const assignees = useSWR<TaskAssignee[], ApiError>(
        allowed && !forbidden ? ['task-assignees', user] : null,
        getTaskAssignees,
        { shouldRetryOnError: false },
    )
    const appointments = useSWR<Appointment[], ApiError>(
        allowed && !forbidden && canViewAppointments
            ? ['follow-up-appointments', user, patient.id]
            : null,
        async () =>
            (await getAppointments()).filter(
                item => item.patient_id === patient.id,
            ),
        { shouldRetryOnError: false },
    )
    const directory = assignees.error ? [] : assignees.data ?? []
    const options = self
        ? [self, ...directory.filter(item => item.id !== self.id)]
        : directory
    const visits =
        canViewAppointments && !appointments.error
            ? appointments.data ?? []
            : []
    const update = (field: keyof TaskValues, value: string) => {
        setValues(current => ({ ...current, [field]: value }))
        setErrors({})
        setMessage('')
    }
    const focusError = (fields: ApiFieldErrors) => {
        const element = formRef.current?.elements.namedItem(
            Object.keys(fields)[0],
        )
        if (element instanceof HTMLElement) element.focus()
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (lock.current || !allowed || forbidden) return
        const validation = validateTask(values)
        if (
            values.appointment_id &&
            !visits.some(item => String(item.id) === values.appointment_id)
        )
            validation.appointment_id = [
                'Choose an available appointment for this patient or no appointment.',
            ]
        if (
            values.assignee_id &&
            !options.some(item => String(item.id) === values.assignee_id)
        )
            validation.assignee_id = ['Choose an available assignee.']
        setErrors(validation)
        if (Object.keys(validation).length) {
            focusError(validation)
            return
        }
        lock.current = true
        setSaving(true)
        setMessage('')
        try {
            await onSave(taskPayload(patient.id, values))
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setErrors(failure.errors)
            setMessage(failure.message)
            if ([403, 404].includes(failure.statusCode)) setForbidden(true)
            focusError(failure.errors)
        } finally {
            lock.current = false
            setSaving(false)
        }
    }
    const fieldError = (field: string) => (
        <div id={`follow-up-${field}-error`}>
            <InputError messages={errors[field]} />
        </div>
    )
    const fieldProps = (field: string) => ({
        id: `follow-up-${field}`,
        name: field,
        className: inputClass,
        'aria-invalid': Boolean(errors[field]?.length),
        'aria-describedby': `follow-up-${field}-error`,
    })
    return (
        <AppointmentDialog
            title="Create follow-up"
            closeLabel="Close follow-up"
            busy={saving}
            initialFocus={textRef}
            onClose={onClose}>
            <form
                ref={formRef}
                onSubmit={submit}
                noValidate
                className="space-y-5 p-6">
                <p className="text-sm font-bold text-clinic-ink">
                    Patient: {patient.firstName} {patient.lastName}
                </p>
                {(!allowed || forbidden) && (
                    <p role="alert" className="text-sm text-red-700">
                        This follow-up cannot be saved. Close the form and
                        refresh follow-ups to check your access.
                    </p>
                )}
                {message && (
                    <p role="alert" className="text-sm text-red-700">
                        {message}
                    </p>
                )}
                {fieldError('patient_id')}
                <fieldset
                    disabled={saving || !allowed || forbidden}
                    className="space-y-5">
                    <div>
                        <label
                            htmlFor="follow-up-description"
                            className="text-sm font-bold text-clinic-ink">
                            Description
                        </label>
                        <textarea
                            {...fieldProps('description')}
                            ref={textRef}
                            rows={5}
                            value={values.description}
                            onChange={event =>
                                update('description', event.target.value)
                            }
                        />
                        {fieldError('description')}
                        <p className="mt-1 text-xs text-clinic-muted">
                            {Array.from(
                                values.description,
                            ).length.toLocaleString()}{' '}
                            / 16,000 characters
                        </p>
                    </div>
                    <div>
                        <label
                            htmlFor="follow-up-assignee_id"
                            className="text-sm font-bold text-clinic-ink">
                            Assignee
                        </label>
                        <select
                            {...fieldProps('assignee_id')}
                            value={values.assignee_id}
                            onChange={event =>
                                update('assignee_id', event.target.value)
                            }>
                            <option value="">Select assignee</option>
                            {values.assignee_id &&
                                !options.some(
                                    item =>
                                        String(item.id) === values.assignee_id,
                                ) && (
                                    <option value={values.assignee_id} disabled>
                                        Assignee unavailable
                                    </option>
                                )}
                            {options.map(item => (
                                <option key={item.id} value={item.id}>
                                    {item.name || `Staff #${item.id}`}
                                </option>
                            ))}
                        </select>
                        {fieldError('assignee_id')}
                        {!assignees.data && !assignees.error && (
                            <p
                                role="status"
                                className="mt-2 text-xs text-clinic-muted">
                                Loading assignees...
                            </p>
                        )}
                        {assignees.error && (
                            <div
                                role="alert"
                                className="mt-2 text-sm text-red-700">
                                Assignees could not be loaded.{' '}
                                {assignees.error.message}{' '}
                                {self &&
                                    'You can still assign this follow-up to yourself.'}{' '}
                                <button
                                    type="button"
                                    className={buttonClass}
                                    onClick={() =>
                                        void assignees
                                            .mutate()
                                            .catch(() => undefined)
                                    }>
                                    Retry assignees
                                </button>
                            </div>
                        )}
                        {assignees.data?.length === 0 && !self && (
                            <p className="mt-2 text-sm text-clinic-muted">
                                No assignees available. An assignee is required.
                            </p>
                        )}
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                            <label
                                htmlFor="follow-up-due_date"
                                className="text-sm font-bold text-clinic-ink">
                                Due date (UTC)
                            </label>
                            <input
                                {...fieldProps('due_date')}
                                type="date"
                                value={values.due_date}
                                onChange={event =>
                                    update('due_date', event.target.value)
                                }
                            />
                            {fieldError('due_date')}
                        </div>
                        <div>
                            <label
                                htmlFor="follow-up-priority"
                                className="text-sm font-bold text-clinic-ink">
                                Priority
                            </label>
                            <select
                                {...fieldProps('priority')}
                                value={values.priority}
                                onChange={event =>
                                    update('priority', event.target.value)
                                }>
                                {Object.entries(taskPriorityLabels).map(
                                    ([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ),
                                )}
                            </select>
                            {fieldError('priority')}
                        </div>
                    </div>
                    <div>
                        <label
                            htmlFor="follow-up-appointment_id"
                            className="text-sm font-bold text-clinic-ink">
                            Appointment (optional)
                        </label>
                        <select
                            {...fieldProps('appointment_id')}
                            value={values.appointment_id}
                            onChange={event =>
                                update('appointment_id', event.target.value)
                            }>
                            <option value="">
                                Patient follow-up - no appointment
                            </option>
                            {values.appointment_id &&
                                !visits.some(
                                    item =>
                                        String(item.id) ===
                                        values.appointment_id,
                                ) && (
                                    <option
                                        value={values.appointment_id}
                                        disabled>
                                        Appointment unavailable
                                    </option>
                                )}
                            {visits.map(item => (
                                <option key={item.id} value={item.id}>
                                    #{item.id} · {formatNoteDate(item.startsAt)}{' '}
                                    · {appointmentStatusLabels[item.status]}
                                </option>
                            ))}
                        </select>
                        {fieldError('appointment_id')}
                        {!canViewAppointments && (
                            <p className="mt-2 text-xs text-clinic-muted">
                                Appointment browsing requires appointment view
                                permission. You can create a patient-level
                                follow-up.
                            </p>
                        )}
                        {canViewAppointments &&
                            !appointments.data &&
                            !appointments.error && (
                                <p
                                    role="status"
                                    className="mt-2 text-xs text-clinic-muted">
                                    Loading appointments...
                                </p>
                            )}
                        {appointments.error && (
                            <div
                                role="alert"
                                className="mt-2 text-sm text-red-700">
                                Appointments could not be loaded.{' '}
                                {appointments.error.message} You can still
                                choose no appointment.{' '}
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
                            </div>
                        )}
                        {canViewAppointments &&
                            appointments.data?.length === 0 && (
                                <p className="mt-2 text-xs text-clinic-muted">
                                    No appointments for this patient.
                                </p>
                            )}
                    </div>
                </fieldset>
                <div className="flex justify-end gap-3 border-t border-clinic-line pt-4">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={saving}
                        onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className={primaryClass}
                        disabled={saving || !allowed || forbidden}>
                        {saving ? 'Saving...' : 'Save follow-up'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
export default FollowUpForm
