import React, { useRef, useState } from 'react'
import { normalizeAxiosError } from '../lib/api'
import {
    isOpenPlanItem,
    reorderedItemUpdates,
    sortPlanItems,
    treatmentPlanFailureMessage,
} from '../lib/treatment-plans'
import { TreatmentPlan, TreatmentPlanItem } from '../services/treatment-plans'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const TreatmentPlanOrderForm = ({
    plan,
    canWrite,
    onUpdate,
    onReload,
    onClose,
    onDenied,
}: {
    plan: TreatmentPlan
    canWrite: boolean
    onUpdate: (id: number, sequence: number) => Promise<void>
    onReload: () => Promise<TreatmentPlan>
    onClose: (saved?: boolean) => void
    onDenied: () => void
}) => {
    const [items, setItems] = useState(() => sortPlanItems(plan.items))
    const [initialOrder, setInitialOrder] = useState(() =>
        sortPlanItems(plan.items).map(item => item.id),
    )
    const orderChanged = items.some(
        (item, index) => item.id !== initialOrder[index],
    )
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [needsReload, setNeedsReload] = useState(false)
    const [denied, setDenied] = useState(false)
    const locked = useRef(false)
    const move = (
        index: number,
        direction: number,
    ): TreatmentPlanItem[] | null => {
        const next = [...items],
            target = index + direction
        if (
            !isOpenPlanItem(items[index]) ||
            !next[target] ||
            !isOpenPlanItem(next[target])
        )
            return null
        ;[next[index], next[target]] = [next[target], next[index]]
        return reorderedItemUpdates(next) == null ? null : next
    }
    const save = async () => {
        if (locked.current || !canWrite || denied || needsReload) return
        if (!orderChanged) {
            onClose()
            return
        }
        const updates = reorderedItemUpdates(items)
        if (!updates) {
            setMessage(
                'Finished items leave no room for this order. Reload the latest order.',
            )
            return
        }
        locked.current = true
        setBusy(true)
        setMessage('')
        let accepted = 0
        try {
            for (const update of updates) {
                await onUpdate(update.id, update.sequence)
                accepted++
            }
            onClose(true)
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setMessage(
                `${
                    accepted
                        ? `${accepted} order change${
                              accepted === 1 ? '' : 's'
                          } saved. `
                        : ''
                }${treatmentPlanFailureMessage(
                    failure,
                )} Reload the latest order before retrying.`,
            )
            setNeedsReload(true)
            if ([403, 404].includes(failure.statusCode)) {
                setDenied(true)
                onDenied()
            }
        } finally {
            locked.current = false
            setBusy(false)
        }
    }
    const reload = async () => {
        if (locked.current) return
        locked.current = true
        setBusy(true)
        try {
            const current = await onReload()
            setItems(sortPlanItems(current.items))
            setInitialOrder(sortPlanItems(current.items).map(item => item.id))
            setNeedsReload(false)
            setMessage('Latest order loaded. Review it before saving.')
        } catch (error) {
            setMessage(normalizeAxiosError(error).message)
        } finally {
            locked.current = false
            setBusy(false)
        }
    }
    return (
        <AppointmentDialog
            title="Reorder planned treatments"
            closeLabel="Close plan order"
            busy={busy}
            onClose={() => onClose()}>
            <div className="space-y-5 p-6">
                <p className="text-sm text-clinic-muted">
                    Move open treatments earlier or later. Completed and
                    cancelled items stay fixed. Priority remains independent of
                    order.
                </p>
                {message && (
                    <p role="alert" className="text-sm text-red-700">
                        {message}
                    </p>
                )}
                <ol aria-label="Treatment item order" className="space-y-3">
                    {items.map((item, index) => (
                        <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded border border-clinic-line p-3 text-sm">
                            <span>
                                {index + 1}. {item.treatment_name} · #{item.id}
                                {!isOpenPlanItem(item)
                                    ? ` (${item.status}, fixed)`
                                    : ''}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className={buttonClass}
                                    aria-label={`Move item ${item.id} earlier`}
                                    disabled={
                                        busy ||
                                        needsReload ||
                                        !canWrite ||
                                        denied ||
                                        !move(index, -1)
                                    }
                                    onClick={() => setItems(move(index, -1))}>
                                    Move up
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    aria-label={`Move item ${item.id} later`}
                                    disabled={
                                        busy ||
                                        needsReload ||
                                        !canWrite ||
                                        denied ||
                                        !move(index, 1)
                                    }
                                    onClick={() => setItems(move(index, 1))}>
                                    Move down
                                </button>
                            </div>
                        </li>
                    ))}
                </ol>
                {needsReload && (
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={busy || denied}
                        onClick={() => void reload()}>
                        Reload latest order
                    </button>
                )}
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={busy}
                        onClick={() => onClose()}>
                        Close
                    </button>
                    <button
                        type="button"
                        className={primaryClass}
                        disabled={
                            busy ||
                            needsReload ||
                            !canWrite ||
                            denied ||
                            !orderChanged
                        }
                        onClick={() => void save()}>
                        {busy ? 'Saving order...' : 'Save item order'}
                    </button>
                </div>
            </div>
        </AppointmentDialog>
    )
}
export default TreatmentPlanOrderForm
