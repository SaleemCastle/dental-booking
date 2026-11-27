import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { getInsurancePermissions } from '../lib/permissions'
import { insuranceApi, InsuranceRecord } from '../services/insurance'
import { formatRecord, InsuranceCard, InsuranceField, InsuranceForm, InsuranceTimeline, randomCommandKey } from './insurance/InsurancePrimitives'

const fields = (entries: Array<[string, string, InsuranceField['kind']?, boolean?]>): InsuranceField[] => entries.map(([name, label, kind, required]) => ({ name, label, kind, required }))
const message = (error: unknown) => error instanceof Error ? error.message : 'Insurance records are unavailable.'

export default function InsuranceWorkspace() {
    const { user, currentTenant } = useAuthSession()
    const access = getInsurancePermissions(user)
    const tenantId = currentTenant?.id ?? 0
    const options = useMemo(() => ({ tenantId }), [tenantId])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [insurers, setInsurers] = useState<InsuranceRecord[]>([])
    const [remittances, setRemittances] = useState<InsuranceRecord[]>([])
    const [receipts, setReceipts] = useState<InsuranceRecord[]>([])
    const [obligations, setObligations] = useState<InsuranceRecord[]>([])
    const [report, setReport] = useState<InsuranceRecord | null>(null)
    const [from, setFrom] = useState('')
    const [through, setThrough] = useState('')
    const reload = useCallback(async () => {
        setLoading(true); setError('')
        const work: Array<Promise<unknown>> = []
        if (access.catalogView) work.push(insuranceApi.catalog.insurers(options).then(page => setInsurers(page.records)))
        if (access.remittancesView) work.push(insuranceApi.remittances.list(options).then(page => setRemittances(page.records)))
        if (access.receiptsView) work.push(insuranceApi.receipts.list(options).then(page => setReceipts(page.records)))
        if (access.obligationsView) work.push(insuranceApi.obligations.list(options).then(page => setObligations(page.records)))
        const results = await Promise.allSettled(work)
        const failed = results.find(item => item.status === 'rejected')
        if (failed?.status === 'rejected') setError(message(failed.reason))
        setLoading(false)
    }, [access.catalogView, access.obligationsView, access.receiptsView, access.remittancesView, options])
    useEffect(() => { if (tenantId) void reload(); else setLoading(false) }, [reload, tenantId])
    const section = (title: string, description: string, content: React.ReactNode) => <InsuranceCard title={title} description={description}>{content}</InsuranceCard>
    const refreshAfter = async (run: () => Promise<unknown>) => { setError(''); await run(); await reload() }
    const reportRun = async () => {
        if (!from || !through || from > through) { setError('Choose a valid inclusive date range.'); return }
        try { setError(''); const response = await insuranceApi.report(options, from, through); setReport(response.data) } catch (failure) { setError(message(failure)) }
    }
    if (!tenantId) return <div className="p-6"><p role="status">Select a clinic to view insurance records.</p></div>
    return <div className="space-y-5 p-4 sm:p-6">
        <header><h1 className="text-2xl font-extrabold text-clinic-ink">Insurance</h1><p className="mt-1 text-sm text-clinic-muted">Clinic {currentTenant?.name ?? `#${tenantId}`} · manual staff records only</p></header>
        {error && <p role="alert" className="rounded border border-rose-200 bg-clinic-rose p-3 text-sm text-rose-800">{error}</p>}
        {loading && <p role="status" className="rounded border border-clinic-line bg-white p-4 text-sm">Loading clinic insurance records…</p>}
        {access.catalogView && section('Insurance catalog', 'Tenant insurer catalog entries visible to this clinic.', <InsuranceTimeline records={insurers} empty="No insurer catalog entries." renderRecord={row => formatRecord(row, [['id','Insurer ID'], ['name','Insurer'], ['code','Code'], ['active','Active'], ['created_at','Created']])} />)}
        {access.remittancesView && section('Remittance advice', 'Manually recorded insurer advice. Advice is not cash received and does not post financial activity.', <>
            <InsuranceTimeline records={remittances} empty="No remittance advice recorded." renderRecord={row => formatRecord(row, [['id','Advice ID'], ['external_reference','Reference'], ['advice_date','Advice date'], ['communication_channel','Channel'], ['source_provenance','Staff provenance'], ['currency','Currency'], ['created_at','Recorded at'], ['corrects_remittance_id','Corrects advice']])} />
            {access.remittancesRecord && <p className="text-xs text-clinic-muted">Recording requires at least one patient and association scoped advice line. This clinic-wide list does not offer free-form IDs; use the patient-scoped workflow when it is available.</p>}
        </>)}
        {access.receiptsView && section('Insurer receipt records', 'Nonposting receipt records and staff verification history. Verification does not confirm a bank deposit or create a payment.', <>
            <InsuranceTimeline records={receipts} empty="No insurer receipt records." renderRecord={row => formatRecord(row, [['id','Receipt ID'], ['received_on','Reported received date'], ['amount','Reported amount'], ['currency','Currency'], ['status','Receipt status'], ['financial_posted','Financial posting'], ['created_at','Recorded at']])} />
            {access.receiptsRecord && <InsuranceForm fields={fields([['insurer_id','Insurer ID','number',true],['received_on','Reported receipt date','date',true],['channel','Manual channel','select',true],['source_provenance','Evidence and provenance','textarea',true],['amount','Reported amount (minor units)','number',true],['currency','Currency','text',true]]).map(field => field.name === 'channel' ? {...field, options:['bank_statement','remittance_advice','insurer_portal','email','paper','other'].map(value=>({value,label:value}))} : field)} submitLabel="Record nonposting receipt" onSubmit={input => refreshAfter(() => insuranceApi.receipts.create(options, input, randomCommandKey()))} note="Recording is not verification, payment, allocation, or posting." />}
            {access.receiptsVerify && <p className="text-xs text-clinic-muted">Open a receipt record from its patient context to verify the exact reported amount and currency; no verification action is offered here without a selected record.</p>}
        </>)}
        {access.obligationsView && section('Insurer obligation proposals', 'Explicit clinic proposals and approvals. Approval does not mutate invoices, receivables, balances, or payments.', <InsuranceTimeline records={obligations} empty="No insurer obligation proposals." renderRecord={row => <div className="space-y-2">{formatRecord(row, [['id','Proposal ID'], ['proposed_amount','Proposed amount'], ['currency','Currency'], ['status','Proposal status'], ['approval_reason','Approval record'], ['created_at','Proposed at']])}{access.obligationsApprove && row.status === 'proposed' && <InsuranceForm fields={[{name:'approval_reason',label:'Reason for approving exact proposed amount',required:true,maxLength:2000}]} submitLabel="Approve proposal" onSubmit={input => refreshAfter(() => insuranceApi.obligations.approve(options, Number(row.id), String(input.approval_reason), randomCommandKey()))} />}</div>} />)}
        {access.reportsView && section('Aggregate insurance activity', 'Counts only for the selected inclusive date range; no patient identifiers or financial totals are returned.', <div className="space-y-3"><div className="flex flex-wrap items-end gap-3"><label className="text-sm">From <input type="date" value={from} onChange={event=>setFrom(event.target.value)} className="ml-2 rounded border p-2" /></label><label className="text-sm">Through <input type="date" value={through} onChange={event=>setThrough(event.target.value)} className="ml-2 rounded border p-2" /></label><button type="button" onClick={()=>void reportRun()} className="rounded bg-clinic-blue px-4 py-2 text-sm font-bold text-white">Load report</button></div>{report && formatRecord(report, Object.keys(report).filter(key=>typeof report[key]==='number' || typeof report[key]==='string').map(key=>[key,key.replaceAll('_',' ')]))}</div>)}
        {(access.catalogManage || access.catalogReview || access.catalogPublish) && <p className="rounded border border-clinic-line bg-white p-4 text-sm text-clinic-muted">Catalog editing, review, and publication controls remain hidden until their versioned workflow forms are available from the exact contract screens.</p>}
        {!Object.entries(access).some(([key,value])=>key!=='has' && value===true) && <p role="status" className="rounded border border-clinic-line bg-white p-5">Your clinic role has no insurance workflow permissions.</p>}
    </div>
}
