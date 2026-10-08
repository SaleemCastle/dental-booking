import axios from '../lib/axios'

export interface PatientsResponse {
    status: number
    patients: Patient[]
}

export type PatientPayload = Omit<Patient, 'id' | 'created_at' | 'updated_at'>

export const getPatients = async () => {
    const response = await axios.get<PatientsResponse>('/api/patients')

    return response.data
}

export const getPatient = async (patientId: number) => {
    const response = await axios.get<Patient>(`/api/patients/${patientId}`)

    return response.data
}

export const createPatient = async (payload: PatientPayload) => {
    const response = await axios.post<Patient>('/api/patients', payload)

    return response.data
}

export const updatePatient = async (
    patientId: number,
    payload: Partial<PatientPayload>,
) => {
    const response = await axios.patch<Patient>(
        `/api/patients/${patientId}`,
        payload,
    )

    return response.data
}

export const deletePatient = async (patientId: number) => {
    await axios.delete(`/api/patients/${patientId}`)
}
