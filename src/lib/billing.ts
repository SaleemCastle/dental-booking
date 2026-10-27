import type { Invoice, NewPayment } from '../services/billing'

export const maxInvoiceMinor = 9999999999
export const moneyMinor = (value: string): number | null => {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
    const [whole, fraction = ''] = value.split('.')
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return Number.isSafeInteger(result) && result <= maxInvoiceMinor
        ? result
        : null
}
export const decimalMoney = (minor: number) =>
    `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`
export const displayMoney = (value: string, currency: string) =>
    `${currency} ${value}`
export const invoiceStatusLabels = {
    draft: 'Draft',
    issued: 'Issued',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    void: 'Void',
}
export const canSettleInvoice = (invoice: Invoice) =>
    ['issued', 'partially_paid'].includes(invoice.status) &&
    (moneyMinor(invoice.balance) ?? 0) > 0
export const canVoidInvoice = (invoice: Invoice) =>
    ['draft', 'issued'].includes(invoice.status) &&
    moneyMinor(invoice.amount_paid) === 0
export const paymentMethods = {
    cash: 'Cash',
    bank_transfer: 'Bank transfer',
    card: 'Card (already settled)',
    check: 'Check',
    other: 'Other',
}
export const newPaymentKey = () => `staff-${globalThis.crypto.randomUUID()}`
export const validatePayment = (
    payload: NewPayment,
    invoice?: Invoice,
): Record<string, string[]> => {
    const errors: Record<string, string[]> = {}
    const amount = moneyMinor(payload.amount)
    if (amount === null || amount <= 0)
        errors.amount = [
            'Enter a positive amount with at most two decimal places.',
        ]
    if (!Number.isSafeInteger(payload.invoice_id) || payload.invoice_id <= 0)
        errors.invoice_id = ['Enter a valid invoice ID.']
    if (!/^[A-Z]{3}$/.test(payload.currency))
        errors.currency = ['Enter an uppercase three-letter currency.']
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(payload.idempotency_key))
        errors.idempotency_key = ['Enter a valid payment key.']
    if (!(payload.payment_method in paymentMethods))
        errors.payment_method = ['Choose a payment method.']
    for (const key of ['reference', 'receipt_number'] as const) {
        const value = payload[key]
        if (
            value &&
            (value.length > 255 ||
                Array.from(value).some(
                    character =>
                        character.charCodeAt(0) < 32 ||
                        character.charCodeAt(0) === 127,
                ))
        )
            errors[key] = [
                'Use a receipt or transaction identifier of at most 255 characters.',
            ]
    }
    if (
        payload.paid_at &&
        (Number.isNaN(Date.parse(payload.paid_at)) ||
            Date.parse(payload.paid_at) > Date.now())
    )
        errors.paid_at = [
            'Payment time must be valid and cannot be in the future.',
        ]
    if (invoice) {
        if (!canSettleInvoice(invoice))
            errors.invoice_id = ['This invoice cannot accept payments.']
        if (invoice.currency !== payload.currency)
            errors.currency = ['Currency must match the invoice.']
        if (amount !== null && amount > (moneyMinor(invoice.balance) ?? 0))
            errors.amount = ['Payment cannot exceed the remaining balance.']
    }
    return errors
}
