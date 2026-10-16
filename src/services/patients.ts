import { PaginationMeta, apiClient } from '../lib/api'

export interface PatientsResponse {
    status: number
    patients: Patient[]
    meta?: PaginationMeta
}

export type PatientPayload = Omit<
    Patient,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'archived'
    | 'isArchived'
    | 'is_archived'
    | 'archived_at'
    | 'archivedAt'
    | 'archived_by_user_id'
    | 'deleted_at'
>

export type PatientArchivedFilter = 'with' | 'without' | 'only'

export interface PatientListParams {
    search?: string
    page?: number
    perPage?: number
    archived?: PatientArchivedFilter
}

interface PatientResponse {
    patient: Patient
}

interface LaravelPaginatedPatients {
    data: Patient[]
    patients?: Patient[]
    meta?: PaginationMeta
    current_page?: number
    per_page?: number
    total?: number
    last_page?: number
    from?: number
    to?: number
}

const unwrapPatient = (data: Patient | PatientResponse) =>
    'patient' in data ? data.patient : data

const normalizePaginationMeta = (
    meta?:
        | PaginationMeta
        | LaravelPaginatedPatients
        | { pagination?: PaginationMeta },
): PaginationMeta | undefined => {
    if (!meta) {
        return undefined
    }

    const source =
        'pagination' in meta && meta.pagination ? meta.pagination : meta
    const values = source as PaginationMeta & LaravelPaginatedPatients

    return {
        ...values,
        currentPage: values.currentPage ?? values.current_page,
        perPage: values.perPage ?? values.per_page,
        lastPage: values.lastPage ?? values.last_page,
        total: values.total,
        from: values.from,
        to: values.to,
    }
}

const unwrapPatients = (
    data: PatientsResponse | Patient[] | LaravelPaginatedPatients,
) => {
    if (Array.isArray(data)) {
        return {
            patients: data,
            meta: undefined,
        }
    }

    if ('patients' in data && Array.isArray(data.patients)) {
        return {
            patients: data.patients,
            meta: normalizePaginationMeta(data.meta),
        }
    }

    if ('patients' in data) {
        return {
            patients: data.patients,
            meta: normalizePaginationMeta(data.meta),
        }
    }

    return {
        patients: data.data,
        meta: normalizePaginationMeta(data.meta ?? data),
    }
}

export const getPatients = async ({
    search = '',
    page = 1,
    perPage = 8,
    archived = 'without',
}: PatientListParams = {}) => {
    const params = {
        search: search.trim(),
        page,
        per_page: perPage,
        archived,
    }

    const response = await apiClient.get<
        PatientsResponse | Patient[] | LaravelPaginatedPatients
    >('/api/patients', {
        params,
    })
    const { patients, meta } = unwrapPatients(response.data)

    return {
        status: Array.isArray(response.data)
            ? response.statusCode
            : 'status' in response.data
            ? response.data.status ?? response.statusCode
            : response.statusCode,
        patients,
        meta: normalizePaginationMeta(response.meta ?? meta),
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

export const archivePatient = deletePatient
