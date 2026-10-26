import React, { useRef, useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, normalizeAxiosError } from '../lib/api'
import {
    getDentalChartPermissions,
    getTreatmentPlanPermissions,
} from '../lib/permissions'
import {
    availableItemTransitions,
    availablePlanTransitions,
    formatPlanAmount,
    isOpenPlan,
    isOpenPlanItem,
    planItemStatusLabels,
    planningContextLabel,
    planStatusLabels,
    planTotalCents,
    priceInCents,
    sortPlanItems,
    treatmentPlanFailureMessage,
} from '../lib/treatment-plans'
import {
    DentalChartMetadata,
    getDentalChartMetadata,
} from '../services/dental-charts'
import {
    addTreatmentPlanItem,
    createTreatmentPlan,
    getTreatmentPlan,
    getTreatmentPlans,
    NewTreatmentPlanItem,
    TreatmentPlan,
    TreatmentPlanItem,
    TreatmentPlanItemStatus,
    TreatmentPlanItemUpdate,
    TreatmentPlanStatus,
    TreatmentPlanUpdate,
    TreatmentToothContext,
    updateTreatmentPlan,
    updateTreatmentPlanItem,
} from '../services/treatment-plans'
import { isArchivedPatient } from './PatientRowDetails'
import TreatmentPlanForm from './TreatmentPlanForm'
import TreatmentPlanItemForm from './TreatmentPlanItemForm'
import TreatmentPlanOrderForm from './TreatmentPlanOrderForm'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const StatusBadge = ({ status }: { status: string }) => (
    <span
        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            status === 'completed'
                ? 'bg-clinic-mint text-emerald-800'
                : status === 'cancelled'
                ? 'bg-slate-100 text-slate-600'
                : ['active', 'in_progress'].includes(status)
                ? 'bg-clinic-sky text-clinic-blue'
                : 'bg-clinic-amber text-amber-800'
        }`}>
        {planStatusLabels[status] ?? planItemStatusLabels[status]}
    </span>
)
type PlanAction = {
    item?: TreatmentPlanItem
    status: TreatmentPlanStatus | TreatmentPlanItemStatus
}

const PatientTreatmentPlans = ({
    patient,
    context,
    onViewTooth,
}: {
    patient: Patient
    context?: TreatmentToothContext | null
    onViewTooth: (context: TreatmentToothContext) => void
}) => {
    const { user, status } = useAuthSession()
    const access = getTreatmentPlanPermissions(
        status === 'authenticated' ? user : null,
    )
    const chartAccess = getDentalChartPermissions(
        status === 'authenticated' ? user : null,
    )
    const [page, setPage] = useState(1)
    const [filter, setFilter] = useState<TreatmentPlanStatus | ''>('')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [planEditor, setPlanEditor] = useState<'new' | 'edit' | null>(null)
    const [itemEditor, setItemEditor] = useState<
        TreatmentPlanItem | 'new' | null
    >(null)
    const [ordering, setOrdering] = useState(false)
    const [action, setAction] = useState<PlanAction | null>(null)
    const [busy, setBusy] = useState(false)
    const [actionError, setActionError] = useState('')
    const [notice, setNotice] = useState('')
    const [denied, setDenied] = useState(false)
    const mutationLocked = useRef(false)
    const feed = useSWR<
        Awaited<ReturnType<typeof getTreatmentPlans>>,
        ApiError
    >(
        access.canView
            ? ['treatment-plans', user, patient.id, page, filter]
            : null,
        () =>
            getTreatmentPlans(patient.id, {
                page,
                ...(filter ? { status: filter } : {}),
            }),
        { shouldRetryOnError: false },
    )
    const detail = useSWR<TreatmentPlan, ApiError>(
        access.canView && selectedId
            ? ['treatment-plan', user, patient.id, selectedId]
            : null,
        async () => {
            const plan = await getTreatmentPlan(selectedId)
            if (plan.patient_id !== patient.id)
                throw new ApiError({
                    statusCode: 404,
                    code: 'NOT_FOUND',
                    message:
                        'This plan is unavailable for the selected patient.',
                    errors: {},
                })
            return plan
        },
        { shouldRetryOnError: false, revalidateOnFocus: false },
    )
    const metadata = useSWR<DentalChartMetadata>(
        access.canView && chartAccess.canView
            ? ['dental-chart-metadata', user]
            : null,
        () => getDentalChartMetadata(),
        { shouldRetryOnError: false },
    )
    const noReadAccess =
        [403, 404].includes(feed.error?.statusCode) || !access.canView
    const canWrite =
        access.canWrite &&
        !denied &&
        !isArchivedPatient(patient) &&
        !noReadAccess &&
        !feed.error
    const plan =
        !noReadAccess && ![403, 404].includes(detail.error?.statusCode)
            ? detail.data
            : undefined
    const writablePlan = Boolean(
        canWrite && plan && isOpenPlan(plan) && !detail.error,
    )
    const acceptPlan = (saved: TreatmentPlan, created = false) => {
        if (saved.patient_id !== patient.id) return
        if (!created) void detail.mutate(saved, false)
        void feed.mutate(
            current =>
                current
                    ? {
                          ...current,
                          plans: [
                              ...(created &&
                              page === 1 &&
                              (!filter || saved.status === filter)
                                  ? [saved]
                                  : []),
                              ...current.plans
                                  .filter(
                                      item => item.id !== saved.id || !created,
                                  )
                                  .map(item =>
                                      item.id === saved.id ? saved : item,
                                  ),
                          ].filter(item => !filter || item.status === filter),
                      }
                    : current,
            false,
        )
        if (created) {
            setPage(1)
            setFilter('')
            setSelectedId(saved.id)
        }
    }
    const acceptItem = (saved: TreatmentPlanItem) => {
        if (!plan || saved.treatment_plan_id !== plan.id) return
        acceptPlan({
            ...plan,
            items: sortPlanItems([
                ...plan.items.filter(item => item.id !== saved.id),
                saved,
            ]),
        })
    }
    const refresh = () => {
        void feed.mutate()
        if (selectedId) void detail.mutate()
    }
    const failWrite = (error: unknown) => {
        const failure = normalizeAxiosError(error)
        if ([403, 404].includes(failure.statusCode)) setDenied(true)
        return failure
    }
    const saveHeader = async (payload: TreatmentPlanUpdate) => {
        if (!canWrite || (planEditor === 'edit' && !writablePlan))
            throw new Error('Treatment plan editing is unavailable.')
        try {
            const saved =
                planEditor === 'new'
                    ? await createTreatmentPlan(
                          patient.id,
                          payload as { title: string; notes?: string | null },
                      )
                    : await updateTreatmentPlan(plan.id, payload)
            acceptPlan(saved, planEditor === 'new')
            setPlanEditor(null)
            setNotice(
                planEditor === 'new'
                    ? 'Draft treatment plan created.'
                    : 'Treatment plan details saved.',
            )
        } catch (error) {
            failWrite(error)
            throw error
        }
    }
    const saveItem = async (
        payload: NewTreatmentPlanItem | TreatmentPlanItemUpdate,
    ) => {
        if (!writablePlan)
            throw new Error('This treatment plan cannot be changed.')
        try {
            const saved =
                itemEditor === 'new'
                    ? await addTreatmentPlanItem(
                          plan.id,
                          payload as NewTreatmentPlanItem,
                      )
                    : await updateTreatmentPlanItem(
                          plan.id,
                          (itemEditor as TreatmentPlanItem).id,
                          payload,
                      )
            acceptItem(saved)
            setItemEditor(null)
            setNotice(
                itemEditor === 'new'
                    ? 'Treatment added to the plan.'
                    : 'Planned treatment saved.',
            )
            refresh()
        } catch (error) {
            failWrite(error)
            throw error
        }
    }
    const performAction = async () => {
        if (!action || !writablePlan || mutationLocked.current) return
        mutationLocked.current = true
        setBusy(true)
        setActionError('')
        try {
            if (action.item)
                acceptItem(
                    await updateTreatmentPlanItem(plan.id, action.item.id, {
                        status: action.status as TreatmentPlanItemStatus,
                    }),
                )
            else
                acceptPlan(
                    await updateTreatmentPlan(plan.id, {
                        status: action.status as TreatmentPlanStatus,
                    }),
                )
            setAction(null)
            setNotice('Treatment plan status updated.')
            refresh()
        } catch (error) {
            setActionError(treatmentPlanFailureMessage(failWrite(error)))
            refresh()
        } finally {
            mutationLocked.current = false
            setBusy(false)
        }
    }
    const startAction = (next: PlanAction) => {
        setActionError('')
        setAction(next)
    }
    const items = plan ? sortPlanItems(plan.items) : []
    return (
        <section
            aria-label="Patient treatment plans"
            className="space-y-5 rounded-xl border border-clinic-line bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-extrabold text-clinic-ink">
                        Treatment planning
                    </h2>
                    <p className="mt-1 text-sm text-clinic-muted">
                        Propose care, review estimates, and track treatment
                        progress.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {access.canView && (
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={feed.isValidating || detail.isValidating}
                            onClick={refresh}>
                            Refresh treatment plans
                        </button>
                    )}
                    {canWrite && (
                        <button
                            type="button"
                            className={primaryClass}
                            onClick={() => {
                                setNotice('')
                                setPlanEditor('new')
                            }}>
                            Create treatment plan
                        </button>
                    )}
                </div>
            </div>
            {!access.canView ? (
                <p role="status" className="text-sm text-clinic-muted">
                    You do not have permission to view treatment plans.
                </p>
            ) : (
                <>
                    {!canWrite && (
                        <p className="text-sm text-clinic-muted">
                            Read-only.{' '}
                            {isArchivedPatient(patient)
                                ? 'Archived patients cannot receive treatment plan changes.'
                                : 'Treatment planning changes require authorized clinical access.'}
                        </p>
                    )}
                    {notice && (
                        <p
                            role="status"
                            className="rounded bg-clinic-mint p-3 text-sm text-emerald-800">
                            {notice}
                        </p>
                    )}
                    {context && !noReadAccess && (
                        <p className="rounded border border-clinic-line bg-clinic-sky p-3 text-sm">
                            Selected from odontogram:{' '}
                            {planningContextLabel(context, metadata.data)}.
                            Choose an open plan and add a treatment to use this
                            location.
                        </p>
                    )}
                    <label className="block max-w-xs text-sm font-bold">
                        Plan status filter
                        <select
                            aria-label="Treatment plan status filter"
                            className={inputClass}
                            value={filter}
                            onChange={event => {
                                setFilter(event.target.value as typeof filter)
                                setPage(1)
                                setSelectedId(null)
                                setNotice('')
                            }}>
                            <option value="">All statuses</option>
                            {Object.entries(planStatusLabels).map(
                                ([status, label]) => (
                                    <option key={status} value={status}>
                                        {label}
                                    </option>
                                ),
                            )}
                        </select>
                    </label>
                    {!feed.data && !feed.error && (
                        <p role="status" className="text-sm">
                            Loading treatment plans...
                        </p>
                    )}
                    {feed.error && (
                        <p role="alert" className="text-sm text-red-700">
                            {noReadAccess
                                ? 'Treatment plans are unavailable for this patient or clinic access.'
                                : 'Treatment plans could not be refreshed.'}{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => void feed.mutate()}>
                                Retry treatment plans
                            </button>
                        </p>
                    )}
                    {!noReadAccess && feed.data && (
                        <>
                            {!feed.data.plans.length && (
                                <p className="rounded border border-dashed border-clinic-line p-5 text-sm text-clinic-muted">
                                    {filter
                                        ? 'No treatment plans match this status.'
                                        : 'No treatment plans yet. Create a draft to begin planning care.'}
                                </p>
                            )}
                            <ul
                                aria-label="Treatment plan list"
                                className="grid gap-3 sm:grid-cols-2">
                                {feed.data.plans.map(item => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            aria-label={`Open treatment plan ${item.title}`}
                                            aria-pressed={
                                                selectedId === item.id
                                            }
                                            className={`h-full w-full space-y-2 rounded-lg border p-4 text-left ${
                                                selectedId === item.id
                                                    ? 'border-clinic-blue bg-clinic-sky'
                                                    : 'border-clinic-line hover:border-clinic-blue'
                                            }`}
                                            onClick={() => {
                                                setSelectedId(item.id)
                                                setNotice('')
                                            }}>
                                            <span className="block text-sm font-extrabold">
                                                {item.title}
                                            </span>
                                            <span className="flex flex-wrap items-center gap-2">
                                                <StatusBadge
                                                    status={item.status}
                                                />
                                                <span className="text-xs text-clinic-muted">
                                                    {item.items.length} items
                                                </span>
                                            </span>
                                            <span className="block text-sm">
                                                Estimate:{' '}
                                                {formatPlanAmount(
                                                    planTotalCents(item.items),
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <nav
                                aria-label="Treatment plan pages"
                                className="flex items-center gap-3">
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={page <= 1 || feed.isValidating}
                                    onClick={() =>
                                        setPage(current => current - 1)
                                    }>
                                    Previous plans
                                </button>
                                <span className="text-sm">Page {page}</span>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={
                                        page >=
                                            Number(
                                                feed.data.meta.lastPage ?? 1,
                                            ) || feed.isValidating
                                    }
                                    onClick={() =>
                                        setPage(current => current + 1)
                                    }>
                                    Next plans
                                </button>
                            </nav>
                        </>
                    )}
                    {selectedId && !noReadAccess && (
                        <section
                            aria-label="Selected treatment plan"
                            className="space-y-4 border-t border-clinic-line pt-5">
                            {!detail.data && !detail.error && (
                                <p role="status" className="text-sm">
                                    Loading selected treatment plan...
                                </p>
                            )}
                            {detail.error && (
                                <p
                                    role="alert"
                                    className="text-sm text-red-700">
                                    The selected plan could not be refreshed.{' '}
                                    {detail.error.message}{' '}
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        onClick={() => void detail.mutate()}>
                                        Retry selected treatment plan
                                    </button>
                                </p>
                            )}
                            {plan && (
                                <>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-lg font-extrabold">
                                                {plan.title}
                                            </h3>
                                            <div className="mt-2 flex gap-2">
                                                <StatusBadge
                                                    status={plan.status}
                                                />
                                                <span className="text-xs text-clinic-muted">
                                                    Plan #{plan.id}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-lg font-extrabold">
                                            Estimated total:{' '}
                                            {formatPlanAmount(
                                                planTotalCents(items),
                                            )}
                                        </p>
                                    </div>
                                    <p className="text-xs text-clinic-muted">
                                        Cancelled items are excluded from the
                                        estimated total. Estimates use each
                                        item’s saved price.
                                    </p>
                                    {plan.notes && (
                                        <p className="whitespace-pre-wrap break-words text-sm">
                                            {plan.notes}
                                        </p>
                                    )}
                                    {!isOpenPlan(plan) && (
                                        <p className="text-sm text-clinic-muted">
                                            This{' '}
                                            {planStatusLabels[
                                                plan.status
                                            ].toLowerCase()}{' '}
                                            plan is read-only.
                                        </p>
                                    )}
                                    {writablePlan && (
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                onClick={() =>
                                                    setPlanEditor('edit')
                                                }>
                                                Edit plan details
                                            </button>
                                            <button
                                                type="button"
                                                className={primaryClass}
                                                onClick={() =>
                                                    setItemEditor('new')
                                                }>
                                                Add treatment
                                            </button>
                                            {items.filter(isOpenPlanItem)
                                                .length > 1 && (
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    onClick={() =>
                                                        setOrdering(true)
                                                    }>
                                                    Reorder items
                                                </button>
                                            )}
                                            {availablePlanTransitions(plan).map(
                                                status => (
                                                    <button
                                                        type="button"
                                                        key={status}
                                                        className={buttonClass}
                                                        onClick={() =>
                                                            startAction({
                                                                status,
                                                            })
                                                        }>
                                                        {status === 'active'
                                                            ? 'Activate plan'
                                                            : status ===
                                                              'completed'
                                                            ? 'Complete plan'
                                                            : 'Cancel plan'}
                                                    </button>
                                                ),
                                            )}
                                        </div>
                                    )}
                                    {plan.status === 'draft' &&
                                        !items.some(
                                            item => item.status === 'proposed',
                                        ) && (
                                            <p className="text-sm text-clinic-muted">
                                                Add a proposed treatment before
                                                activating this draft.
                                            </p>
                                        )}
                                    {!items.length && (
                                        <p className="rounded bg-clinic-canvas p-4 text-sm">
                                            This draft has no treatment items.
                                        </p>
                                    )}
                                    <ol
                                        aria-label="Planned treatment items"
                                        className="space-y-4">
                                        {items.map((item, index) => (
                                            <li key={item.id}>
                                                <article
                                                    aria-label={`Planned treatment ${item.id}`}
                                                    className="space-y-3 rounded-lg border border-clinic-line p-4">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <h4 className="text-sm font-extrabold">
                                                            {index + 1}.{' '}
                                                            {
                                                                item.treatment_name
                                                            }
                                                        </h4>
                                                        <StatusBadge
                                                            status={item.status}
                                                        />
                                                    </div>
                                                    <p className="text-sm">
                                                        {planningContextLabel(
                                                            item.tooth_context,
                                                            metadata.data,
                                                        )}
                                                    </p>
                                                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-clinic-muted">
                                                        <span>
                                                            Priority:{' '}
                                                            {item.priority}
                                                        </span>
                                                        <span>
                                                            Order:{' '}
                                                            {item.sequence}
                                                        </span>
                                                        <span>
                                                            Provider #
                                                            {item.dentist_id}
                                                        </span>
                                                        <span>
                                                            Captured catalog
                                                            price:{' '}
                                                            {formatPlanAmount(
                                                                priceInCents(
                                                                    item.catalog_price,
                                                                ) ?? 0,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-bold">
                                                        Item estimate:{' '}
                                                        {formatPlanAmount(
                                                            priceInCents(
                                                                item.estimated_price,
                                                            ) ?? 0,
                                                        )}
                                                        {item.status ===
                                                        'cancelled'
                                                            ? ' (excluded from plan total)'
                                                            : ''}
                                                    </p>
                                                    {item.notes && (
                                                        <p className="whitespace-pre-wrap break-words text-sm">
                                                            {item.notes}
                                                        </p>
                                                    )}
                                                    <div className="flex flex-wrap gap-2">
                                                        {item.tooth_context &&
                                                            chartAccess.canView && (
                                                                <button
                                                                    type="button"
                                                                    className={
                                                                        buttonClass
                                                                    }
                                                                    aria-label={`View item ${item.id} on odontogram`}
                                                                    onClick={() =>
                                                                        onViewTooth(
                                                                            item.tooth_context,
                                                                        )
                                                                    }>
                                                                    View on
                                                                    odontogram
                                                                </button>
                                                            )}
                                                        {writablePlan &&
                                                            isOpenPlanItem(
                                                                item,
                                                            ) && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        className={
                                                                            buttonClass
                                                                        }
                                                                        aria-label={`Edit planned treatment ${item.id}`}
                                                                        onClick={() =>
                                                                            setItemEditor(
                                                                                item,
                                                                            )
                                                                        }>
                                                                        Edit
                                                                        item
                                                                    </button>
                                                                    {availableItemTransitions(
                                                                        plan,
                                                                        item,
                                                                    ).map(
                                                                        status => (
                                                                            <button
                                                                                type="button"
                                                                                key={
                                                                                    status
                                                                                }
                                                                                className={
                                                                                    buttonClass
                                                                                }
                                                                                aria-label={`${
                                                                                    status ===
                                                                                    'in_progress'
                                                                                        ? 'Start'
                                                                                        : status ===
                                                                                          'completed'
                                                                                        ? 'Complete'
                                                                                        : 'Cancel'
                                                                                } planned treatment ${
                                                                                    item.id
                                                                                }`}
                                                                                onClick={() =>
                                                                                    startAction(
                                                                                        {
                                                                                            item,
                                                                                            status,
                                                                                        },
                                                                                    )
                                                                                }>
                                                                                {status ===
                                                                                'in_progress'
                                                                                    ? 'Start treatment'
                                                                                    : status ===
                                                                                      'completed'
                                                                                    ? 'Complete treatment'
                                                                                    : 'Cancel treatment'}
                                                                            </button>
                                                                        ),
                                                                    )}
                                                                </>
                                                            )}
                                                    </div>
                                                </article>
                                            </li>
                                        ))}
                                    </ol>
                                </>
                            )}
                        </section>
                    )}
                </>
            )}
            {planEditor && (
                <TreatmentPlanForm
                    plan={planEditor === 'edit' ? plan : undefined}
                    canWrite={
                        canWrite && (planEditor === 'new' || writablePlan)
                    }
                    onSave={saveHeader}
                    onClose={() => setPlanEditor(null)}
                    onDenied={() => setDenied(true)}
                />
            )}
            {itemEditor && plan && (
                <TreatmentPlanItemForm
                    item={itemEditor === 'new' ? undefined : itemEditor}
                    context={context}
                    canWrite={writablePlan}
                    onSave={saveItem}
                    onClose={() => setItemEditor(null)}
                    onDenied={() => setDenied(true)}
                />
            )}
            {ordering && plan && (
                <TreatmentPlanOrderForm
                    plan={plan}
                    canWrite={writablePlan}
                    onDenied={() => setDenied(true)}
                    onClose={saved => {
                        setOrdering(false)
                        if (saved) setNotice('Item order saved.')
                        refresh()
                    }}
                    onUpdate={async (id, sequence) => {
                        if (!writablePlan)
                            throw new Error('This plan cannot be reordered.')
                        const saved = await updateTreatmentPlanItem(
                            plan.id,
                            id,
                            { sequence },
                        )
                        void detail.mutate(
                            current => ({
                                ...current,
                                items: sortPlanItems(
                                    current.items.map(item =>
                                        item.id === id ? saved : item,
                                    ),
                                ),
                            }),
                            false,
                        )
                        void feed.mutate()
                    }}
                    onReload={async () => {
                        const saved = await getTreatmentPlan(plan.id)
                        if (saved.patient_id !== patient.id)
                            throw new Error('Plan is unavailable.')
                        acceptPlan(saved)
                        return saved
                    }}
                />
            )}
            {action && plan && (
                <AppointmentDialog
                    title={
                        action.status === 'cancelled'
                            ? action.item
                                ? 'Cancel planned treatment?'
                                : 'Cancel treatment plan?'
                            : 'Update treatment status?'
                    }
                    closeLabel="Close treatment status confirmation"
                    busy={busy}
                    onClose={() => setAction(null)}>
                    <div className="space-y-4 p-6">
                        <p className="text-sm">
                            {action.status === 'cancelled'
                                ? action.item
                                    ? 'Cancel this proposed care item? It remains in the plan history.'
                                    : 'Cancel this plan and its unfinished items? Completed treatments remain unchanged.'
                                : `Set ${
                                      action.item
                                          ? action.item.treatment_name
                                          : plan.title
                                  } to ${
                                      planItemStatusLabels[action.status] ??
                                      planStatusLabels[action.status]
                                  }?`}
                        </p>
                        {actionError && (
                            <p role="alert" className="text-sm text-red-700">
                                {actionError}
                            </p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy}
                                onClick={() => setAction(null)}>
                                Keep current status
                            </button>
                            <button
                                type="button"
                                className={primaryClass}
                                disabled={busy || !writablePlan}
                                onClick={() => void performAction()}>
                                {busy ? 'Saving...' : 'Confirm status change'}
                            </button>
                        </div>
                    </div>
                </AppointmentDialog>
            )}
        </section>
    )
}
export default PatientTreatmentPlans
