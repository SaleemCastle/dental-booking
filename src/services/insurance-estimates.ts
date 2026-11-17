import { apiClient } from '../lib/api'

export interface InsuranceEstimate {
    id: number
    patient_id: number
    association_id: number | null
    treatment_plan_item_id: number | null
    service_date: string
    treatment_description: string
    gross_amount: string
    currency: string
    status: 'resolved' | 'unresolved' | 'excluded'
    insurer_amount: string | null
    patient_amount: string | null
    calculation: { reason_codes?: string[] }
    provisional: true
    superseded: boolean
    stale: boolean
    stale_reason_codes: string[]
    recorded_at: string
}

export const listTreatmentPlanEstimates = async (
    patientId: number,
    planId: number,
) =>
    apiClient.getData<InsuranceEstimate[]>(
        `/api/patients/${patientId}/insurance-estimates`,
        { params: { treatment_plan_id: planId, latest_only: true, per_page: 100 } },
    )

export const createTreatmentPlanItemEstimate = async (
    planId: number,
    itemId: number,
    input: {
        service_date: string
        currency: string
        association_id?: number | null
        benefit_rule_id?: number | null
    },
) =>
    apiClient.postData<{ estimate: InsuranceEstimate }>(
        `/api/treatment-plans/${planId}/items/${itemId}/insurance-estimates`,
        input,
    )
