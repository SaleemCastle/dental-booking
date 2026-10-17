import { apiClient } from '../lib/api'

export type AppointmentStatus =
    | 'scheduled'
    | 'checked_in'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'no_show'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded'

export interface Appointment {
    id: number
    patient_id: number
    dentist_id: number
    treatment_id: number | null
    room_id: number | null
    chair_id: number | null
    patientId: number
    dentistId: number
    treatmentId: number | null
    roomId: number | null
    chairId: number | null
    patientName: string
    dentistName: string
    treatmentName: string | null
    roomName: string | null
    chairName: string | null
    startsAt: string
    endsAt: string
    appointment_date_time: string
    appointment_type: string
    description: string
    duration_minutes: number
    durationMinutes: number
    duration: number
    status: AppointmentStatus
    appointmentStatus: AppointmentStatus
    paymentStatus: PaymentStatus
    cancellation_reason: string | null
    checked_in_at?: string | null
    completed_at?: string | null
    cancelled_at?: string | null
    created_at?: string | null
    updated_at?: string | null
}

export interface AppointmentPayload {
    patient_id: number
    dentist_id: number
    appointment_date_time: string
    appointment_type: string
    description: string
    treatment_id?: number | null
    room_id?: number | null
    chair_id?: number | null
    duration_minutes?: number
    status?: AppointmentStatus
    cancellation_reason?: string | null
}

export interface AppointmentChair {
    id: number
    room_id: number
    name: string
}
export interface AppointmentRoom {
    id: number
    name: string
    chairs: AppointmentChair[]
}
export interface AppointmentProvider {
    id: number
    name?: string
    first_name?: string
    last_name?: string
}

type AppointmentResource = Partial<Appointment>
type AppointmentResponse =
    | AppointmentResource
    | { appointment: AppointmentResource }

// Canonical IDs take precedence, including explicit nulls on optional links.
export const normalizeAppointment = (
    resource: AppointmentResource,
): Appointment => {
    const identifier = (canonical: string, alias: string) => {
        const value = Object.prototype.hasOwnProperty.call(resource, canonical)
            ? resource[canonical]
            : resource[alias]
        return value == null ? null : Number(value)
    }
    const patientId = identifier('patient_id', 'patientId')
    const dentistId = identifier('dentist_id', 'dentistId')
    const treatmentId = identifier('treatment_id', 'treatmentId')
    const roomId = identifier('room_id', 'roomId')
    const chairId = identifier('chair_id', 'chairId')
    const duration = Number(
        resource.duration_minutes ??
            resource.duration ??
            resource.durationMinutes ??
            30,
    )
    const startsAt = resource.startsAt ?? resource.appointment_date_time
    const status = resource.status ?? resource.appointmentStatus
    return {
        ...resource,
        id: Number(resource.id),
        patient_id: patientId,
        patientId,
        dentist_id: dentistId,
        dentistId,
        treatment_id: treatmentId,
        treatmentId,
        room_id: roomId,
        roomId,
        chair_id: chairId,
        chairId,
        patientName: resource.patientName ?? `Patient #${patientId}`,
        dentistName: resource.dentistName ?? `Provider #${dentistId}`,
        treatmentName: resource.treatmentName ?? null,
        roomName: resource.roomName ?? null,
        chairName: resource.chairName ?? null,
        startsAt,
        appointment_date_time: resource.appointment_date_time ?? startsAt,
        endsAt:
            resource.endsAt ??
            new Date(
                new Date(startsAt).getTime() + duration * 60000,
            ).toISOString(),
        duration,
        durationMinutes: duration,
        duration_minutes: duration,
        status,
        appointmentStatus: status,
        paymentStatus: resource.paymentStatus ?? 'unpaid',
        appointment_type: resource.appointment_type ?? '',
        description: resource.description ?? '',
        cancellation_reason: resource.cancellation_reason ?? null,
    }
}

const unwrapAppointment = (data: AppointmentResponse) =>
    normalizeAppointment('appointment' in data ? data.appointment : data)

export const getAppointments = async (date: string) => {
    const data = await apiClient.getData<
        AppointmentResource[] | { appointments: AppointmentResource[] }
    >('/api/appointments', { params: { date } })
    return (Array.isArray(data) ? data : data.appointments).map(
        normalizeAppointment,
    )
}
export const getAppointment = async (appointmentId: number) =>
    unwrapAppointment(
        await apiClient.getData<AppointmentResponse>(
            `/api/appointments/${appointmentId}`,
        ),
    )
export const createAppointment = async (payload: AppointmentPayload) =>
    unwrapAppointment(
        await apiClient.postData<AppointmentResponse>(
            '/api/appointments',
            payload,
        ),
    )
export const updateAppointment = async (
    appointmentId: number,
    payload: Partial<AppointmentPayload>,
) =>
    unwrapAppointment(
        await apiClient.patchData<AppointmentResponse>(
            `/api/appointments/${appointmentId}`,
            payload,
        ),
    )
export const checkInAppointment = async (appointmentId: number) =>
    unwrapAppointment(
        await apiClient.postData<AppointmentResponse>(
            `/api/appointments/${appointmentId}/check-in`,
        ),
    )
export const completeAppointment = async (appointmentId: number) =>
    unwrapAppointment(
        await apiClient.postData<AppointmentResponse>(
            `/api/appointments/${appointmentId}/complete`,
        ),
    )
export const cancelAppointment = async (
    appointmentId: number,
    cancellationReason?: string | null,
) =>
    unwrapAppointment(
        await apiClient.postData<AppointmentResponse>(
            `/api/appointments/${appointmentId}/cancel`,
            cancellationReason === undefined
                ? undefined
                : { cancellation_reason: cancellationReason },
        ),
    )

export const getAppointmentLocations = async (): Promise<AppointmentRoom[]> => {
    const data = await apiClient.getData<{ rooms: AppointmentRoom[] }>(
        '/api/appointment-locations',
    )
    return data.rooms
}
export const getAppointmentProviders = async (): Promise<
    AppointmentProvider[]
> => {
    const data = await apiClient.getData<
        AppointmentProvider[] | { dentists: AppointmentProvider[] }
    >('/api/dentists')
    return Array.isArray(data) ? data : data.dentists
}
export const getProviderName = (provider: AppointmentProvider) =>
    provider.name ||
    [provider.first_name, provider.last_name].filter(Boolean).join(' ') ||
    `Provider #${provider.id}`
