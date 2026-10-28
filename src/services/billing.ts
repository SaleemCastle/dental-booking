import { apiRequestWithSignal, PaginationMeta } from '../lib/api'
import { moneyMinor } from '../lib/billing'

export type InvoiceStatus =
    | 'draft'
    | 'issued'
    | 'partially_paid'
    | 'paid'
    | 'void'
export interface InvoiceItem {
    id: number
    description: string
    unit_price: string
    quantity: number
    total?: string
    line_total?: string
}
export interface Invoice {
    id: number
    patient_id: number
    appointment_id: number | null
    invoice_number: string
    currency: string
    due_date: string | null
    status: InvoiceStatus
    amount_due: string
    amount_paid: string
    balance: string
    items: InvoiceItem[]
    void_reason?: string | null
    created_at: string
}
export type PaymentMethod =
    | 'cash'
    | 'bank_transfer'
    | 'card'
    | 'check'
    | 'other'
export interface Payment {
    id: number
    invoice_id: number
    amount: string
    currency: string
    payment_method: PaymentMethod
    status: 'paid'
    reference: string | null
    receipt_number: string | null
    paid_at: string
    created_at: string
}
export type PaymentLinkStatus =
    | 'creating'
    | 'active'
    | 'pending'
    | 'completed'
    | 'expired'
    | 'cancelled'
    | 'failed'
    | 'unknown'
export interface PaymentLink {
    id: number
    invoice_id: number
    provider: string
    external_reference: string | null
    checkout_url: string | null
    expires_at: string | null
    status: PaymentLinkStatus
    amount: string
    currency: string
    idempotency_key: string
    created_at: string
    updated_at: string
}
export type NewInvoiceItem = { quantity: number } & (
    | { treatment_plan_item_id: number }
    | { treatment_id: number }
    | { description: string; unit_price: string }
)
export interface NewInvoice {
    patient_id: number
    appointment_id?: number | null
    invoice_number: string
    currency: string
    due_date?: string | null
    items: NewInvoiceItem[]
}
export interface NewPayment {
    invoice_id: number
    amount: string
    currency: string
    payment_method: PaymentMethod
    idempotency_key: string
    reference?: string | null
    receipt_number?: string | null
    paid_at?: string
}
export interface BillingOptions {
    tenantId: number
    signal?: AbortSignal
}
export interface BillingPage<T> {
    records: T[]
    meta: PaginationMeta
}
const call = <T>(
    options: BillingOptions,
    method: 'get' | 'post' | 'patch',
    url: string,
    data?: unknown,
    params?: object,
) =>
    apiRequestWithSignal<T>(
        {
            method,
            url,
            data,
            params,
            headers: { 'X-Tenant-Id': options.tenantId },
        },
        options.signal,
    )
const page = async <T>(
    url: string,
    params: object,
    options: BillingOptions,
): Promise<BillingPage<T>> => {
    const response = await call<T[]>(options, 'get', url, undefined, params)
    if (!Array.isArray(response.data))
        throw new Error('The billing response could not be read. Please retry.')
    const envelope = response.meta as PaginationMeta & {
        pagination?: PaginationMeta
    }
    const meta = envelope?.pagination ?? envelope ?? {}
    const currentPage = Number(
        meta.currentPage ??
            meta.current_page ??
            (params as { page?: number }).page ??
            1,
    )
    const lastPage = Number(meta.lastPage ?? meta.last_page)
    if (
        !Number.isSafeInteger(currentPage) ||
        currentPage < 1 ||
        !Number.isSafeInteger(lastPage) ||
        lastPage < 1
    )
        throw new Error('Billing pagination could not be read. Please retry.')
    return {
        records: response.data,
        meta: {
            ...meta,
            currentPage,
            lastPage,
        },
    }
}
export const getInvoices = (
    params: {
        patient_id?: number
        status?: InvoiceStatus
        page?: number
        per_page?: number
    },
    options: BillingOptions,
) =>
    page<Invoice>(
        '/api/invoices',
        { page: 1, per_page: 15, ...params },
        options,
    )
export const getInvoice = async (id: number, options: BillingOptions) =>
    (await call<{ invoice: Invoice }>(options, 'get', `/api/invoices/${id}`))
        .data.invoice
const pick = (value: object, keys: string[]) =>
    Object.fromEntries(
        keys
            .filter(key => value[key] !== undefined)
            .map(key => [key, value[key]]),
    )
export const createInvoice = async (
    payload: NewInvoice,
    options: BillingOptions,
) =>
    (
        await call<{ invoice: Invoice }>(options, 'post', '/api/invoices', {
            ...pick(payload, [
                'patient_id',
                'appointment_id',
                'invoice_number',
                'currency',
                'due_date',
            ]),
            items: payload.items.map(item => ({
                quantity: item.quantity,
                ...('treatment_plan_item_id' in item
                    ? pick(item, ['treatment_plan_item_id'])
                    : 'treatment_id' in item
                    ? pick(item, ['treatment_id'])
                    : pick(item, ['description', 'unit_price'])),
            })),
        })
    ).data.invoice
