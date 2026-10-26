import type { ApiFieldErrors } from './api'
import type { DentalChartMetadata } from '../services/dental-charts'
import type {
    TreatmentPlan,
    TreatmentPlanItem,
    TreatmentPlanItemStatus,
    TreatmentPlanStatus,
    TreatmentToothContext,
} from '../services/treatment-plans'

export const planStatusLabels = {
    draft: 'Draft',
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
}
export const planItemStatusLabels = {
    proposed: 'Proposed',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
}
export const planPriorities = ['low', 'normal', 'high', 'urgent'] as const
export const treatmentPlanFailureMessage = (failure: {
    message: string
    errors: ApiFieldErrors
}) =>
    Array.from(
        new Set([failure.message, ...Object.values(failure.errors).flat()]),
    ).join(' ')
export const isOpenPlan = (plan: Pick<TreatmentPlan, 'status'>) =>
    ['draft', 'active'].includes(plan.status)
export const isOpenPlanItem = (item: Pick<TreatmentPlanItem, 'status'>) =>
    ['proposed', 'in_progress'].includes(item.status)
export const sortPlanItems = (items: TreatmentPlanItem[]) =>
    [...items].sort((a, b) => a.sequence - b.sequence || a.id - b.id)

export const priceInCents = (value: string): number | null => {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
    const [whole, fraction = ''] = value.split('.')
    if (!Number.isSafeInteger(Number(whole)) || Number(whole) > 99999999)
        return null
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
export const formatPlanAmount = (cents: number) =>
    (cents / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
export const planTotalCents = (items: TreatmentPlanItem[]) =>
    items
        .filter(item => item.status !== 'cancelled')
        .reduce(
            (sum, item) => sum + (priceInCents(item.estimated_price) ?? 0),
            0,
        )
export const availablePlanTransitions = (
    plan: TreatmentPlan,
): TreatmentPlanStatus[] =>
    plan.status === 'draft'
        ? [
              ...(plan.items.some(item => item.status === 'proposed')
                  ? ['active' as const]
                  : []),
              'cancelled',
          ]
        : plan.status === 'active'
        ? [
              ...(plan.items.some(item => item.status === 'completed') &&
              plan.items.every(item => !isOpenPlanItem(item))
                  ? ['completed' as const]
                  : []),
              'cancelled',
          ]
        : []
export const availableItemTransitions = (
    plan: TreatmentPlan,
    item: TreatmentPlanItem,
): TreatmentPlanItemStatus[] =>
    !isOpenPlan(plan) || !isOpenPlanItem(item)
        ? []
        : [
              ...(plan.status === 'active'
                  ? [
                        ...(item.status === 'proposed'
                            ? ['in_progress' as const]
                            : []),
                        'completed' as const,
                    ]
                  : []),
              'cancelled',
          ]

export const validatePlanHeader = (
    title: string,
    notes: string,
): ApiFieldErrors => ({
    ...(!title.trim() || Array.from(title.trim()).length > 255
        ? { title: ['Enter a title of 1 to 255 characters.'] }
        : {}),
    ...(Array.from(notes).length > 10000
        ? { notes: ['Use 10,000 characters or fewer.'] }
        : {}),
})
export const validatePlanningContext = (
    context: TreatmentToothContext | null,
    metadata?: DentalChartMetadata,
) => {
    if (!context) return ''
    if (!metadata)
        return 'Tooth positions could not be loaded. Retry before saving a tooth-specific procedure.'
    const position = metadata.dentitions[context.dentition]?.find(
        item =>
            (context.numbering_system === 'fdi' ? item.fdi : item.tooth) ===
            context.tooth,
    )
    if (!position) return 'Select a tooth for this dentition.'
    const surfaces = context.surfaces.map(
        surface => metadata.surface_aliases[surface] ?? surface,
    )
    if (
        surfaces.length > 5 ||
        new Set(surfaces).size !== surfaces.length ||
        surfaces.some(surface => !position.surfaces.includes(surface))
    )
        return 'Select distinct surfaces allowed for this tooth.'
    return ''
}
export const planningContextLabel = (
    context: TreatmentToothContext | null,
    metadata?: DentalChartMetadata,
) => {
    if (!context) return 'General procedure'
    const position = metadata?.dentitions[context.dentition]?.find(
        item => item.fdi === context.tooth,
    )
    const label =
        context.numbering_system === 'fdi' && position
            ? position.tooth
            : context.tooth
    return `${
        context.dentition === 'adult' ? 'Adult' : 'Primary'
    } tooth ${label}${
        context.numbering_system === 'fdi' && !position ? ' (FDI)' : ''
    } · ${
        context.surfaces.length ? context.surfaces.join(', ') : 'Whole tooth'
    }`
}

// Closed items stay fixed. Open items can only move within their contiguous
// group; sequence ties retain the API's ID ordering. Each update is explicit.
export const reorderedItemUpdates = (ordered: TreatmentPlanItem[]) => {
    const updates: Array<{ id: number; sequence: number }> = []
    let previous: { id: number; sequence: number } | null = null
    for (const item of ordered) {
        const sequence = isOpenPlanItem(item)
            ? Math.max(
                  1,
                  previous
                      ? previous.sequence + (previous.id < item.id ? 0 : 1)
                      : 1,
              )
            : item.sequence
        if (
            sequence > 1000000 ||
            (previous &&
                (sequence < previous.sequence ||
                    (sequence === previous.sequence && item.id < previous.id)))
        )
            return null
        if (isOpenPlanItem(item) && sequence !== item.sequence)
            updates.push({ id: item.id, sequence })
        previous = { id: item.id, sequence }
    }
    return updates
}
