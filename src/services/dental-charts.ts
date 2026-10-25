import { apiClient, PaginationMeta } from '../lib/api'

export type Dentition = 'adult' | 'primary'
export type ToothNumbering = 'universal' | 'fdi'
export type ToothStatus = 'present' | 'missing' | 'extracted' | 'unerupted'
export type FindingStatus = 'active' | 'resolved'
export type ToothSurface = 'M' | 'D' | 'B' | 'L' | 'O' | 'I'

export interface DentalFinding {
    code: string
    status: FindingStatus
    surfaces: ToothSurface[]
    treatment_id?: number | null
    note?: string | null
}
export interface DentalTooth {
    tooth: string
    status: ToothStatus
    findings: DentalFinding[]
}
export interface DentalPosition {
    tooth: string
    fdi: string
    surfaces: ToothSurface[]
}
export interface DentalChartMetadata {
    numbering_system: ToothNumbering
    numbering_systems: ToothNumbering[]
    dentitions: Record<Dentition, DentalPosition[]>
    tooth_statuses: ToothStatus[]
    finding_statuses: FindingStatus[]
    surfaces: Record<ToothSurface, string>
    surface_aliases: Record<string, ToothSurface>
    suggested_conditions: string[]
    custom_condition_codes: boolean
}
export interface DentalRevisionSummary {
    id: number | null
    patient_id: number
    dentition: Dentition
    numbering_system: ToothNumbering
    version: number
    dentist_id: number | null
    author_user_id: number | null
    clinical_note_id: number | null
    recorded_at: string | null
    reason: string | null
}
export interface DentalChart extends DentalRevisionSummary {
    teeth: DentalTooth[]
}
export interface DentalChartPayload {
    dentition: Dentition
    numbering_system?: ToothNumbering
    expected_version: number
    dentist_id: number
    clinical_note_id?: number | null
    reason: string
    teeth: DentalTooth[]
}
export interface DentalChartSelection {
    dentition?: Dentition
    numbering_system?: ToothNumbering
}
export const getDentalChartMetadata = (
    numbering_system: ToothNumbering = 'universal',
) =>
    apiClient.getData<DentalChartMetadata>('/api/dental-chart/metadata', {
        params: { numbering_system },
    })

export const getDentalChart = async (
    patientId: number,
    selection: DentalChartSelection = {},
) =>
    (
        await apiClient.getData<{ chart: DentalChart }>(
            `/api/patients/${patientId}/dental-chart`,
            {
                params: {
                    dentition: 'adult',
                    numbering_system: 'universal',
                    ...selection,
                },
            },
        )
    ).chart

export const getDentalChartRevision = async (
    patientId: number,
    version: number,
    selection: DentalChartSelection = {},
) =>
    (
        await apiClient.getData<{ chart: DentalChart }>(
            `/api/patients/${patientId}/dental-chart/revisions/${version}`,
            {
                params: {
                    dentition: 'adult',
                    numbering_system: 'universal',
                    ...selection,
                },
            },
        )
    ).chart

export const getDentalChartHistory = async (
    patientId: number,
    selection: DentalChartSelection & { page?: number; per_page?: number } = {},
): Promise<{ revisions: DentalRevisionSummary[]; meta: PaginationMeta }> => {
    const response = await apiClient.get<{
        revisions: DentalRevisionSummary[]
    }>(`/api/patients/${patientId}/dental-chart/history`, {
        params: {
            dentition: 'adult',
            numbering_system: 'universal',
            page: 1,
            per_page: 10,
            ...selection,
        },
    })
    const envelope = response.meta as PaginationMeta & {
        pagination?: PaginationMeta
    }
    return {
        revisions: response.data.revisions,
        meta: envelope?.pagination ?? envelope ?? {},
    }
}

// Explicitly allow only writable fields, including nested findings. Attribution is server-owned.
export const appendDentalChart = async (
    patientId: number,
    payload: DentalChartPayload,
) =>
    (
        await apiClient.postData<{ chart: DentalChart }>(
            `/api/patients/${patientId}/dental-chart/revisions`,
            {
                dentition: payload.dentition,
                numbering_system: payload.numbering_system ?? 'universal',
                expected_version: payload.expected_version,
                dentist_id: payload.dentist_id,
                clinical_note_id: payload.clinical_note_id ?? null,
                reason: payload.reason,
                teeth: payload.teeth.map(tooth => ({
                    tooth: tooth.tooth,
                    status: tooth.status,
                    findings: tooth.findings.map(finding => ({
                        code: finding.code,
                        status: finding.status,
                        surfaces: [...finding.surfaces],
                        treatment_id: finding.treatment_id ?? null,
                        note: finding.note ?? null,
                    })),
                })),
            },
        )
    ).chart