export type InvoiceUpdate =
    | { invoice_number?: string; due_date?: string | null }
    | { status: 'issued' }
    | { status: 'void'; void_reason: string }
export const updateInvoice = async (
    id: number,
    payload: InvoiceUpdate,
    options: BillingOptions,
) =>
    (
        await call<{ invoice: Invoice }>(
            options,
            'patch',
            `/api/invoices/${id}`,
            pick(
                payload,
                'status' in payload
                    ? payload.status === 'void'
                        ? ['status', 'void_reason']
                        : ['status']
                    : ['invoice_number', 'due_date'],
            ),
        )
    ).data.invoice
export const getPayments = (
    params: { invoice_id?: number; page?: number; per_page?: number },
    options: BillingOptions,
) =>
    page<Payment>(
        '/api/payments',
        { page: 1, per_page: 15, ...params },
        options,
    )
export const getPayment = async (id: number, options: BillingOptions) =>
    (await call<{ payment: Payment }>(options, 'get', `/api/payments/${id}`))
        .data.payment
export const getInvoicePaymentLinks = (
    invoiceId: number,
    params: { page?: number; per_page?: number },
    options: BillingOptions,
) =>
    page<PaymentLink>(
        `/api/invoices/${invoiceId}/payment-links`,
        { page: 1, per_page: 15, ...params },
        options,
    )
// Read the entire history before deciding whether another checkout is safe.
// An outstanding reservation can be on any page, including an older attempt.
export const getInvoicePaymentLinkHistory = async (
    invoiceId: number,
    options: BillingOptions,
) => {
    const attempts: PaymentLink[] = []
    let next = 1
    let last = 1
    do {
        const result = await getInvoicePaymentLinks(
            invoiceId,
            { page: next, per_page: 100 },
            options,
        )
        if (result.records.some(link => link.invoice_id !== invoiceId))
            throw new Error('Payment links are unavailable for this invoice.')
        attempts.push(...result.records)
        last = Number(result.meta.lastPage)
        next++
    } while (next <= last)
    return attempts
}
export const createPaymentLink = async (
    invoiceId: number,
    payload: { idempotency_key: string },
    options: BillingOptions,
) =>
    (
        await call<{ payment_link: PaymentLink }>(
            options,
            'post',
            `/api/invoices/${invoiceId}/payment-links`,
            { idempotency_key: payload.idempotency_key },
        )
    ).data.payment_link
export const getPaymentLink = async (id: number, options: BillingOptions) =>
    (
        await call<{ payment_link: PaymentLink }>(
            options,
            'get',
            `/api/payment-links/${id}`,
        )
    ).data.payment_link
export const refreshPaymentLink = async (id: number, options: BillingOptions) =>
    (
        await call<{ payment_link: PaymentLink }>(
            options,
            'post',
            `/api/payment-links/${id}/refresh`,
            {},
        )
    ).data.payment_link
export const cancelPaymentLink = async (id: number, options: BillingOptions) =>
    (
        await call<{ payment_link: PaymentLink }>(
            options,
            'post',
            `/api/payment-links/${id}/cancel`,
            {},
        )
    ).data.payment_link
export const recordPayment = async (
    payload: NewPayment,
    options: BillingOptions,
) =>
    (
        await call<{ payment: Payment }>(
            options,
            'post',
            '/api/payments',
            pick(payload, [
                'invoice_id',
                'amount',
                'currency',
                'payment_method',
                'idempotency_key',
                'reference',
                'receipt_number',
                'paid_at',
            ]),
        )
    ).data.payment

// Read every page before exposing a patient balance. A filtered/history page is
// never presented as the patient's total. Failed reads reject the entire total.
export const getPatientBillingBalances = async (
    patientId: number,
    options: BillingOptions,
) => {
    const totals: Record<string, number> = {}
    let next = 1
    let last = 1
    do {
        const result = await getInvoices(
            { patient_id: patientId, page: next, per_page: 100 },
            options,
        )
        for (const invoice of result.records) {
            if (invoice.patient_id !== patientId)
                throw new Error('Patient billing is unavailable.')
            if (['draft', 'void'].includes(invoice.status)) continue
            const value = moneyMinor(invoice.balance)
            if (value === null)
                throw new Error('The patient balance could not be read.')
            totals[invoice.currency] = (totals[invoice.currency] ?? 0) + value
            if (!Number.isSafeInteger(totals[invoice.currency]))
                throw new Error('The patient balance is too large to display.')
        }
        last = Number(result.meta.lastPage)
        next++
    } while (next <= last)
    return totals
}
