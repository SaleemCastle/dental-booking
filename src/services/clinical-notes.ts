import { apiClient, PaginationMeta } from '../lib/api'

export interface ClinicalNote {
    id: number
    patient_id: number
    dentist_id: number
    appointment_id: number | null
    note_text: string
    author_user_id: number | null
    updated_by_user_id: number | null
    authorName: string | null
    updatedByName: string | null
    created_at: string | null
    updated_at: string | null
}

export interface ClinicalNotePayload {
    patient_id: number
    dentist_id: number
    appointment_id?: number | null
    note_text: string
}

export interface ClinicalNotePage {
    notes: ClinicalNote[]
    meta: PaginationMeta
}

export const getClinicalNotes = async ({
    patient_id,
    dentist_id,
    appointment_id,
    page = 1,
    per_page = 15,
}: {
    patient_id: number
    dentist_id?: number
    appointment_id?: number
    page?: number
    per_page?: number
}): Promise<ClinicalNotePage> => {
    const response = await apiClient.get<{ clinicalNotes: ClinicalNote[] }>(
        '/api/clinical-notes',
        { params: { patient_id, dentist_id, appointment_id, page, per_page } },
    )
    const envelope = response.meta as PaginationMeta & {
        pagination?: PaginationMeta
    }
    const meta = envelope?.pagination ?? envelope ?? {}
    return {
        notes: response.data.clinicalNotes,
        meta: {
            ...meta,
            currentPage: Number(meta.currentPage ?? meta.current_page ?? page),
            perPage: Number(meta.perPage ?? meta.per_page ?? per_page),
            lastPage: Number(meta.lastPage ?? meta.last_page ?? page),
        },
    }
}

// Only relationship IDs and text may be sent. Attribution belongs to the server.
const writableFields = (payload: Partial<ClinicalNotePayload>) =>
    Object.fromEntries(
        ['patient_id', 'dentist_id', 'appointment_id', 'note_text']
            .filter(key => payload[key] !== undefined)
            .map(key => [key, payload[key]]),
    )

export const createClinicalNote = async (payload: ClinicalNotePayload) =>
    (
        await apiClient.postData<{ clinicalNote: ClinicalNote }>(
            '/api/clinical-notes',
            writableFields(payload),
        )
    ).clinicalNote

export const updateClinicalNote = async (
    id: number,
    payload: Partial<ClinicalNotePayload>,
) =>
    (
        await apiClient.patchData<{ clinicalNote: ClinicalNote }>(
            `/api/clinical-notes/${id}`,
            writableFields(payload),
        )
    ).clinicalNote

export const deleteClinicalNote = async (id: number) => {
    await apiClient.delete<null>(`/api/clinical-notes/${id}`)
}
