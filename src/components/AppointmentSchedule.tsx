import React, { useRef, useState } from 'react'
import {
    FiChevronLeft,
    FiChevronRight,
    FiPlus,
    FiRefreshCw,
} from 'react-icons/fi'
import { useAppointments } from '../hooks/appointments'
import {
    appointmentStatusClasses,
    appointmentStatusLabels,
    formatAppointmentRange,
    shiftScheduleDate,
    sortAppointments,
    utcToday,
} from '../lib/appointment-workflow'
import {
    Appointment,
    AppointmentPayload,
    createAppointment,
    updateAppointment,
} from '../services/appointments'
import AppointmentDetails from './AppointmentDetails'
import AppointmentForm from './AppointmentForm'
import {
    appointmentButtonClass,
    appointmentInputClass,
    appointmentPrimaryClass,
} from './AppointmentDialog'

const AppointmentSchedule = () => {
    const [date, setDate] = useState(utcToday)
    const [provider, setProvider] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [editor, setEditor] = useState<{
        appointment: Appointment | null
    } | null>(null)
    const [notice, setNotice] = useState('')
    const savingRef = useRef(false)
    const {
        appointments,
        error,
        isLoading,
        isValidating,
        retry,
        canView,
        canCreate,
        canUpdate,
        syncAppointment,
    } = useAppointments(date)
    const changeDate = (nextDate: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return
        setDate(nextDate)
        setProvider('')
        setSelectedId(null)
        setNotice('')
    }
    const save = async (payload: Partial<AppointmentPayload>) => {
        if (
            savingRef.current ||
            !editor ||
            (editor.appointment ? !canUpdate : !canCreate)
        )
            throw new Error(
                'You do not have permission to save this appointment.',
            )
        savingRef.current = true
        try {
            const saved = editor.appointment
                ? await updateAppointment(editor.appointment.id, payload)
                : await createAppointment(payload as AppointmentPayload)
            await syncAppointment(saved, editor.appointment)
            setDate(saved.startsAt.slice(0, 10))
            setProvider('')
            setStatusFilter('')
            setEditor(null)
            setSelectedId(saved.id)
            setNotice(
                editor.appointment
                    ? 'Appointment updated.'
                    : 'Appointment booked.',
            )
        } finally {
            savingRef.current = false
        }
    }
    if (!canView)
        return (
            <p role="alert" className="p-8 text-sm text-clinic-muted">
                You do not have permission to view the schedule.
            </p>
        )

    const all = appointments ?? []
    const providers = Array.from(
        new Map(
            all.map(appointment => [
                appointment.dentist_id,
                appointment.dentistName,
            ]),
        ).entries(),
    ).sort((a, b) => a[1].localeCompare(b[1]))
    const visible = sortAppointments(
        all.filter(
            appointment =>
                (!provider || appointment.dentist_id === Number(provider)) &&
                (!statusFilter || appointment.status === statusFilter),
        ),
    )
    return (
        <section aria-label="Daily appointment schedule" className="p-4 sm:p-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-extrabold text-clinic-ink">
                        Daily schedule
                    </h1>
                    <p className="mt-1 text-sm text-clinic-muted">
                        Appointments starting on {date}. All times shown in UTC.
                    </p>
                </div>
                {canCreate && (
                    <button
                        type="button"
                        onClick={() => {
                            setNotice('')
                            setEditor({ appointment: null })
                        }}
                        className={`${appointmentPrimaryClass} flex items-center gap-2`}>
                        <FiPlus /> Book appointment
                    </button>
                )}
            </div>
            <div className="mb-5 flex flex-wrap items-end gap-3">
                <div className="flex items-end gap-2">
                    <button
                        type="button"
                        aria-label="Previous day"
                        onClick={() => changeDate(shiftScheduleDate(date, -1))}
                        className={appointmentButtonClass}>
                        <FiChevronLeft className="h-5 w-5" />
                    </button>
                    <label
                        htmlFor="schedule-date"
                        className="text-sm font-bold text-clinic-ink">
                        Schedule date (UTC)
                        <input
                            id="schedule-date"
                            type="date"
                            value={date}
                            className={appointmentInputClass}
                            onChange={event => changeDate(event.target.value)}
                        />
                    </label>
                    <button
                        type="button"
                        aria-label="Next day"
                        onClick={() => changeDate(shiftScheduleDate(date, 1))}
                        className={appointmentButtonClass}>
                        <FiChevronRight className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => changeDate(utcToday())}
                        className={appointmentButtonClass}>
                        Today
                    </button>
                </div>
                <label
                    className="text-sm font-bold text-clinic-ink"
                    htmlFor="schedule-provider">
                    Provider
                    <select
                        id="schedule-provider"
                        value={provider}
                        onChange={event => setProvider(event.target.value)}
                        className={appointmentInputClass}>
                        <option value="">All providers</option>
                        {providers.map(([id, name]) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </select>
                </label>
                <label
                    className="text-sm font-bold text-clinic-ink"
                    htmlFor="schedule-status">
                    Status
                    <select
                        id="schedule-status"
                        value={statusFilter}
                        onChange={event => setStatusFilter(event.target.value)}
                        className={appointmentInputClass}>
                        <option value="">All statuses</option>
                        {Object.entries(appointmentStatusLabels).map(
                            ([status, label]) => (
                                <option key={status} value={status}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                </label>
                <button
                    type="button"
                    disabled={isValidating}
                    onClick={() => void retry()}
                    className={`${appointmentButtonClass} flex items-center gap-2`}>
                    <FiRefreshCw />
                    {isValidating ? 'Refreshing...' : 'Refresh schedule'}
                </button>
            </div>
            {notice && (
                <p
                    role="status"
                    className="mb-4 rounded-md bg-clinic-mint p-3 text-sm text-clinic-ink">
                    {notice}
                </p>
            )}
            {error ? (
                <div
                    role="alert"
                    className="rounded-md border border-rose-200 bg-clinic-rose p-5 text-sm text-rose-700">
                    <p>{error.message}</p>
                    <button
                        type="button"
                        disabled={isValidating}
                        onClick={() => void retry()}
                        className={`${appointmentButtonClass} mt-3`}>
                        Try again
                    </button>
                </div>
            ) : isLoading ? (
                <p
                    role="status"
                    className="p-8 text-center text-sm text-clinic-muted">
                    Loading appointments...
                </p>
            ) : visible.length === 0 ? (
                <div className="rounded-md border border-dashed border-clinic-line bg-white p-8 text-center text-sm text-clinic-muted">
                    <p>
                        {provider || statusFilter
                            ? 'No appointments match these filters.'
                            : 'No appointments scheduled for this date.'}
                    </p>
                    {(provider || statusFilter) && (
                        <button
                            type="button"
                            onClick={() => {
                                setProvider('')
                                setStatusFilter('')
                            }}
                            className={`${appointmentButtonClass} mt-3`}>
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div
                    className="overflow-x-auto rounded-md border border-clinic-line bg-white"
                    aria-busy={isValidating}>
                    <table className="w-full text-left text-sm">
                        <caption className="sr-only">
                            Daily schedule for {date} UTC, {visible.length}{' '}
                            appointments
                        </caption>
                        <thead className="border-b border-clinic-line bg-clinic-canvas text-xs uppercase text-clinic-muted">
                            <tr>
                                {[
                                    'Time (UTC)',
                                    'Patient / treatment',
                                    'Provider',
                                    'Room / chair',
                                    'Status',
                                    'Details',
                                ].map(heading => (
                                    <th
                                        key={heading}
                                        scope="col"
                                        className="px-4 py-3">
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-clinic-line">
                            {visible.map(appointment => (
                                <tr
                                    key={appointment.id}
                                    className="hover:bg-clinic-canvas/50">
                                    <td className="whitespace-nowrap px-4 py-4">
                                        <time
                                            dateTime={appointment.startsAt}
                                            className="font-bold text-clinic-ink">
                                            {formatAppointmentRange(
                                                appointment,
                                            )}
                                        </time>
                                        <p className="mt-1 text-xs text-clinic-muted">
                                            {appointment.duration_minutes} min
                                        </p>
                                    </td>
                                    <th
                                        scope="row"
                                        className="max-w-xs px-4 py-4">
                                        <span className="font-bold text-clinic-ink">
                                            {appointment.patientName}
                                        </span>
                                        <p className="mt-1 break-words text-xs font-normal text-clinic-muted">
                                            {appointment.treatmentName ??
                                                appointment.appointment_type}
                                        </p>
                                    </th>
                                    <td className="px-4 py-4 text-clinic-muted">
                                        {appointment.dentistName}
                                    </td>
                                    <td className="px-4 py-4 text-clinic-muted">
                                        <p>
                                            {appointment.roomName ?? 'No room'}
                                        </p>
                                        <p className="mt-1 text-xs">
                                            {appointment.chairName ??
                                                'No chair'}
                                        </p>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span
                                            className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${
                                                appointmentStatusClasses[
                                                    appointment.status
                                                ]
                                            }`}>
                                            {
                                                appointmentStatusLabels[
                                                    appointment.status
                                                ]
                                            }
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <button
                                            type="button"
                                            aria-label={`View appointment ${appointment.id} for ${appointment.patientName}`}
                                            onClick={() =>
                                                setSelectedId(appointment.id)
                                            }
                                            className={appointmentButtonClass}>
                                            View details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {selectedId !== null && (
                <AppointmentDetails
                    key={selectedId}
                    id={selectedId}
                    onClose={() => setSelectedId(null)}
                    onEdit={appointment => {
                        if (canUpdate) {
                            setSelectedId(null)
                            setEditor({ appointment })
                        }
                    }}
                    onUpdated={async (saved, previous) => {
                        await syncAppointment(saved, previous)
                        setNotice(
                            `Appointment ${appointmentStatusLabels[
                                saved.status
                            ].toLowerCase()}.`,
                        )
                    }}
                />
            )}
            {editor && (editor.appointment ? canUpdate : canCreate) && (
                <AppointmentForm
                    key={editor.appointment?.id ?? 'new'}
                    appointment={editor.appointment}
                    date={date}
                    onClose={() => setEditor(null)}
                    onSave={save}
                />
            )}
        </section>
    )
}

export default AppointmentSchedule
