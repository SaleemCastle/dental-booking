import React, { FormEvent, useRef, useState } from 'react'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import { validatePlanHeader } from '../lib/treatment-plans'
import { TreatmentPlan, TreatmentPlanUpdate } from '../services/treatment-plans'
import InputError from './InputError'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const TreatmentPlanForm = ({
    plan,
    canWrite,
    onSave,
    onClose,
    onDenied,
}: {
    plan?: TreatmentPlan
    canWrite: boolean
    onSave: (payload: TreatmentPlanUpdate & { title?: string }) => Promise<void>
    onClose: () => void
    onDenied: () => void
}) => {
    const initial = useRef(plan).current
    const [title, setTitle] = useState(plan?.title ?? '')
    const [notes, setNotes] = useState(plan?.notes ?? '')
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [message, setMessage] = useState('')
    const [saving, setSaving] = useState(false)
    const [denied, setDenied] = useState(false)
    const locked = useRef(false)
    const form = useRef<HTMLFormElement>(null)
    const titleRef = useRef<HTMLInputElement>(null)
    const dirty =
        title !== (initial?.title ?? '') || notes !== (initial?.notes ?? '')
    const close = () => {
        if (
            !saving &&
            (!dirty || window.confirm('Discard unsaved plan details?'))
        )
            onClose()
    }
    const focusError = (errors: ApiFieldErrors) => {
        const field = form.current?.elements.namedItem(Object.keys(errors)[0])
        if (field instanceof HTMLElement) field.focus()
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (locked.current || !canWrite || denied) return
        const validation = validatePlanHeader(title, notes)
        setErrors(validation)
        if (Object.keys(validation).length) {
            focusError(validation)
            return
        }
        const payload = {
            ...(initial && title.trim() === initial.title
                ? {}
                : { title: title.trim() }),
            ...(initial && (notes || null) === initial.notes
                ? {}
                : { notes: notes || null }),
        }
        if (plan && !Object.keys(payload).length) {
            onClose()
            return
        }
        locked.current = true
        setSaving(true)
        setMessage('')
        try {
            await onSave(payload)
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setErrors(failure.errors)
            setMessage(failure.message)
            focusError(failure.errors)
            if ([403, 404].includes(failure.statusCode)) {
                setDenied(true)
                onDenied()
            }
        } finally {
            locked.current = false
            setSaving(false)
        }
    }
    return (
        <AppointmentDialog
            title={plan ? 'Edit treatment plan' : 'Create treatment plan'}
            closeLabel="Close treatment plan form"
            initialFocus={titleRef}
            busy={saving}
            onClose={close}>
            <form
                ref={form}
                onSubmit={submit}
                noValidate
                className="space-y-5 p-6">
                {message && (
                    <p role="alert" className="text-sm text-red-700">
                        {message}
                    </p>
                )}
                {Object.entries(errors)
                    .filter(([field]) => !['title', 'notes'].includes(field))
                    .map(([field, messages]) => (
                        <div key={field} role="alert">
                            <InputError messages={messages} />
                        </div>
                    ))}
                {(!canWrite || denied) && (
                    <p role="alert" className="text-sm text-red-700">
                        Plan editing is unavailable. Your entries have been
                        kept.
                    </p>
                )}
                <fieldset
                    disabled={saving || !canWrite || denied}
                    className="min-w-0 space-y-5">
                    <label className="block text-sm font-bold">
                        Plan title *
                        <input
                            ref={titleRef}
                            name="title"
                            aria-label="Plan title"
                            required
                            maxLength={255}
                            value={title}
                            className={inputClass}
                            aria-invalid={Boolean(errors.title?.length)}
                            aria-describedby="plan-title-error"
                            onChange={event => {
                                setTitle(event.target.value)
                                setErrors(current => ({
                                    ...current,
                                    title: [],
                                }))
                            }}
                        />
                        <span id="plan-title-error">
                            <InputError
                                messages={errors.title}
                                className="mt-2"
                            />
                        </span>
                    </label>
                    <label className="block text-sm font-bold">
                        Plan notes (optional)
                        <textarea
                            name="notes"
                            aria-label="Plan notes"
                            rows={4}
                            maxLength={10000}
                            value={notes}
                            className={inputClass}
                            aria-invalid={Boolean(errors.notes?.length)}
                            aria-describedby="plan-notes-error"
                            onChange={event => {
                                setNotes(event.target.value)
                                setErrors(current => ({
                                    ...current,
                                    notes: [],
                                }))
                            }}
                        />
                        <span id="plan-notes-error">
                            <InputError
                                messages={errors.notes}
                                className="mt-2"
                            />
                        </span>
                    </label>
                    {!plan && (
                        <p className="text-sm text-clinic-muted">
                            The plan starts as a draft. Add catalog treatments,
                            review estimates, then activate it when ready.
                        </p>
                    )}
                </fieldset>
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={saving}
                        onClick={close}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className={primaryClass}
                        disabled={saving || !canWrite || denied}>
                        {saving
                            ? 'Saving...'
                            : plan
                            ? 'Save plan details'
                            : 'Create draft plan'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
export default TreatmentPlanForm
