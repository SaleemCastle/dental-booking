import { apiClient } from '../lib/api'

export interface Treatment {
    id: number
    name: string
    description: string | null
    category: string
    duration_minutes: number
    price: string
    active: boolean
    created_at: string | null
    updated_at: string | null
}

export interface TreatmentPayload {
    name: string
    description?: string | null
    category: string
    duration_minutes: number
    price: string | number
    active?: boolean
}

interface TreatmentsResponse {
    treatments: Treatment[]
}

interface TreatmentResponse {
    treatment: Treatment
}

const unwrapTreatment = (data: Treatment | TreatmentResponse) =>
    'treatment' in data ? data.treatment : data

export const getTreatments = async (active?: boolean): Promise<Treatment[]> => {
    const data = await apiClient.getData<Treatment[] | TreatmentsResponse>(
        '/api/treatments',
        { params: active === undefined ? {} : { active: active ? 1 : 0 } },
    )

    return Array.isArray(data) ? data : data.treatments
}

export const getActiveTreatments = () => getTreatments(true)

export const getTreatment = async (treatmentId: number) =>
    unwrapTreatment(
        await apiClient.getData<Treatment | TreatmentResponse>(
            `/api/treatments/${treatmentId}`,
        ),
    )

export const createTreatment = async (payload: TreatmentPayload) =>
    unwrapTreatment(
        await apiClient.postData<Treatment | TreatmentResponse>(
            '/api/treatments',
            payload,
        ),
    )

export const updateTreatment = async (
    treatmentId: number,
    payload: Partial<TreatmentPayload>,
) =>
    unwrapTreatment(
        await apiClient.patchData<Treatment | TreatmentResponse>(
            `/api/treatments/${treatmentId}`,
            payload,
        ),
    )

// DELETE preserves the treatment and its historical appointment references.
export const deactivateTreatment = async (treatmentId: number) => {
    await apiClient.delete<null>(`/api/treatments/${treatmentId}`)
}

export const activateTreatment = (treatmentId: number) =>
    updateTreatment(treatmentId, { active: true })
