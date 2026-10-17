import type {
    Appointment,
    AppointmentPayload,
    AppointmentRoom,
    AppointmentStatus,
} from '../services/appointments'
import type { ApiFieldErrors } from './api-contract'

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
    scheduled: 'Scheduled',
    checked_in: 'Checked in',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
}
export const appointmentStatusClasses: Record<AppointmentStatus, string> = {
    scheduled: 'bg-clinic-sky text-clinic-blue',
    checked_in: 'bg-clinic-amber text-amber-700',
    in_progress: 'bg-clinic-sky text-indigo-700',
    completed: 'bg-clinic-mint text-emerald-700',
    cancelled: 'bg-clinic-canvas text-clinic-muted',
    no_show: 'bg-clinic-rose text-rose-700',
}
export const appointmentTransitions: Record<
    AppointmentStatus,
    AppointmentStatus[]
> = {
    scheduled: ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    no_show: [],
}
export const isTerminalAppointment = (status: AppointmentStatus) =>
    ['completed', 'cancelled', 'no_show'].includes(status)
export const utcToday = () => new Date().toISOString().slice(0, 10)
export const shiftScheduleDate = (date: string, days: number) => {
    const shifted = new Date(`${date}T12:00:00Z`)
    shifted.setUTCDate(shifted.getUTCDate() + days)
    return shifted.toISOString().slice(0, 10)
}
export const utcInputTime = (iso: string) =>
    new Date(iso).toISOString().slice(0, 16)
export const formatAppointmentTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
export const formatAppointmentRange = (appointment: Appointment) =>
    `${formatAppointmentTime(appointment.startsAt)} - ${formatAppointmentTime(
        appointment.endsAt,
    )}${
        appointment.startsAt.slice(0, 10) !== appointment.endsAt.slice(0, 10)
            ? ` (${appointment.endsAt.slice(0, 10)})`
            : ''
    }`
export const sortAppointments = (appointments: Appointment[]) =>
    [...appointments].sort(
        (a, b) =>
            Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
            a.dentistName.localeCompare(b.dentistName) ||
            a.id - b.id,
    )

export interface AppointmentFormValues {
    patient_id: string
    dentist_id: string
    treatment_id: string
    room_id: string
    chair_id: string
    appointment_date_time: string
    duration_minutes: string
    appointment_type: string
    description: string
}
export const getAppointmentFormValues = (
    appointment: Appointment | null,
    date: string,
): AppointmentFormValues => ({
    patient_id: appointment ? String(appointment.patient_id) : '',
    dentist_id: appointment ? String(appointment.dentist_id) : '',
    treatment_id:
        appointment?.treatment_id == null
            ? ''
            : String(appointment.treatment_id),
    room_id: appointment?.room_id == null ? '' : String(appointment.room_id),
    chair_id: appointment?.chair_id == null ? '' : String(appointment.chair_id),
    appointment_date_time: appointment
        ? utcInputTime(appointment.startsAt)
        : `${date}T09:00`,
    duration_minutes: String(appointment?.duration_minutes ?? 30),
    appointment_type: appointment?.appointment_type ?? '',
    description: appointment?.description ?? '',
})
export const normalizeAppointmentFieldErrors = (
    errors: ApiFieldErrors,
): ApiFieldErrors => {
    const aliases = {
        patientId: 'patient_id',
        dentistId: 'dentist_id',
        treatmentId: 'treatment_id',
        roomId: 'room_id',
        chairId: 'chair_id',
        startsAt: 'appointment_date_time',
        appointmentType: 'appointment_type',
        durationMinutes: 'duration_minutes',
        appointmentStatus: 'status',
        reason: 'cancellation_reason',
    }
    return Object.entries(errors).reduce((normalized, [field, messages]) => {
        const name = aliases[field] ?? field
        normalized[name] = [...(normalized[name] ?? []), ...messages]
        return normalized
    }, {} as ApiFieldErrors)
}
export const validateAppointmentForm = (
    values: AppointmentFormValues,
    rooms?: AppointmentRoom[],
): ApiFieldErrors => {
    const errors: ApiFieldErrors = {}
    for (const field of ['patient_id', 'dentist_id'] as const) {
        if (!/^\d+$/.test(values[field]) || Number(values[field]) < 1)
            errors[field] = [
                'Choose a ' +
                    (field === 'patient_id' ? 'patient.' : 'provider.'),
            ]
    }
    for (const field of ['room_id', 'chair_id', 'treatment_id'] as const) {
        if (
            values[field] &&
            (!/^\d+$/.test(values[field]) || Number(values[field]) < 1)
        )
            errors[field] = ['Choose a valid option.']
    }
    if (
        !values.appointment_date_time ||
        !Number.isFinite(Date.parse(`${values.appointment_date_time}Z`))
    )
        errors.appointment_date_time = [
            'Enter a valid start date and time (UTC).',
        ]
    const duration = Number(values.duration_minutes)
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440)
        errors.duration_minutes = [
            'Enter a whole number from 1 to 1440 minutes.',
        ]
    if (
        !values.appointment_type.trim() ||
        values.appointment_type.trim().length > 255
    )
        errors.appointment_type = [
            'Enter an appointment type of up to 255 characters.',
        ]
    if (!values.description.trim())
        errors.description = ['Enter a description.']
    if (
        rooms &&
        values.chair_id &&
        !rooms.some(
            room =>
                (!values.room_id || room.id === Number(values.room_id)) &&
                room.chairs.some(chair => chair.id === Number(values.chair_id)),
        )
    )
        errors.chair_id = ['Choose a chair in the selected room.']
    return errors
}
// Send only changed fields on edit so archived/inactive references remain intact.
export const toAppointmentPayload = (
    values: AppointmentFormValues,
    appointment?: Appointment | null,
): Partial<AppointmentPayload> => {
    const initial = appointment
        ? getAppointmentFormValues(appointment, '')
        : null
    const payload: Partial<AppointmentPayload> = {}
    for (const field of [
        'patient_id',
        'dentist_id',
        'treatment_id',
        'duration_minutes',
    ] as const) {
        if (!initial || values[field] !== initial[field])
            payload[field] = values[field] === '' ? null : Number(values[field])
    }
    if (
        !initial ||
        values.room_id !== initial.room_id ||
        values.chair_id !== initial.chair_id
    ) {
        payload.room_id = values.room_id ? Number(values.room_id) : null
        payload.chair_id = values.chair_id ? Number(values.chair_id) : null
    }
    if (
        !initial ||
        values.appointment_date_time !== initial.appointment_date_time
    )
        payload.appointment_date_time = new Date(
            `${values.appointment_date_time}Z`,
        ).toISOString()
    for (const field of ['appointment_type', 'description'] as const) {
        if (!initial || values[field] !== initial[field])
            payload[field] = values[field].trim()
    }
    return payload
}
