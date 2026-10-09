import { PaginationMeta, apiClient } from '../lib/api'

export interface PatientsResponse {
    status: number
    patients: Patient[]
    meta?: PaginationMeta
}

export type PatientPayload = Omit<Patient, 'id' | 'created_at' | 'updated_at'>

interface PatientResponse {
    patient: Patient
}

const unwrapPatient = (data: Patient | PatientResponse) =>
    'patient' in data ? data.patient : data

export const getPatients = async () => {
    const response = await apiClient.get<PatientsResponse | Patient[]>(
        '/api/patients',
    )
    const patients = Array.isArray(response.data)
        ? response.data
        : response.data.patients

    return {
        status: Array.isArray(response.data)
            ? response.statusCode
            : response.data.status ?? response.statusCode,
        patients,
        meta:
            response.meta ??
            (!Array.isArray(response.data) ? response.data.meta : undefined),
    }
}

export const getPatient = async (patientId: number) => {
    const response = await apiClient.getData<Patient | PatientResponse>(
        `/api/patients/${patientId}`,
    )

    return unwrapPatient(response)
}

export const createPatient = async (payload: PatientPayload) => {
    const response = await apiClient.postData<Patient | PatientResponse>(
        '/api/patients',
        payload,
    )

    return unwrapPatient(response)
}

export const updatePatient = async (
    patientId: number,
    payload: Partial<PatientPayload>,
) => {
    const response = await apiClient.patchData<Patient | PatientResponse>(
        `/api/patients/${patientId}`,
        payload,
    )

    return unwrapPatient(response)
}

export const deletePatient = async (patientId: number) => {
    await apiClient.delete(`/api/patients/${patientId}`)
}
