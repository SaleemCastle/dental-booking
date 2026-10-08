import axios from '../lib/axios'

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

export const getAppointments = async (date: string) => {
    const response = await axios.get<Appointment[]>('/api/appointments', {
        params: { date },
    })

    return response.data
}

export const createAppointment = async (payload: AppointmentPayload) => {
    const response = await axios.post<Appointment>('/api/appointments', payload)

    return response.data
}

export const updateAppointment = async (
    appointmentId: number,
    payload: Partial<AppointmentPayload>,
) => {
    const response = await axios.patch<Appointment>(
        `/api/appointments/${appointmentId}`,
        payload,
    )

    return response.data
}

export const checkInAppointment = async (appointmentId: number) => {
    const response = await axios.post<Appointment>(
        `/api/appointments/${appointmentId}/check-in`,
    )

    return response.data
}

export const completeAppointment = async (appointmentId: number) => {
    const response = await axios.post<Appointment>(
        `/api/appointments/${appointmentId}/complete`,
    )

    return response.data
}

export const cancelAppointment = async (appointmentId: number) => {
    const response = await axios.post<Appointment>(
        `/api/appointments/${appointmentId}/cancel`,
    )

    return response.data
}
