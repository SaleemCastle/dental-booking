import {
    apiClient,
    apiRequestWithSignal,
    http,
    PaginationMeta,
} from '../lib/api'
import { documentTypes } from '../lib/patient-documents'

export interface PatientDocument {
    id: number
    patient_id: number
    original_filename: string
    mime_type: string
    size_bytes: number
    uploaded_by_user_id: number | null
    uploadedByName?: string | null
    appointment_id: number | null
    clinical_note_id: number | null
    created_at: string | null
    archived_at: string | null
}
export type DocumentStatus = 'active' | 'archived' | 'all'
export interface DocumentPage {
    documents: PatientDocument[]
    meta: PaginationMeta
}
export interface DocumentUpload {
    file: File
    appointment_id?: number | null
    clinical_note_id?: number | null
}
export interface DocumentRequestOptions {
    tenantId: number
    signal?: AbortSignal
}
const headers = (tenantId: number) => ({ 'X-Tenant-Id': tenantId })
const base = (patientId: number) => `/api/patients/${patientId}/documents`

export const getPatientDocuments = async (
    patientId: number,
    status: DocumentStatus,
    page: number,
    options: DocumentRequestOptions,
): Promise<DocumentPage> => {
    const response = await apiRequestWithSignal<{
        documents: PatientDocument[]
    }>(
        {
            method: 'get',
            url: base(patientId),
            headers: headers(options.tenantId),
            params: { status, page, per_page: 15 },
        },
        options.signal,
    )
    const envelope = response.meta as PaginationMeta & {
        pagination?: PaginationMeta
    }
    const meta = envelope?.pagination ?? envelope ?? {}
    return {
        documents: response.data.documents,
        meta: {
            ...meta,
            currentPage: Number(meta.currentPage ?? meta.current_page ?? page),
            lastPage: Number(meta.lastPage ?? meta.last_page ?? page),
        },
    }
}

export const uploadPatientDocument = async (
    patientId: number,
    payload: DocumentUpload,
    options: DocumentRequestOptions & {
        onProgress?: (percent: number) => void
    },
) => {
    const data = new FormData()
    // Send only the three writable fields; the browser supplies the boundary.
    data.append('file', payload.file)
    for (const key of ['appointment_id', 'clinical_note_id'] as const) {
        if (payload[key] != null) data.append(key, String(payload[key]))
    }
    const response = await apiRequestWithSignal<{ document: PatientDocument }>(
        {
            method: 'post',
            url: base(patientId),
            data,
            headers: headers(options.tenantId),
            onUploadProgress: event => {
                if (event.total > 0)
                    options.onProgress?.(
                        Math.min(
                            100,
                            Math.round((event.loaded / event.total) * 100),
                        ),
                    )
            },
        },
        options.signal,
    )
    return response.data.document
}

export const getPatientDocument = async (
    patientId: number,
    id: number,
    tenantId: number,
) =>
    (
        await apiClient.getData<{ document: PatientDocument }>(
            `${base(patientId)}/${id}`,
            { headers: headers(tenantId) },
        )
    ).document

export const archivePatientDocument = async (
    patientId: number,
    id: number,
    tenantId: number,
) =>
    (
        await apiClient.postData<{ document: PatientDocument }>(
            `${base(patientId)}/${id}/archive`,
            undefined,
            { headers: headers(tenantId) },
        )
    ).document

export const deletePatientDocument = async (
    patientId: number,
    id: number,
    tenantId: number,
) => {
    await apiClient.delete(`${base(patientId)}/${id}`, {
        headers: headers(tenantId),
    })
}

export const downloadPatientDocument = async (
    patientId: number,
    document: PatientDocument,
    options: DocumentRequestOptions,
): Promise<Blob> => {
    // Use the shared authenticated transport, but preserve binary responses.
    // apiRequestWithSignal normalizes JSON, so the raw HTTP client is used here.
    const Axios = (await import('axios')).default
    const source = Axios.CancelToken.source()
    const cancel = () => source.cancel('Request cancelled.')
    if (options.signal?.aborted)
        throw new DOMException('Request cancelled.', 'AbortError')
    options.signal?.addEventListener('abort', cancel, { once: true })
    try {
        const response = await http.get<Blob>(
            `${base(patientId)}/${document.id}/download`,
            {
                headers: headers(options.tenantId),
                responseType: 'blob',
                cancelToken: source.token,
            },
        )
        if (options.signal?.aborted)
            throw new DOMException('Request cancelled.', 'AbortError')
        const mime = String(response.headers['content-type'] ?? '')
            .split(';')[0]
            .trim()
            .toLowerCase()
        if (!documentTypes[mime] || mime !== document.mime_type)
            throw new Error(
                'The server returned an unexpected file type. Refresh the document list and try again.',
            )
        return new Blob([response.data], { type: mime })
    } finally {
        options.signal?.removeEventListener('abort', cancel)
    }
}
