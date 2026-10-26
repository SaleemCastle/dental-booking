import { apiClient, PaginationMeta } from '../lib/api'
import type { Dentition, ToothNumbering, ToothSurface } from './dental-charts'

export type TreatmentPlanStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type TreatmentPlanItemStatus =
    | 'proposed'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
export type TreatmentPlanPriority = 'low' | 'normal' | 'high' | 'urgent'
export interface TreatmentToothContext {
    dentition: Dentition
    numbering_system: ToothNumbering
    tooth: string
    surfaces: ToothSurface[]
}
export interface TreatmentPlanItem {
    id: number
    treatment_plan_id: number
    treatment_id: number
    treatment_name: string
    dentist_id: number
    tooth_context: (TreatmentToothContext & { numbering_system: 'fdi' }) | null
    catalog_price: string
    estimated_price: string
    sequence: number
    priority: TreatmentPlanPriority
    status: TreatmentPlanItemStatus
    notes: string | null
    created_at: string
    updated_at: string
}
export interface TreatmentPlan {
    id: number
    patient_id: number
    title: string
    notes: string | null
    status: TreatmentPlanStatus
    items: TreatmentPlanItem[]
    created_at: string
    updated_at: string
}
export interface NewTreatmentPlanItem {
    treatment_id: number
    dentist_id: number
    tooth_context?: TreatmentToothContext | null
    estimated_price?: string
    sequence?: number
    priority?: TreatmentPlanPriority
    notes?: string | null
}
export type TreatmentPlanItemUpdate = Partial<
    Omit<NewTreatmentPlanItem, 'treatment_id'>
> & { status?: TreatmentPlanItemStatus }
export interface NewTreatmentPlan {
    title: string
    notes?: string | null
    items?: NewTreatmentPlanItem[]
}
export type TreatmentPlanUpdate = Partial<
    Pick<TreatmentPlan, 'title' | 'notes' | 'status'>
>
export interface TreatmentPlanPage {
    plans: TreatmentPlan[]
    meta: PaginationMeta
}

const pick = (payload: object, fields: string[]) =>
    Object.fromEntries(
        fields
            .filter(key => payload[key] !== undefined)
            .map(key => [key, payload[key]]),
    )
const itemFields = [
    'dentist_id',
    'estimated_price',
    'sequence',
    'priority',
    'notes',
]
const writableItem = (
    payload: NewTreatmentPlanItem | TreatmentPlanItemUpdate,
    creating: boolean,
) => ({
    ...pick(payload, [...itemFields, creating ? 'treatment_id' : 'status']),
    ...(payload.tooth_context === undefined
        ? {}
        : {
              tooth_context:
                  payload.tooth_context === null
                      ? null
                      : {
                            ...pick(payload.tooth_context, [
                                'dentition',
                                'tooth',
                                'surfaces',
                            ]),
                            numbering_system:
                                payload.tooth_context.numbering_system ??
                                'universal',
                        },
          }),
})

export const getTreatmentPlans = async (
    patientId: number,
    params: {
        status?: TreatmentPlanStatus
        page?: number
        per_page?: number
    } = {},
): Promise<TreatmentPlanPage> => {
    const response = await apiClient.get<TreatmentPlan[]>(
        `/api/patients/${patientId}/treatment-plans`,
        { params: { page: 1, per_page: 15, ...params } },
    )
    if (!Array.isArray(response.data))
        throw new Error(
            'The treatment plan response could not be read. Retry loading the plans.',
        )
    const envelope = response.meta as PaginationMeta & {
        pagination?: PaginationMeta
    }
    const meta = envelope?.pagination ?? envelope ?? {}
    return {
        plans: response.data,
        meta: {
            ...meta,
            currentPage: Number(
                meta.currentPage ?? meta.current_page ?? params.page ?? 1,
            ),
            lastPage: Number(meta.lastPage ?? meta.last_page ?? 1),
        },
    }
}
export const getTreatmentPlan = async (planId: number) =>
    (
        await apiClient.getData<{ treatmentPlan: TreatmentPlan }>(
            `/api/treatment-plans/${planId}`,
        )
    ).treatmentPlan
export const createTreatmentPlan = async (
    patientId: number,
    payload: NewTreatmentPlan,
) =>
    (
        await apiClient.postData<{ treatmentPlan: TreatmentPlan }>(
            `/api/patients/${patientId}/treatment-plans`,
            {
                ...pick(payload, ['title', 'notes']),
                ...(payload.items === undefined
                    ? {}
                    : {
                          items: payload.items.map(item =>
                              writableItem(item, true),
                          ),
                      }),
            },
        )
    ).treatmentPlan
export const updateTreatmentPlan = async (
    planId: number,
    payload: TreatmentPlanUpdate,
) =>
    (
        await apiClient.patchData<{ treatmentPlan: TreatmentPlan }>(
            `/api/treatment-plans/${planId}`,
            pick(payload, ['title', 'notes', 'status']),
        )
    ).treatmentPlan
export const addTreatmentPlanItem = async (
    planId: number,
    payload: NewTreatmentPlanItem,
) =>
    (
        await apiClient.postData<{ treatmentPlanItem: TreatmentPlanItem }>(
            `/api/treatment-plans/${planId}/items`,
            writableItem(payload, true),
        )
    ).treatmentPlanItem
export const updateTreatmentPlanItem = async (
    planId: number,
    itemId: number,
    payload: TreatmentPlanItemUpdate,
) =>
    (
        await apiClient.patchData<{ treatmentPlanItem: TreatmentPlanItem }>(
            `/api/treatment-plans/${planId}/items/${itemId}`,
            writableItem(payload, false),
        )
    ).treatmentPlanItem
