import React, { FormEvent, useRef, useState } from 'react'
import { Dialog } from '@headlessui/react'
import { FiX } from 'react-icons/fi'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    getTreatmentFormValues,
    toTreatmentPayload,
    TreatmentFormValues,
    validateTreatmentForm,
} from '../lib/treatment-form'
import { Treatment, TreatmentPayload } from '../services/treatments'
import InputError from './InputError'

interface TreatmentFormProps {
    treatment: Treatment | null
    onClose: () => void
    onSave: (payload: TreatmentPayload) => Promise<void>
}

const TreatmentForm = ({ treatment, onClose, onSave }: TreatmentFormProps) => {
    const [values, setValues] = useState(() =>
        getTreatmentFormValues(treatment),
    )
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [errorMessage, setErrorMessage] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const savingRef = useRef(false)
    const formRef = useRef<HTMLFormElement>(null)
    const nameRef = useRef<HTMLInputElement>(null)

    const changeValue = <K extends keyof TreatmentFormValues>(
        field: K,
        value: TreatmentFormValues[K],
    ) => {
        setValues(previous => ({ ...previous, [field]: value }))
        setErrors(previous => ({ ...previous, [field]: [] }))
        setErrorMessage('')
    }

    const focusError = (nextErrors: ApiFieldErrors) => {
        const field = Object.keys(nextErrors)[0]
        const input = formRef.current?.elements.namedItem(field)
        if (input instanceof HTMLElement) {
            input.focus()
        }
    }

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (savingRef.current) return

        const nextErrors = validateTreatmentForm(values)
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length) {
            focusError(nextErrors)
            return
        }

        savingRef.current = true
        setIsSaving(true)
        setErrorMessage('')
        try {
            await onSave(toTreatmentPayload(values))
        } catch (error) {
            const apiError = normalizeAxiosError(error)
            setErrors(apiError.errors)
            setErrorMessage(apiError.message)
            focusError(apiError.errors)
        } finally {
            savingRef.current = false
            setIsSaving(false)
        }
    }

    const inputClass =
        'mt-2 block w-full rounded-md border-clinic-line bg-white text-sm text-clinic-ink focus:border-clinic-blue focus:ring-clinic-blue/20'

    const renderInput = (
        field: 'name' | 'category' | 'duration_minutes' | 'price',
        label: string,
        options: React.InputHTMLAttributes<HTMLInputElement> = {},
    ) => (
        <label className="block" htmlFor={`treatment-${field}`}>
            <span className="text-sm font-bold text-clinic-ink">{label}</span>
            <input
                {...options}
                ref={field === 'name' ? nameRef : undefined}
                id={`treatment-${field}`}
                name={field}
                required
                value={values[field]}
                className={inputClass}
                aria-invalid={Boolean(errors[field]?.length)}
                aria-describedby={`treatment-${field}-errors`}
                onChange={event => changeValue(field, event.target.value)}
            />
            <div id={`treatment-${field}-errors`}>
                <InputError messages={errors[field]} className="mt-2" />
            </div>
        </label>
    )

    return (
        <Dialog
            open={true}
            initialFocus={nameRef}
            onClose={() => {
                if (!savingRef.current) onClose()
            }}
            className="fixed inset-0 z-50 overflow-y-auto">
            <Dialog.Overlay className="fixed inset-0 bg-clinic-ink/45" />
            <div className="relative mx-auto my-8 w-[calc(100%-2rem)] max-w-xl rounded-md bg-white shadow-clinic">
                <div className="flex items-center justify-between border-b border-clinic-line px-6 py-4">
                    <Dialog.Title className="text-lg font-extrabold text-clinic-ink">
                        {treatment ? 'Edit treatment' : 'Create treatment'}
                    </Dialog.Title>
                    <button
                        type="button"
                        aria-label="Close treatment form"
                        disabled={isSaving}
                        onClick={onClose}
                        className="rounded-md p-2 text-clinic-muted hover:bg-clinic-canvas disabled:opacity-50">
                        <FiX />
                    </button>
                </div>
                <Dialog.Description className="px-6 pt-4 text-sm text-clinic-muted">
                    Active treatments are available when choosing a treatment
                    for an appointment.
                </Dialog.Description>
                <form ref={formRef} onSubmit={submit} noValidate>
                    <fieldset
                        disabled={isSaving}
                        className="space-y-5 px-6 py-5">
                        {errorMessage && (
                            <p
                                role="alert"
                                className="rounded-md bg-clinic-rose p-3 text-sm text-rose-700">
                                {errorMessage}
                            </p>
                        )}
                        {renderInput('name', 'Treatment name', {
                            maxLength: 255,
                        })}
                        {renderInput('category', 'Category', {
                            maxLength: 100,
                        })}
                        <label
                            className="block"
                            htmlFor="treatment-description">
                            <span className="text-sm font-bold text-clinic-ink">
                                Description (optional)
                            </span>
                            <textarea
                                id="treatment-description"
                                name="description"
                                rows={3}
                                value={values.description}
                                className={inputClass}
                                aria-invalid={Boolean(
                                    errors.description?.length,
                                )}
                                aria-describedby="treatment-description-errors"
                                onChange={event =>
                                    changeValue(
                                        'description',
                                        event.target.value,
                                    )
                                }
                            />
                            <div id="treatment-description-errors">
                                <InputError
                                    messages={errors.description}
                                    className="mt-2"
                                />
                            </div>
                        </label>
                        <div className="grid gap-5 sm:grid-cols-2">
                            {renderInput(
                                'duration_minutes',
                                'Duration (minutes)',
                                {
                                    type: 'number',
                                    min: 1,
                                    max: 1440,
                                    step: 1,
                                },
                            )}
                            {renderInput('price', 'Price', {
                                type: 'text',
                                inputMode: 'decimal',
                                placeholder: '0.00',
                            })}
                        </div>
                        <label className="flex items-center gap-3 text-sm font-bold text-clinic-ink">
                            <input
                                type="checkbox"
                                name="active"
                                checked={values.active}
                                aria-invalid={Boolean(errors.active?.length)}
                                aria-describedby="treatment-active-errors"
                                onChange={event =>
                                    changeValue('active', event.target.checked)
                                }
                                className="rounded border-clinic-line text-clinic-blue focus:ring-clinic-blue/20"
                            />
                            Active
                        </label>
                        <div id="treatment-active-errors">
                            <InputError messages={errors.active} />
                        </div>
                    </fieldset>
                    <div className="flex justify-end gap-3 border-t border-clinic-line px-6 py-4">
                        <button
                            type="button"
                            disabled={isSaving}
                            onClick={onClose}
                            className="rounded-md border border-clinic-line px-4 py-2 text-sm font-bold text-clinic-muted disabled:opacity-50">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="rounded-md bg-clinic-blue px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                            {isSaving
                                ? 'Saving...'
                                : treatment
                                ? 'Save changes'
                                : 'Create treatment'}
                        </button>
                    </div>
                </form>
            </div>
        </Dialog>
    )
}

export default TreatmentForm
