import type { PaymentLink } from '../services/billing'

export const paymentLinkLabels = {
    creating: 'Creating',
    active: 'Active',
    pending: 'Pending payment',
    completed: 'Completed',
    expired: 'Expired',
    cancelled: 'Cancelled',
    failed: 'Failed',
    unknown: 'Reconciliation required',
}
export const blocksInvoicePayments = (link: PaymentLink) =>
    ['creating', 'active', 'pending', 'unknown', 'completed'].includes(
        link.status,
    )

// A local expiry timestamp never proves that the remote checkout is disabled.
export const activeCheckoutUrl = (link: PaymentLink): string | null => {
    if (link.status !== 'active' || !link.checkout_url) return null
    try {
        const url = new URL(link.checkout_url)
        return url.protocol === 'https:' && !url.username && !url.password
            ? url.href
            : null
    } catch {
        return null
    }
}

export const newPaymentLinkKey = () =>
    `checkout-${globalThis.crypto.randomUUID()}`
export const paymentLinkKeyStorage = (tenantId: number, invoiceId: number) =>
    `billing:payment-link:${tenantId}:${invoiceId}`
export const readPaymentLinkKey = (tenantId: number, invoiceId: number) => {
    try {
        const key = window.sessionStorage.getItem(
            paymentLinkKeyStorage(tenantId, invoiceId),
        )
        return key && /^[A-Za-z0-9._:-]{1,100}$/.test(key) ? key : null
    } catch {
        return null
    }
}
export const savePaymentLinkKey = (
    tenantId: number,
    invoiceId: number,
    key: string | null,
) => {
    try {
        const storageKey = paymentLinkKeyStorage(tenantId, invoiceId)
        if (key) window.sessionStorage.setItem(storageKey, key)
        else window.sessionStorage.removeItem(storageKey)
    } catch {
        // The in-memory key remains stable when browser storage is unavailable.
    }
}
