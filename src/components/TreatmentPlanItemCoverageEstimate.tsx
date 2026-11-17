import React, { FormEvent, useState } from 'react'
import { normalizeAxiosError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import { AuthUser } from '../lib/auth-session'
import {
    createTreatmentPlanItemEstimate,
    InsuranceEstimate,
} from '../services/insurance-estimates'
import { TreatmentPlanItem } from '../services/treatment-plans'
import { displayMoney } from '../lib/billing'
import AppointmentDialog, {
    appointmentButtonClass as button,
    appointmentInputClass as input,
    appointmentPrimaryClass as primary,
} from './AppointmentDialog'

export default function TreatmentPlanItemCoverageEstimate({
    user,
    planId,
    item,
}: {
    user: AuthUser | null
    planId: number
    item: TreatmentPlanItem
}) {
    const permissions = getUserPermissionSet(user)
    const allowed =
        permissions.has('patients.view') &&
        permissions.has('treatment_plans.view') &&
        permissions.has('insurance_estimates.create')
    const [open, setOpen] = useState(false)
    const [date, setDate] = useState('')
    const [currency, setCurrency] = useState('')
    const [association, setAssociation] = useState('')
    const [benefit, setBenefit] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [estimate, setEstimate] = useState<InsuranceEstimate | null>(null)
    if (!allowed) return null
    const save = async (event: FormEvent) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        try {
            const created = await createTreatmentPlanItemEstimate(planId, item.id, {
                service_date: date,
                currency: currency.trim().toUpperCase(),
                ...(association ? { association_id: Number(association) } : {}),
                ...(benefit ? { benefit_rule_id: Number(benefit) } : {}),
            })
            setEstimate(created.estimate)
            setOpen(false)
        } catch (failure) {
            setError(normalizeAxiosError(failure).message)
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="space-y-2">
            <button type="button" className={button} onClick={() => setOpen(true)}>
                Request provisional coverage estimate
            </button>
            {estimate && (
                <p role="status" className="text-sm">
                    Provisional estimate: {estimate.status === 'resolved'
                        ? `insurer ${displayMoney(estimate.insurer_amount!, estimate.currency)}, patient ${displayMoney(estimate.patient_amount!, estimate.currency)}`
                        : `${estimate.status} (${estimate.calculation.reason_codes?.join(', ') || estimate.status})`}
                    . No payment or receivable was recorded.
                </p>
            )}
            {open && (
                <AppointmentDialog title="Request provisional coverage estimate" onClose={() => setOpen(false)} busy={busy} closeLabel="Close estimate form">
                    <form onSubmit={save} className="space-y-4 p-6">
                        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                        <p className="text-sm">{item.treatment_name} · {item.estimated_price}. The treatment description and amount are taken from this plan item. Select a service date and currency; procedure codes are not inferred.</p>
                        <label className="block text-sm">Service date
                            <input type="date" required value={date} className={input} onChange={event => setDate(event.target.value)} />
                        </label>
                        <label className="block text-sm">Currency code
                            <input required maxLength={3} pattern="[A-Za-z]{3}" value={currency} className={input} onChange={event => setCurrency(event.target.value)} placeholder="e.g. JMD" />
                        </label>
                        <label className="block text-sm">Patient insurance association ID (optional)
                            <input inputMode="numeric" pattern="[0-9]*" value={association} className={input} onChange={event => setAssociation(event.target.value)} />
                        </label>
                        <label className="block text-sm">Explicit benefit observation ID (optional)
                            <input inputMode="numeric" pattern="[0-9]*" value={benefit} className={input} onChange={event => setBenefit(event.target.value)} />
                        </label>
                        <p className="text-xs text-clinic-muted">Leaving the benefit blank records an unresolved snapshot. Estimates are informational and do not confirm payment or insurer acceptance.</p>
                        <button type="submit" className={primary} disabled={busy}>{busy ? 'Saving...' : 'Create estimate snapshot'}</button>
                    </form>
                </AppointmentDialog>
            )}
        </div>
    )
}
