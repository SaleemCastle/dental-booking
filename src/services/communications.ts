import { apiRequestWithSignal } from '../lib/api'

export const communicationEvents = [
    'payment.recorded',
    'payment_link.created',
    'payment_link.failed',
    'payment_link.expired',
] as const
export type CommunicationEvent = typeof communicationEvents[number]
export interface PatientContact {
    id: number
    channel: 'email' | 'sms'
    address: string
    role: 'patient' | 'billing_copy'
    authorized_events: CommunicationEvent[]
    verified_at: string | null
    revoked_at: string | null
}
export interface CommunicationDelivery {
    id: number
    channel: string
    status: string
    attempt_count?: number
    accepted_at?: string | null
    delivered_at?: string | null
    failure_reason?: string | null
}
export interface CommunicationHistoryEvent {
    id: number
    event_type: string
    trigger?: string
    selection_outcome?: string
    created_at: string
    deliveries: CommunicationDelivery[]
}
export const communicationRequest = <T>(
    tenantId: number,
    method: 'get' | 'post' | 'delete',
    url: string,
    data?: unknown,
    params?: object,
) =>
    apiRequestWithSignal<T>({
        method,
        url,
        data,
        params,
        headers: { 'X-Tenant-Id': tenantId },
    })

export const deliveryLabels: Record<string, string> = {
    pending: 'Queued',
    processing: 'Sending',
    retry: 'Queued for retry',
    accepted: 'Sent · provider accepted',
    delivered: 'Delivered',
    failed: 'Failed',
    suppressed: 'Suppressed',
    unknown: 'Unknown · investigate before sending again',
}
