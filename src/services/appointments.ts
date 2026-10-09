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
    patientId: number
    patientName: string
    dentistId: number
    dentistName: string
    treatmentId: number
    treatmentName: string
    startsAt: string
    durationMinutes: number
    status: AppointmentStatus
    paymentStatus: PaymentStatus
    notes?: string
    created_at: string
    updated_at: string
}

export interface AppointmentPayload {
    patientId: number
    dentistId: number
    treatmentId: number
    startsAt: string
    durationMinutes: number
    notes?: string
}

interface AppointmentsResponse {
    appointments: Appointment[]
}

interface AppointmentResponse {
    appointment: Appointment
}

const unwrapAppointments = (data: Appointment[] | AppointmentsResponse) =>
    Array.isArray(data) ? data : data.appointments

const unwrapAppointment = (data: Appointment | AppointmentResponse) =>
    'appointment' in data ? data.appointment : data

export const getAppointments = async (date: string) => {
    const response = await apiClient.getData<
        Appointment[] | AppointmentsResponse
    >('/api/appointments', {
        params: { date },
    })

    return unwrapAppointments(response)
}

export const createAppointment = async (payload: AppointmentPayload) => {
    const response = await apiClient.postData<
        Appointment | AppointmentResponse
    >('/api/appointments', payload)

    return unwrapAppointment(response)
}

export const updateAppointment = async (
    appointmentId: number,
    payload: Partial<AppointmentPayload>,
) => {
    const response = await apiClient.patchData<
        Appointment | AppointmentResponse
    >(`/api/appointments/${appointmentId}`, payload)

    return unwrapAppointment(response)
}

export const checkInAppointment = async (appointmentId: number) => {
    const response = await apiClient.postData<
        Appointment | AppointmentResponse
    >(`/api/appointments/${appointmentId}/check-in`)

    return unwrapAppointment(response)
}

export const completeAppointment = async (appointmentId: number) => {
    const response = await apiClient.postData<
        Appointment | AppointmentResponse
    >(`/api/appointments/${appointmentId}/complete`)

    return unwrapAppointment(response)
}

export const cancelAppointment = async (appointmentId: number) => {
    const response = await apiClient.postData<
        Appointment | AppointmentResponse
    >(`/api/appointments/${appointmentId}/cancel`)

    return unwrapAppointment(response)
}
