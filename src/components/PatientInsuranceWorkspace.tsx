import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { getInsurancePermissions } from '../lib/permissions'
import { insuranceApi, InsuranceOptions, InsuranceRecord } from '../services/insurance'
import {
    formatRecord,
    InsuranceButton,
    InsuranceCard,
    InsuranceField,
    InsuranceForm,
    InsuranceTimeline,
    randomCommandKey,
} from './insurance/InsurancePrimitives'

const text = (record: Record<string, unknown>, key: string) => {
    const value = record[key]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
const num = (record: Record<string, unknown>, key: string) => {
    const value = Number(record[key])
    return Number.isSafeInteger(value) && value > 0 ? value : null
}
const version = (record: Record<string, unknown>) =>
    Number(record.lock_version ?? record.version ?? 1)
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Insurance records are unavailable.'
const chronological = (rows: InsuranceRecord[]) => [...rows].sort((a, b) =>
    Date.parse(text(a, 'recorded_at') || text(a, 'created_at')) - Date.parse(text(b, 'recorded_at') || text(b, 'created_at')),
)

const historyFields: Array<[string, string]> = [
    ['outcome', 'Reported outcome'], ['channel', 'Channel'], ['source', 'Source'],
    ['service_date', 'Service date'], ['checked_at', 'Check time'], ['reason', 'Reason'],
    ['coverage_priority', 'Recorded priority'], ['active', 'Association active'],
]

function PatientAssociationPanel({
    patientId,
    association,
    options,
    access,
    onChanged,
}: {
    patientId: number
    association: InsuranceRecord
    options: InsuranceOptions
    access: ReturnType<typeof getInsurancePermissions>
    onChanged: () => Promise<void>
}) {
    const associationId = association.id
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [history, setHistory] = useState<InsuranceRecord[]>([])
    const [policies, setPolicies] = useState<InsuranceRecord[]>([])
    const [checks, setChecks] = useState<InsuranceRecord[]>([])
    const [benefits, setBenefits] = useState<InsuranceRecord[]>([])
    const [revealed, setRevealed] = useState<Record<string, InsuranceRecord>>({})
    const [claimError, setClaimError] = useState('')
    const [claims, setClaims] = useState<InsuranceRecord[]>([])
    const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null)
    const [claimDetails, setClaimDetails] = useState<InsuranceRecord | null>(null)
    const [submissions, setSubmissions] = useState<InsuranceRecord[]>([])
    const [claimEvents, setClaimEvents] = useState<InsuranceRecord[]>([])
    const [responses, setResponses] = useState<InsuranceRecord[]>([])
    const [appeals, setAppeals] = useState<InsuranceRecord[]>([])
    const [authorizations, setAuthorizations] = useState<InsuranceRecord[]>([])
    const [authorizationHistory, setAuthorizationHistory] = useState<Record<number, InsuranceRecord[]>>({})

    const reload = useCallback(async () => {
        setLoading(true)
        setError('')
        const tasks: Array<Promise<unknown>> = []
        if (access.patientView) {
            tasks.push(insuranceApi.patient.associationHistory(options, patientId, associationId).then(page => setHistory(page.records)))
            tasks.push(insuranceApi.patient.policies(options, patientId, associationId).then(page => setPolicies(page.records)))
            tasks.push(insuranceApi.patient.checks(options, patientId, associationId).then(page => setChecks(page.records)))
            tasks.push(insuranceApi.patient.benefits(options, patientId, associationId).then(page => setBenefits(page.records)))
        }
        if (access.claimsView)
            tasks.push(insuranceApi.claims.list(options, patientId).then(page => setClaims(page.records.filter(item => Number(item.association_id) === associationId))))
        if (access.priorAuthorizationsView)
            tasks.push(insuranceApi.authorizations.list(options, patientId).then(page => setAuthorizations(page.records.filter(item => Number(item.association_id) === associationId))))
        const results = await Promise.allSettled(tasks)
        const failed = results.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') setError(errorText(failed.reason))
        setLoading(false)
    }, [access, associationId, options, patientId])

    useEffect(() => { void reload() }, [reload])

    const refresh = async () => {
        await reload()
        await onChanged()
    }

    const policyFields: InsuranceField[] = [
        { name: 'policy_number', label: 'Policy number (sensitive)', maxLength: 255, clearable: true },
        { name: 'membership_id', label: 'Member ID (sensitive)', maxLength: 255, clearable: true },
        { name: 'subscriber_name', label: 'Subscriber name (sensitive)', maxLength: 255, clearable: true },
        { name: 'relationship', label: 'Patient relationship to subscriber', kind: 'select', clearable: true, options: ['self', 'spouse', 'child', 'other'].map(value => ({ value, label: value })) },
        { name: 'plan_id', label: 'Tenant plan ID (optional)', kind: 'number', min: 1, clearable: true },
        { name: 'effective_date', label: 'Effective date', kind: 'date', clearable: true },
        { name: 'expiry_date', label: 'Expiry date', kind: 'date', clearable: true },
        { name: 'reason', label: 'Reason for this policy revision', required: true, maxLength: 2000 },
    ]
    const checkFields: InsuranceField[] = [
        { name: 'outcome', label: 'Outcome reported by staff', kind: 'select', required: true, options: ['unknown', 'active', 'inactive', 'unable_to_verify'].map(value => ({ value, label: value })) },
        { name: 'channel', label: 'Manual source channel', kind: 'select', required: true, options: ['external_card', 'external_portal', 'telephone', 'paper', 'other'].map(value => ({ value, label: value })) },
        { name: 'checked_at', label: 'When staff checked', kind: 'datetime-local', required: true },
        { name: 'service_date', label: 'Optional service date', kind: 'date' },
        { name: 'policy_revision_id', label: 'Policy revision ID (optional)', kind: 'number', min: 1 },
        { name: 'reference', label: 'External reference (sensitive)', maxLength: 255 },
        { name: 'provenance', label: 'What staff observed and where', kind: 'textarea', required: true, maxLength: 2000 },
    ]
    const benefitFields: InsuranceField[] = [
        { name: 'source', label: 'Reported source', kind: 'select', required: true, options: [{ value: 'patient_reported', label: 'Patient reported' }, { value: 'staff_observation', label: 'Staff observation' }] },
        { name: 'scope', label: 'Scope', kind: 'select', required: true, options: ['all', 'category', 'procedure'].map(value => ({ value, label: value })) },
        { name: 'category', label: 'Category (for category scope)', maxLength: 255 },
        { name: 'procedure_code', label: 'Procedure code (only if known)', maxLength: 100 },
        { name: 'code_system', label: 'Code system (optional)', maxLength: 100 },
        { name: 'coverage', label: 'Reported coverage', kind: 'select', required: true, options: ['covered', 'excluded', 'unknown', 'unspecified'].map(value => ({ value, label: value })) },
        { name: 'benefit_type', label: 'Reported benefit type', kind: 'select', required: true, options: ['percentage', 'fixed', 'unknown', 'unspecified'].map(value => ({ value, label: value })) },
        { name: 'percentage', label: 'Reported percentage', pattern: '^\\d{1,3}(\\.\\d{1,2})?$' },
        { name: 'amount', label: 'Reported fixed amount', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' },
        { name: 'currency', label: 'Currency for reported amounts', maxLength: 3, pattern: '[A-Z]{3}' },
        { name: 'annual_limit', label: 'Reported annual limit', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' },
        { name: 'visit_limit', label: 'Reported visit limit', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' },
        { name: 'procedure_limit', label: 'Reported procedure limit', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' },
        { name: 'waiting_period_days', label: 'Reported waiting period (days)', kind: 'number', min: 0 },
        { name: 'prior_authorization_required', label: 'Was prior authorization reported as required?', kind: 'boolean' },
        { name: 'service_from', label: 'Reported service date from', kind: 'date' },
        { name: 'service_to', label: 'Reported service date through', kind: 'date' },
        { name: 'observed_at', label: 'Observation time', kind: 'datetime-local', required: true },
        { name: 'reference', label: 'External reference (sensitive)', maxLength: 255 },
        { name: 'provenance', label: 'Source and what was reported', kind: 'textarea', required: true, maxLength: 2000 },
        { name: 'reason', label: 'Record or correction reason', kind: 'textarea', required: true, maxLength: 2000 },
        { name: 'supersedes_id', label: 'Prior benefit observation ID to correct (optional)', kind: 'number', min: 1 },
    ]

    const createPolicy = async (input: Record<string, string | number | boolean | null>) => {
        const latest = policies.reduce((max, item) => Math.max(max, Number(item.version ?? 0)), 0)
        const { reason, ...fields } = input
        const nonempty = Object.entries(fields).filter(([, value]) => value !== null && value !== '')
        if (!nonempty.length) throw new Error('Enter at least one policy field or select a field to clear.')
        await insuranceApi.patient.createPolicyRevision(options, patientId, associationId, {
            ...Object.fromEntries(nonempty), expected_version: latest, reason,
        })
        await refresh()
    }

    const recordCheck = async (input: Record<string, string | number | boolean | null>) => {
        await insuranceApi.patient.createCheck(options, patientId, associationId, input)
        await refresh()
    }
    const recordBenefit = async (input: Record<string, string | number | boolean | null>) => {
        await insuranceApi.patient.createBenefit(options, patientId, associationId, input)
        await refresh()
    }

    const reveal = async (kind: 'policy' | 'check' | 'benefit', id: number) => {
        const key = `${kind}-${id}`
        try {
            const record = kind === 'policy'
                ? await insuranceApi.patient.revealPolicy(options, patientId, associationId, id)
                : kind === 'check'
                ? await insuranceApi.patient.revealCheck(options, patientId, associationId, id)
                : await insuranceApi.patient.benefitDetails(options, patientId, associationId, id)
            setRevealed(previous => ({ ...previous, [key]: record }))
        } catch (failure) {
            setError(errorText(failure))
        }
    }

    return (
        <div className="space-y-5">
            <InsuranceCard title="Patient-insurer relationship" description="Provider association status and priority are administrative records. Neither establishes eligibility or primary coverage by list order.">
                <p className="text-sm font-semibold text-clinic-ink">{text(association, 'insurer_name') || text(association, 'unverified_insurer_name') || `Insurer #${association.insurer_id ?? 'unverified'}`}</p>
                <p className="text-xs text-clinic-muted">Association #{associationId} · priority {association.coverage_priority == null ? 'not assigned' : String(association.coverage_priority)} · {association.active === false ? 'inactive association' : 'association record active'}</p>
                {error && <p role="alert" className="rounded border border-rose-200 bg-clinic-rose p-3 text-sm text-rose-800">{error}</p>}
                {loading ? <p role="status" className="text-sm text-clinic-muted">Loading insurance history…</p> : (
                    <div className="space-y-5">
                        <div>
                            <h4 className="mb-2 text-sm font-bold">Association history</h4>
                            <InsuranceTimeline records={history} empty="No association revisions are recorded." renderRecord={record => formatRecord(record, historyFields)} />
                        </div>
                        <div className="grid gap-5 xl:grid-cols-2">
                            <div className="space-y-3">
                                <h4 className="text-sm font-bold">Policy history</h4>
                                <InsuranceTimeline records={policies} empty="No policy details recorded. A provider-only association is valid." renderRecord={record => (
                                    <>
                                        {formatRecord(record, [['policy_number_masked', 'Policy number (masked)'], ['membership_id_masked', 'Member ID (masked)'], ['has_subscriber_name', 'Subscriber name recorded'], ['relationship', 'Patient relationship'], ['plan_id', 'Plan ID'], ['effective_date', 'Effective date'], ['expiry_date', 'Expiry date'], ['version', 'Policy revision']])}
                                        {access.patientReveal && num(record, 'id') && <InsuranceButton onClick={() => void reveal('policy', num(record, 'id')!)}>Audited reveal identifiers</InsuranceButton>}
                                        {revealed[`policy-${record.id}`] && <p role="status" className="mt-2 whitespace-pre-wrap rounded bg-clinic-canvas p-3 text-xs">{JSON.stringify(revealed[`policy-${record.id}`])}</p>}
                                    </>
                                )} />
                                {access.patientManage && <InsuranceForm fields={policyFields} submitLabel="Record policy revision" onSubmit={createPolicy} note="Policy fields are encrypted by the API. Blank fields are retained; use a clear checkbox to explicitly clear one. The patient relationship records self, spouse, child or other; it grants no access to another patient." />}
                            </div>
                            <div className="space-y-3">
                                <h4 className="text-sm font-bold">Manual eligibility observations</h4>
                                <p className="text-xs text-clinic-muted">These are staff-recorded external reports, not live checks or guarantees. An active report is not confirmed benefits or payment.</p>
                                <InsuranceTimeline records={checks} empty="No manual eligibility observations recorded." renderRecord={record => (
                                    <>
                                        {formatRecord(record, [['outcome', 'Reported outcome'], ['channel', 'Manual channel'], ['source', 'Record type'], ['service_date', 'Service date'], ['checked_at', 'Checked at'], ['has_reference', 'External reference recorded']])}
                                        {access.patientReveal && num(record, 'id') && <InsuranceButton onClick={() => void reveal('check', num(record, 'id')!)}>Audited reveal provenance</InsuranceButton>}
                                        {revealed[`check-${record.id}`] && <p role="status" className="mt-2 whitespace-pre-wrap rounded bg-clinic-canvas p-3 text-xs">{JSON.stringify(revealed[`check-${record.id}`])}</p>}
                                    </>
                                )} />
                                {access.patientManage && <InsuranceForm fields={checkFields} submitLabel="Record manual observation" onSubmit={recordCheck} note="No insurer or card-reader integration is called. Check date and service date are separate; a missing service date means unspecified scope." />}
                            </div>
                        </div>
                        <div>
                            <h4 className="mb-2 text-sm font-bold">Benefit observations</h4>
                            <p className="mb-3 text-xs text-clinic-muted">Source and coverage are recorded observations only. No current coverage resolver, benefit use, or limit consumption is implied.</p>
                            <InsuranceTimeline records={benefits} empty="No benefit rules or patient-reported benefit observations recorded." renderRecord={record => (
                                <>
                                    {formatRecord(record, [['source', 'Reported source'], ['scope', 'Scope'], ['coverage', 'Reported coverage'], ['benefit_type', 'Reported benefit type'], ['percentage', 'Reported percentage'], ['amount', 'Reported amount'], ['currency', 'Currency'], ['annual_limit', 'Reported annual cap'], ['visit_limit', 'Reported visit cap'], ['procedure_limit', 'Reported procedure cap'], ['prior_authorization_required', 'Prior authorization reported'], ['service_from', 'Service dates from'], ['service_to', 'Service dates through'], ['confirmation', 'Confirmation']])}
                                    <p className="mt-2 text-xs font-semibold text-amber-800">Unconfirmed benefit observation · not a payer decision or financial limit balance</p>
                                    {access.patientReveal && num(record, 'id') && <InsuranceButton onClick={() => void reveal('benefit', num(record, 'id')!)}>Audited reveal provenance</InsuranceButton>}
                                    {revealed[`benefit-${record.id}`] && <p role="status" className="mt-2 whitespace-pre-wrap rounded bg-clinic-canvas p-3 text-xs">{JSON.stringify(revealed[`benefit-${record.id}`])}</p>}
                                </>
                            )} />
                            {access.patientManage && <InsuranceForm fields={benefitFields} submitLabel="Record unconfirmed benefit observation" onSubmit={recordBenefit} note="Corrections append a new observation linked by supersedes_id. Monetary values remain the reported source values; no calculations, confirmation, currency conversion or benefit-limit consumption occur." />}
                        </div>
                        {access.claimsView && <ClaimWorkflow patientId={patientId} associationId={associationId} options={options} access={access} onChanged={refresh} />}
                        {access.priorAuthorizationsView && <PriorAuthorizationWorkflow patientId={patientId} associationId={associationId} options={options} access={access} onChanged={refresh} />}
                    </div>
                )}
            </InsuranceCard>
        </div>
    )
}

function ClaimWorkflow({
    patientId, associationId, options, access, onChanged,
}: {
    patientId: number; associationId: number; options: InsuranceOptions
    access: ReturnType<typeof getInsurancePermissions>; onChanged: () => Promise<void>
}) {
    const [claims, setClaims] = useState<InsuranceRecord[]>([])
    const [selected, setSelected] = useState<InsuranceRecord | null>(null)
    const [submissions, setSubmissions] = useState<InsuranceRecord[]>([])
    const [responses, setResponses] = useState<InsuranceRecord[]>([])
    const [events, setEvents] = useState<InsuranceRecord[]>([])
    const [appeals, setAppeals] = useState<InsuranceRecord[]>([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const reload = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const result = await insuranceApi.claims.list(options, patientId)
            setClaims(result.records.filter(record => Number(record.association_id) === associationId))
        } catch (failure) { setError(errorText(failure)) } finally { setLoading(false) }
    }, [associationId, options, patientId])
    useEffect(() => { void reload() }, [reload])
    const refresh = async () => { await reload(); await onChanged() }
    const selectClaim = async (claim: Record<string, unknown>) => {
        setSelected(claim as InsuranceRecord)
        setError('')
        try {
            const id = num(claim, 'id')
            if (!id) throw new Error('The selected claim record is invalid.')
            const jobs: Array<Promise<unknown>> = []
            if (access.claimsView) jobs.push(Promise.all([
                insuranceApi.claims.show(options, patientId, id).then(row => setSelected(row)),
                insuranceApi.claims.submissions(options, patientId, id).then(page => setSubmissions(page.records)),
                insuranceApi.claims.events(options, patientId, id).then(page => setEvents(page.records)),
            ]))
            if (access.claimResponsesView) jobs.push(insuranceApi.claims.responses(options, patientId, id).then(page => setResponses(page.records)))
            if (access.claimAppealsView) jobs.push(insuranceApi.claims.appeals(options, patientId, id).then(page => setAppeals(page.records)))
            const results = await Promise.allSettled(jobs)
            const failed = results.find(result => result.status === 'rejected')
            if (failed?.status === 'rejected') setError(errorText(failed.reason))
        } catch (failure) { setError(errorText(failure)) }
    }
    const action = async (run: () => Promise<unknown>) => { setError(''); try { await run(); await refresh(); if (selected) await selectClaim(selected) } catch (failure) { setError(errorText(failure)) } }
    const selectedId = selected ? num(selected, 'id') : null
    const lockVersion = selected ? version(selected) : 1
    return (
        <InsuranceCard title="Claims, responses and appeals" description="Claim readiness and submissions record clinic workflow only. They do not transmit to an insurer or imply acknowledgement, approval, or payment.">
            {error && <p role="alert" className="rounded border border-rose-200 bg-clinic-rose p-3 text-sm text-rose-800">{error}</p>}
            {loading ? <p role="status" className="text-sm text-clinic-muted">Loading claims…</p> : <InsuranceTimeline records={claims} empty="No claims recorded for this association." renderRecord={claim => <div className="flex flex-wrap items-center justify-between gap-3"><div>{formatRecord(claim, [['id', 'Local claim ID'], ['status', 'Clinic workflow state'], ['lock_version', 'Version'], ['corrects_claim_id', 'Corrects claim'], ['created_at', 'Created']])}</div><InsuranceButton onClick={() => void selectClaim(claim)}>Open claim history</InsuranceButton></div>} />}
            {access.claimsPrepare && <InsuranceForm fields={[
                { name: 'association_id', label: 'Association ID', kind: 'number', min: 1, required: true, help: `Current patient and association #${associationId}.` },
                { name: 'policy_revision_id', label: 'Policy revision ID (optional)', kind: 'number', min: 1 },
                { name: 'estimate_id', label: 'Estimate snapshot ID (optional)', kind: 'number', min: 1 },
            ]} submitLabel="Create claim draft" onSubmit={input => action(() => insuranceApi.claims.create(options, patientId, { ...input, association_id: associationId }))} note="The API binds this draft to the current patient and clinic. Claim IDs are local; no insurer is contacted." />}
            {selected && selectedId && <div className="space-y-4 rounded-md border border-clinic-line bg-clinic-canvas p-4">
                <h4 className="text-sm font-bold">Claim #{selectedId} · {text(selected, 'status') || 'status unavailable'}</h4>
                {formatRecord(selected, [['association_id', 'Association'], ['policy_revision_id', 'Policy revision'], ['estimate_id', 'Estimate snapshot'], ['corrects_claim_id', 'Corrected claim predecessor'], ['lock_version', 'Current version'], ['created_at', 'Created']])}
                {text(selected, 'status') === 'draft' && access.claimsPrepare && <InsuranceForm fields={[
                    { name: 'treatment_description', label: 'Treatment description', required: true, maxLength: 1000 },
                    { name: 'service_date', label: 'Service date', kind: 'date', required: true },
                    { name: 'quantity', label: 'Quantity', kind: 'number', min: 1, required: true },
                    { name: 'unit_amount', label: 'Unit amount', required: true, pattern: '^(0|[1-9][0-9]{0,7})(\\.[0-9]{1,2})?$' },
                    { name: 'currency', label: 'Currency', required: true, maxLength: 3, pattern: '[A-Z]{3}' },
                    { name: 'procedure_code', label: 'Procedure code (only if known)' },
                    { name: 'code_system', label: 'Code system (optional)' },
                    { name: 'treatment_plan_item_id', label: 'Treatment plan item ID (optional)', kind: 'number', min: 1 },
                    { name: 'expected_version', label: 'Expected claim version', kind: 'number', min: 1, required: true },
                ]} submitLabel="Add claim line" onSubmit={input => action(() => insuranceApi.claims.addLine(options, patientId, selectedId, { ...input, expected_version: lockVersion }))} note="Each line is a commercial snapshot. Use a real procedure code only when known; no invoice or balance changes." />}
                {text(selected, 'status') === 'draft' && <InsuranceButton onClick={() => void action(() => insuranceApi.claims.readiness(options, patientId, selectedId, lockVersion))}>Validate local claim readiness</InsuranceButton>}
                {['draft', 'ready'].includes(text(selected, 'status')) && access.claimsPrepare && <InsuranceForm fields={[{ name: 'reason', label: 'Cancellation reason', required: true, maxLength: 500 }]} submitLabel="Cancel claim" onSubmit={input => action(() => insuranceApi.claims.cancel(options, patientId, selectedId, lockVersion, String(input.reason)))} />}
                {['draft', 'ready'].includes(text(selected, 'status')) && access.claimsSubmit && <InsuranceForm fields={[{ name: 'channel', label: 'Staff submission channel', kind: 'select', required: true, options: ['portal', 'email', 'paper', 'other'].map(value => ({ value, label: value })) }, { name: 'method_note', label: 'Staff note (optional)', maxLength: 500 }]} submitLabel="Record staff submission" onSubmit={input => action(() => insuranceApi.claims.submit(options, patientId, selectedId, { expected_version: lockVersion, channel: input.channel, ...(input.method_note ? { channel_metadata: { method_note: input.method_note } } : {}) }, randomCommandKey()))} note="Records that staff submitted a snapshot. This does not send it or confirm insurer receipt." />}
                {['submitted'].includes(text(selected, 'status')) && access.claimCorrectionsPrepare && <InsuranceForm fields={[{ name: 'correction_reason', label: 'Reason for corrected claim', required: true, maxLength: 2000 }]} submitLabel="Create corrected claim draft" onSubmit={input => action(() => insuranceApi.claims.correct(options, patientId, selectedId, String(input.correction_reason)))} note="Creates a new claim linked to this predecessor; the original stays immutable." />}
                {access.claimResponsesRecord && <InsuranceForm fields={[
                    { name: 'submission_id', label: 'Submission record ID', kind: 'number', min: 1, required: true },
                    { name: 'response_type', label: 'Staff-recorded response', kind: 'select', required: true, options: ['acknowledged', 'under_review', 'additional_information_requested', 'rejected', 'approved', 'partially_approved', 'denied'].map(value => ({ value, label: value })) },
                    { name: 'insurer_response_at', label: 'Reported response time', kind: 'datetime-local', required: true },
                    { name: 'communication_channel', label: 'Manual channel', kind: 'select', required: true, options: ['phone', 'portal', 'email', 'fax', 'paper', 'other'].map(value => ({ value, label: value })) },
                    { name: 'requested_information', label: 'Additional information requested (required for that response type)', maxLength: 4000 },
                    { name: 'response_deadline', label: 'Reported response deadline', kind: 'date' },
                    { name: 'approved_amount', label: 'Reported approved amount (optional; not posted)' },
                    { name: 'currency', label: 'Currency when amount is supplied', maxLength: 3, pattern: '[A-Z]{3}' },
                    { name: 'insurer_reference', label: 'Reported insurer reference (sensitive)', maxLength: 255 },
                    { name: 'source_provenance', label: 'How staff received this response', kind: 'textarea', required: true, maxLength: 2000 },
                    { name: 'notes', label: 'Staff notes', kind: 'textarea', maxLength: 2000 },
                ]} submitLabel="Record manual response" onSubmit={input => {
                    if (input.response_type === 'additional_information_requested' && !input.requested_information) throw new Error('Enter the requested information before recording this response.')
                    return action(() => insuranceApi.claims.recordResponse(options, patientId, selectedId, input))
                }} note="Responses are staff-entered observations. An approved amount does not post a payment or confirm cash received." />}
                {access.claimAppealsManage && <InsuranceForm fields={[
                    { name: 'submission_id', label: 'Submission record ID', kind: 'number', min: 1, required: true },
                    { name: 'decision_response_id', label: 'Explicit coverage denial response ID', kind: 'number', min: 1, required: true },
                    { name: 'appeal_reason', label: 'Appeal reason', kind: 'textarea', required: true, maxLength: 8000 },
                ]} submitLabel="Create appeal draft" onSubmit={input => action(() => insuranceApi.claims.createAppeal(options, patientId, selectedId, input))} note="Only a recorded coverage denial qualifies by default; administrative rejections are not assumed appealable." />}
                <div className="grid gap-4 lg:grid-cols-2">
                    <div><h5 className="mb-2 text-sm font-bold">Immutable submission history</h5><InsuranceTimeline records={submissions} empty="No staff submission recorded." renderRecord={record => formatRecord(record, [['channel', 'Staff channel'], ['status', 'Local status'], ['submitted_at', 'Recorded at'], ['actor_id', 'Staff actor']])} /></div>
                    <div><h5 className="mb-2 text-sm font-bold">Manual insurer response history</h5><InsuranceTimeline records={responses} empty="No staff-recorded insurer responses." renderRecord={record => formatRecord(record, [['response_type', 'Reported response'], ['insurer_response_at', 'Reported at'], ['communication_channel', 'Manual channel'], ['requested_information', 'Requested information'], ['response_deadline', 'Reported deadline'], ['approved_amount', 'Reported approved amount'], ['currency', 'Currency'], ['actor_id', 'Staff actor']])} /></div>
                    <div><h5 className="mb-2 text-sm font-bold">Appeal history</h5><InsuranceTimeline records={appeals} empty="No appeals recorded." renderRecord={record => formatRecord(record, [['id', 'Appeal ID'], ['status', 'Clinic workflow state'], ['submission_id', 'Related submission'], ['decision_response_id', 'Related denial observation'], ['appeal_reason', 'Appeal reason'], ['created_at', 'Created']])} /></div>
                    <div><h5 className="mb-2 text-sm font-bold">Claim lifecycle events</h5><InsuranceTimeline records={events} empty="No lifecycle events recorded." renderRecord={record => formatRecord(record, [['event_type', 'Event'], ['status', 'Clinic workflow state'], ['reason', 'Reason'], ['actor_id', 'Staff actor']])} /></div>
                </div>
            </div>}
        </InsuranceCard>
    )
}

function PriorAuthorizationWorkflow({
    patientId, associationId, options, access, onChanged,
}: {
    patientId: number; associationId: number; options: InsuranceOptions
    access: ReturnType<typeof getInsurancePermissions>; onChanged: () => Promise<void>
}) {
    const [rows, setRows] = useState<InsuranceRecord[]>([])
    const [selected, setSelected] = useState<InsuranceRecord | null>(null)
    const [history, setHistory] = useState<InsuranceRecord[]>([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const reload = useCallback(async () => {
        setLoading(true); setError('')
        try { const page = await insuranceApi.authorizations.list(options, patientId); setRows(page.records.filter(row => Number(row.association_id) === associationId)) }
        catch (failure) { setError(errorText(failure)) } finally { setLoading(false) }
    }, [associationId, options, patientId])
    useEffect(() => { void reload() }, [reload])
    const action = async (run: () => Promise<unknown>) => { setError(''); try { await run(); await reload(); await onChanged() } catch (failure) { setError(errorText(failure)) } }
    const selectedId = selected ? num(selected, 'id') : null
    const currentVersion = selected ? version(selected) : 1
    const creationFields: InsuranceField[] = [
        { name: 'association_id', label: 'Insurance association ID', kind: 'number', required: true, min: 1 },
        { name: 'request_date', label: 'Request date', kind: 'date', required: true },
        { name: 'treatment_description', label: 'Treatment description', required: true, maxLength: 4000 },
        { name: 'requested_amount', label: 'Requested amount', required: true, pattern: '^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,2})?$' },
        { name: 'currency', label: 'Currency', required: true, maxLength: 3, pattern: '[A-Z]{3}' },
        { name: 'policy_revision_id', label: 'Policy revision ID (optional)', kind: 'number', min: 1 },
        { name: 'claim_id', label: 'Claim ID (optional)', kind: 'number', min: 1 },
        { name: 'treatment_plan_item_id', label: 'Treatment plan item ID (optional)', kind: 'number', min: 1 },
        { name: 'estimate_id', label: 'Estimate ID (optional)', kind: 'number', min: 1 },
    ]
    return (
        <InsuranceCard title="Prior authorizations" description="Staff records request and reported decisions manually. A recorded request does not prove insurer receipt; an approval observation is not a payment.">
            {error && <p role="alert" className="rounded border border-rose-200 bg-clinic-rose p-3 text-sm text-rose-800">{error}</p>}
            {loading ? <p role="status" className="text-sm text-clinic-muted">Loading prior authorizations…</p> : <InsuranceTimeline records={rows} empty="No prior authorization records." renderRecord={row => <div className="flex flex-wrap items-center justify-between gap-3">{formatRecord(row, [['id', 'Request ID'], ['request_identifier', 'Clinic request identifier'], ['status', 'Local workflow status'], ['request_date', 'Request date'], ['requested_amount', 'Requested amount'], ['currency', 'Currency']])}<InsuranceButton onClick={() => { setSelected(row as InsuranceRecord); const id = num(row, 'id'); if (id) void insuranceApi.authorizations.history(options, patientId, id).then(page => setHistory(page.records)).catch(failure => setError(errorText(failure))) }}>Open history</InsuranceButton></div>} />}
            {access.priorAuthorizationsManage && <InsuranceForm fields={creationFields} submitLabel="Create prior authorization draft" onSubmit={input => action(() => insuranceApi.authorizations.create(options, patientId, { ...input, association_id: associationId }, randomCommandKey()))} note="This creates a local draft. The API stores no insurer reference until staff later records one, and does not send a request." />}
            {selected && selectedId && <div className="space-y-4 rounded-md border border-clinic-line bg-clinic-canvas p-4">
                <h4 className="text-sm font-bold">Authorization #{selectedId} · {text(selected, 'status')}</h4>
                {access.priorAuthorizationsManage && ['draft', 'requested', 'pending'].includes(text(selected, 'status')) && <InsuranceForm fields={[
                    { name: 'communication_channel', label: 'Manual request channel', kind: 'select', required: true, options: ['phone', 'portal', 'email', 'fax', 'paper', 'other'].map(value => ({ value, label: value })) },
                    { name: 'source_provenance', label: 'How staff sent the request', kind: 'textarea', required: true, maxLength: 2000 },
                ]} submitLabel="Record staff sent request" onSubmit={input => action(() => insuranceApi.authorizations.recordRequest(options, patientId, selectedId, { expected_version: currentVersion, ...input }))} note="This records a staff action; it is not proof the insurer received the request." />}
                {access.priorAuthorizationsDecide && <InsuranceForm fields={[
                    { name: 'decision_type', label: 'Reported decision', kind: 'select', required: true, options: ['acknowledged', 'approved', 'partially_approved', 'denied', 'additional_information_requested'].map(value => ({ value, label: value })) },
                    { name: 'decision_at', label: 'Reported decision time', kind: 'datetime-local', required: true },
                    { name: 'communication_channel', label: 'Manual channel', kind: 'select', required: true, options: ['phone', 'portal', 'email', 'fax', 'paper', 'other'].map(value => ({ value, label: value })) },
                    { name: 'authorized_amount', label: 'Reported authorized amount (optional)' },
                    { name: 'currency', label: 'Currency when amount is supplied', maxLength: 3, pattern: '[A-Z]{3}' },
                    { name: 'authorized_scope', label: 'Reported authorized scope', maxLength: 4000 },
                    { name: 'valid_from', label: 'Reported validity from', kind: 'date' },
                    { name: 'valid_through', label: 'Reported validity through', kind: 'date' },
                    { name: 'insurer_reference', label: 'Reported insurer reference (sensitive)', maxLength: 200 },
                    { name: 'corrects_decision_id', label: 'Prior decision ID to correct (optional)', kind: 'number', min: 1 },
                    { name: 'correction_reason', label: 'Correction reason (when correcting)', maxLength: 2000 },
                    { name: 'source_provenance', label: 'Source and what staff observed', kind: 'textarea', required: true, maxLength: 2000 },
                ]} submitLabel="Record manual decision" onSubmit={input => action(() => insuranceApi.authorizations.decision(options, patientId, selectedId, { expected_version: currentVersion, ...input }))} note="Even an approved decision is a staff-recorded observation and does not establish insurer verification, cash or a posted balance." />}
                {access.priorAuthorizationsManage && <InsuranceForm fields={[{ name: 'claim_id', label: 'Same-patient claim ID', kind: 'number', min: 1, required: true }]} submitLabel="Link claim" onSubmit={input => action(() => insuranceApi.authorizations.linkClaim(options, patientId, selectedId, Number(input.claim_id)))} />}
                {access.priorAuthorizationsManage && <InsuranceForm fields={[{ name: 'reason', label: 'Cancellation reason', required: true, maxLength: 2000 }]} submitLabel="Cancel authorization" onSubmit={input => action(() => insuranceApi.authorizations.cancel(options, patientId, selectedId, currentVersion, String(input.reason)))} />}
                <InsuranceTimeline records={history} empty="No prior authorization history loaded." renderRecord={record => formatRecord(record, [['event_type', 'Event'], ['status', 'Local status'], ['decision_type', 'Reported decision'], ['source_provenance', 'Provenance'], ['actor_id', 'Staff actor'], ['created_at', 'Recorded at']])} />
                <p className="text-xs text-clinic-muted">Evidence linking is disabled by the backend insurance-evidence activation gate. No protected URLs are shown here.</p>
            </div>}
        </InsuranceCard>
    )
}

export default function PatientInsuranceWorkspace({ patient }: { patient: Patient }) {
    const { currentTenant, user } = useAuthSession()
    const access = useMemo(() => getInsurancePermissions(user), [user])
    const [associations, setAssociations] = useState<InsuranceRecord[]>([])
    const [insurers, setInsurers] = useState<InsuranceRecord[]>([])
    const [estimates, setEstimates] = useState<InsuranceRecord[]>([])
    const [documents, setDocuments] = useState<InsuranceRecord[]>([])
    const [activeAssociation, setActiveAssociation] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const patientId = patient.id
    const options = useMemo<InsuranceOptions | null>(() => currentTenant?.id ? { tenantId: currentTenant.id } : null, [currentTenant?.id])

    const load = useCallback(async () => {
        if (!options || !access.patientView) { setAssociations([]); setLoading(false); return }
        setLoading(true); setError('')
        const tasks: Array<Promise<unknown>> = [
            insuranceApi.patient.associations(options, patientId, { per_page: 100 }).then(page => {
                setAssociations(page.records)
                setActiveAssociation(previous => page.records.some(row => row.id === previous) ? previous : page.records[0]?.id ?? null)
            }),
        ]
        if (access.catalogView) tasks.push(insuranceApi.catalog.insurers(options, { active: true, per_page: 100 }).then(page => setInsurers(page.records)))
        if (access.estimateView) tasks.push(insuranceApi.patient.estimates(options, patientId).then(page => setEstimates(page.records)))
        if (access.patientDocumentsView) tasks.push(insuranceApi.patient.documents(options, patientId).then(page => setDocuments(page.records)))
        const results = await Promise.allSettled(tasks)
        const failed = results.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') setError(errorText(failed.reason))
        setLoading(false)
    }, [access, options, patientId])
    useEffect(() => { void load() }, [load])

    if (!options) return <p role="status" className="rounded-md border border-dashed border-clinic-line p-5 text-sm text-clinic-muted">Insurance records require an active clinic session.</p>
    if (!access.patientView) return <p role="alert" className="rounded-md border border-rose-200 bg-clinic-rose p-5 text-sm text-rose-800">You do not have permission to view this patient&apos;s insurance records.</p>

    const createAssociation = async (input: Record<string, string | number | boolean | null>) => {
        const insurerId = input.insurer_id
        const unverifiedName = input.unverified_insurer_name
        if (Boolean(insurerId) === Boolean(unverifiedName)) throw new Error('Select a clinic insurer or enter an unverified insurer name, not both.')
        const payload = { ...input }
        if (insurerId) delete payload.unverified_insurer_name
        else delete payload.insurer_id
        await insuranceApi.patient.createAssociation(options, patientId, payload)
        await load()
    }

    return (
        <div className="space-y-5" aria-label={`Insurance for patient ${patientId}`}>
            <div className="rounded-md border border-clinic-line bg-clinic-sky p-4 text-sm text-clinic-ink">
                <strong>Insurance observations are not guarantees.</strong> Eligibility, benefit sources, estimate amounts, insurer decisions, remittances and receipt verifications are staff-entered records. They do not create cash, payments, patient credits or financial postings.
            </div>
            {error && <p role="alert" className="rounded border border-rose-200 bg-clinic-rose p-3 text-sm text-rose-800">{error}</p>}
            {access.patientManage && <InsuranceCard title="Add patient-insurer association" description="Insurance is optional. A provider-only association does not require a policy. Free-text insurer names remain unverified.">
                <InsuranceForm fields={[
                    ...(access.catalogView ? [{ name: 'insurer_id', label: 'Clinic insurer', kind: 'select' as const, options: insurers.map(row => ({ value: String(row.id), label: `${text(row, 'name')} (${text(row, 'code')})` })) }] : []),
                    { name: 'unverified_insurer_name', label: 'Unverified insurer name (if not selecting a clinic insurer)', maxLength: 255 },
                    { name: 'coverage_priority', label: 'Explicit coverage priority (optional)', kind: 'number', min: 1 },
                ]} submitLabel="Add association" onSubmit={createAssociation} note="The association is scoped to this patient and current clinic. List order does not imply primary or secondary coverage." />
            </InsuranceCard>}
            {loading ? <p role="status" className="rounded-md border border-clinic-line bg-white p-5 text-sm text-clinic-muted">Loading patient insurance…</p> : associations.length ? (
                <>
                    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Patient insurance associations">
                        {associations.map(row => <button key={row.id} role="tab" aria-selected={activeAssociation === row.id} className={`rounded-md border px-3 py-2 text-sm font-semibold ${activeAssociation === row.id ? 'border-clinic-blue bg-clinic-sky text-clinic-blue' : 'border-clinic-line bg-white text-clinic-ink'}`} onClick={() => setActiveAssociation(row.id)}>{text(row, 'insurer_name') || text(row, 'unverified_insurer_name') || `Association #${row.id}`}</button>)}
                    </div>
                    {associations.filter(row => row.id === activeAssociation).map(row => <PatientAssociationPanel key={`${currentTenant?.id}-${patientId}-${row.id}`} patientId={patientId} association={row} options={options} access={access} onChanged={load} />)}
                </>
            ) : <p role="status" className="rounded-md border border-dashed border-clinic-line bg-white p-8 text-center text-sm text-clinic-muted">No insurance associations have been recorded for this patient.</p>}
            {access.estimateView && <InsuranceCard title="Provisional estimate history" description="These immutable projections are informational and never confirm payer liability or change an invoice.">
                <InsuranceTimeline records={chronological(estimates)} empty="No estimate snapshots recorded." renderRecord={record => formatRecord(record, [['id', 'Estimate ID'], ['service_date', 'Service date'], ['treatment_description', 'Treatment'], ['gross_amount', 'Gross amount'], ['insurer_amount', 'Provisional insurer amount'], ['patient_amount', 'Provisional patient amount'], ['currency', 'Currency'], ['status', 'Estimate state'], ['stale', 'Stale snapshot'], ['superseded', 'Superseded snapshot'], ['recorded_at', 'Recorded at']])} />
                <p className="text-xs font-semibold text-amber-800">Provisional only · not a confirmed benefit, insurer liability, payment or receivable.</p>
            </InsuranceCard>}
            {access.patientDocumentsView && <InsuranceCard title="Protected insurance evidence" description="Only authorized clean metadata is shown. Document bytes are accessed through the authenticated private stream; no public or signed URLs are exposed.">
                <InsuranceTimeline records={documents} empty="No clean authorized insurance evidence is available." renderRecord={record => formatRecord(record, [['id', 'Document ID'], ['file_name', 'File name'], ['purpose', 'Purpose'], ['classification', 'Classification'], ['version', 'Version'], ['scan_status', 'Scanner status'], ['created_at', 'Recorded at']])} />
                <p className="text-xs text-clinic-muted">Insurance uploads and evidence linking remain disabled by the backend activation settings pending approved scanner and retention controls. This screen does not expose upload or link actions.</p>
            </InsuranceCard>}
        </div>
    )
}
