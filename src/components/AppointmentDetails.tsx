import React, { useRef, useState } from 'react'
import {
    useAppointment,
    useAppointmentMutationSync,
} from '../hooks/appointments'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    appointmentStatusClasses,
    appointmentStatusLabels,
    appointmentTransitions,
    formatAppointmentRange,
    normalizeAppointmentFieldErrors,
} from '../lib/appointment-workflow'
import {
    Appointment,
    AppointmentStatus,
    cancelAppointment,
    checkInAppointment,
    completeAppointment,
    getAppointment,
    updateAppointment,
} from '../services/appointments'
import AppointmentDialog, {
    appointmentButtonClass,
    appointmentInputClass,
    appointmentPrimaryClass,
} from './AppointmentDialog'
import InputError from './InputError'

const actionLabels = {
    checked_in: 'Check in',
    in_progress: 'Start treatment',
    completed: 'Complete',
    cancelled: 'Cancel appointment',
    no_show: 'Mark no-show',
}

const AppointmentDetails = ({
    id,
    onClose,
    onEdit,
    onUpdated,
}: {
    id: number
    onClose: () => void
    onEdit: (appointment: Appointment) => void
    onUpdated: (saved: Appointment, previous: Appointment) => Promise<void>
}) => {
    const {
        data: appointment,
        error,
        isValidating,
        mutate,
        canView,
        canUpdate,
    } = useAppointment(id)
    const syncAppointment = useAppointmentMutationSync()
    const [pending, setPending] = useState<AppointmentStatus | null>(null)
    const [confirming, setConfirming] = useState<AppointmentStatus | null>(null)
    const [reason, setReason] = useState('')
    const [actionError, setActionError] = useState('')
    const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({})
    const [forbidden, setForbidden] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [needsRefresh, setNeedsRefresh] = useState(false)
    const mutationRef = useRef(false)
    const validActions = appointmentTransitions[appointment?.status] ?? []
    const busy = pending !== null || refreshing
    const confirmationAllowed = confirming && validActions.includes(confirming)

    const refreshSnapshot = async () => {
        if (!canView || !appointment) return
        setRefreshing(true)
        try {
            const latest = await getAppointment(id)
            await syncAppointment(latest, appointment)
            setNeedsRefresh(false)
        } catch {
            // Preserve the original action error and block writes to a stale snapshot.
            setNeedsRefresh(true)
        } finally {
            setRefreshing(false)
        }
    }
    const applyStatus = async (next: AppointmentStatus) => {
        if (
            mutationRef.current ||
            !appointment ||
            !canView ||
            !canUpdate ||
            forbidden ||
            refreshing ||
            needsRefresh ||
            isValidating ||
            !validActions.includes(next)
        )
            return
        if (next === 'cancelled' && reason.length > 2000) {
            setFieldErrors({
                cancellation_reason: ['Use at most 2000 characters.'],
            })
            return
        }
        mutationRef.current = true
        setPending(next)
        setActionError('')
        setFieldErrors({})
        try {
            const saved =
                next === 'checked_in'
                    ? await checkInAppointment(id)
                    : next === 'completed'
                    ? await completeAppointment(id)
                    : next === 'cancelled'
                    ? await cancelAppointment(id, reason.trim() || null)
                    : await updateAppointment(id, { status: next })
            await mutate(saved, false)
            await onUpdated(saved, appointment)
            setConfirming(null)
            setReason('')
        } catch (cause) {
            const apiError = normalizeAxiosError(cause)
            setActionError(apiError.message)
            setFieldErrors(normalizeAppointmentFieldErrors(apiError.errors))
            setForbidden(apiError.statusCode === 403)
            if (apiError.statusCode === 404) setNeedsRefresh(true)
            if (apiError.statusCode === 422 || apiError.statusCode === 409) {
                await refreshSnapshot()
            }
        } finally {
            mutationRef.current = false
            setPending(null)
        }
    }
    const field = (label: string, value: React.ReactNode) => (
        <div>
            <dt className="text-xs font-bold uppercase text-clinic-muted">
                {label}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-clinic-ink">
                {value || 'Not assigned'}
            </dd>
        </div>
    )

    return (
        <AppointmentDialog
            title="Appointment details"
            onClose={onClose}
            busy={busy}>
            <div className="space-y-5 px-6 py-5" aria-busy={busy}>
                {busy && (
                    <p
                        role="status"
                        className="text-sm font-bold text-clinic-blue">
                        {refreshing
                            ? 'Refreshing appointment...'
                            : 'Updating appointment...'}
                    </p>
                )}
                {!canView ? (
                    <p role="alert">
                        You do not have permission to view appointments.
                    </p>
                ) : error ? (
                    <div role="alert" className="text-sm text-rose-700">
                        <p>{error.message}</p>
                        <button
                            type="button"
                            disabled={isValidating}
                            onClick={() => void mutate()}
                            className={`${appointmentButtonClass} mt-3`}>
                            Retry appointment
                        </button>
                    </div>
                ) : !appointment ? (
                    <p role="status" className="text-sm text-clinic-muted">
                        Loading appointment...
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-extrabold text-clinic-ink">
                                    {appointment.patientName}
                                </h2>
                                <p className="mt-1 text-sm text-clinic-muted">
                                    {appointment.startsAt.slice(0, 10)} ·{' '}
                                    {formatAppointmentRange(appointment)} UTC
                                </p>
                            </div>
                            <span
                                className={`rounded-md px-3 py-1 text-sm font-bold ${
                                    appointmentStatusClasses[appointment.status]
                                }`}>
                                {appointmentStatusLabels[appointment.status]}
                            </span>
                        </div>
                        <dl className="grid gap-5 sm:grid-cols-2">
                            {field('Provider', appointment.dentistName)}
                            {field('Treatment', appointment.treatmentName)}
                            {field('Room', appointment.roomName)}
                            {field('Chair', appointment.chairName)}
                            {field(
                                'Duration',
                                `${appointment.duration_minutes} minutes`,
                            )}
                            {field('Payment', appointment.paymentStatus)}
                            {field(
                                'Appointment type',
                                appointment.appointment_type,
                            )}
                            {field(
                                'Description / notes',
                                appointment.description,
                            )}
                            {appointment.checked_in_at &&
                                field(
                                    'Checked in (UTC)',
                                    new Date(
                                        appointment.checked_in_at,
                                    ).toISOString(),
                                )}
                            {appointment.completed_at &&
                                field(
                                    'Completed (UTC)',
                                    new Date(
                                        appointment.completed_at,
                                    ).toISOString(),
                                )}
                            {appointment.cancelled_at &&
                                field(
                                    'Cancelled (UTC)',
                                    new Date(
                                        appointment.cancelled_at,
                                    ).toISOString(),
                                )}
                            {appointment.cancellation_reason &&
                                field(
                                    'Cancellation reason',
                                    appointment.cancellation_reason,
                                )}
                        </dl>
                        {(actionError ||
                            Object.values(fieldErrors).some(
                                messages => messages.length,
                            )) && (
                            <div
                                role="alert"
                                className="rounded-md bg-clinic-rose p-3 text-sm text-rose-700">
                                <p>{actionError}</p>
                                {Object.entries(fieldErrors).map(
                                    ([name, messages]) => (
                                        <InputError
                                            key={name}
                                            messages={messages}
                                            className="mt-2"
                                        />
                                    ),
                                )}
                                {needsRefresh && (
                                    <p className="mt-2">
                                        Refresh the appointment before trying
                                        another action.
                                    </p>
                                )}
                                {!forbidden && (
                                    <button
                                        type="button"
                                        disabled={busy || isValidating}
                                        onClick={() => void refreshSnapshot()}
                                        className={`${appointmentButtonClass} mt-3`}>
                                        Refresh appointment
                                    </button>
                                )}
                            </div>
                        )}
                        {canUpdate && !forbidden ? (
                            <>
                                <div className="flex flex-wrap gap-3 border-t border-clinic-line pt-4">
                                    <button
                                        type="button"
                                        disabled={
                                            busy || isValidating || needsRefresh
                                        }
                                        onClick={() => onEdit(appointment)}
                                        className={appointmentButtonClass}>
                                        Edit appointment
                                    </button>
                                    {validActions.map(next => (
                                        <button
                                            key={next}
                                            type="button"
                                            disabled={
                                                busy ||
                                                isValidating ||
                                                needsRefresh
                                            }
                                            className={
                                                next === 'cancelled' ||
                                                next === 'no_show'
                                                    ? appointmentButtonClass
                                                    : appointmentPrimaryClass
                                            }
                                            onClick={() => {
                                                if (
                                                    next === 'cancelled' ||
                                                    next === 'no_show'
                                                ) {
                                                    setConfirming(next)
                                                    setActionError('')
                                                    setFieldErrors({})
                                                } else void applyStatus(next)
                                            }}>
                                            {pending === next
                                                ? 'Updating...'
                                                : actionLabels[next]}
                                        </button>
                                    ))}
                                </div>
                                {confirmationAllowed && (
                                    <div className="space-y-3 rounded-md border border-clinic-line bg-clinic-canvas p-4">
                                        <p className="text-sm font-bold text-clinic-ink">
                                            {confirming === 'cancelled'
                                                ? 'Cancel this appointment and release its time slot?'
                                                : 'Mark this appointment as a no-show?'}
                                        </p>
                                        {confirming === 'cancelled' && (
                                            <label
                                                htmlFor="appointment-cancellation_reason"
                                                className="block text-sm text-clinic-muted">
                                                Cancellation reason (optional)
                                                <textarea
                                                    id="appointment-cancellation_reason"
                                                    name="cancellation_reason"
                                                    maxLength={2000}
                                                    rows={3}
                                                    value={reason}
                                                    disabled={busy}
                                                    aria-invalid={Boolean(
                                                        fieldErrors
                                                            .cancellation_reason
                                                            ?.length,
                                                    )}
                                                    aria-describedby="appointment-cancellation-reason-errors appointment-cancellation-reason-hint"
                                                    onChange={event => {
                                                        setReason(
                                                            event.target.value,
                                                        )
                                                        setFieldErrors(
                                                            previous => ({
                                                                ...previous,
                                                                cancellation_reason: [],
                                                            }),
                                                        )
                                                    }}
                                                    className={
                                                        appointmentInputClass
                                                    }
                                                />
                                                <span
                                                    id="appointment-cancellation-reason-hint"
                                                    className="mt-1 block text-xs">
                                                    Up to 2000 characters.
                                                </span>
                                                <span
                                                    id="appointment-cancellation-reason-errors"
                                                    className="mt-2 block text-sm text-red-600">
                                                    {fieldErrors.cancellation_reason?.join(
                                                        ' ',
                                                    )}
                                                </span>
                                            </label>
                                        )}
                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    setConfirming(null)
                                                }
                                                className={
                                                    appointmentButtonClass
                                                }>
                                                Keep appointment
                                            </button>
                                            <button
                                                type="button"
                                                disabled={
                                                    busy ||
                                                    isValidating ||
                                                    needsRefresh
                                                }
                                                onClick={() =>
                                                    void applyStatus(confirming)
                                                }
                                                className={
                                                    appointmentPrimaryClass
                                                }>
                                                {pending
                                                    ? 'Updating...'
                                                    : confirming === 'cancelled'
                                                    ? 'Confirm cancellation'
                                                    : 'Confirm no-show'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-clinic-muted">
                                Read-only appointment access.
                            </p>
                        )}
                    </>
                )}
            </div>
        </AppointmentDialog>
    )
}

export default AppointmentDetails
