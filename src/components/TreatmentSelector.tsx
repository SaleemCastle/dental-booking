import React, { useEffect, useId } from 'react'
import { useTreatments } from '../hooks/treatments'
import { Treatment } from '../services/treatments'

interface TreatmentSelectorProps {
    value: number | null
    onChange: (treatment: Treatment | null) => void
    disabled?: boolean
    required?: boolean
    errorMessage?: string
    id?: string
}

// Appointment forms can use the selected ID, duration_minutes, and price.
const TreatmentSelector = ({
    value,
    onChange,
    disabled = false,
    required = false,
    errorMessage,
    id,
}: TreatmentSelectorProps) => {
    const generatedId = useId()
    const selectId = id ?? `appointment-treatment-${generatedId}`
    const {
        treatments,
        error,
        isLoading,
        canView,
        retry,
        isValidating,
    } = useTreatments(true)
    const activeTreatments = (canView && !error ? treatments ?? [] : []).filter(
        treatment => treatment.active,
    )
    const selectedAvailable =
        value === null ||
        activeTreatments.some(treatment => treatment.id === value)
    const message = !canView
        ? 'You do not have permission to view treatments.'
        : error?.message ??
          errorMessage ??
          (!selectedAvailable && !isLoading
              ? 'This treatment is no longer available. Choose an active treatment.'
              : '')
    const placeholder = isLoading
        ? 'Loading treatments...'
        : !canView || error
        ? 'Treatments unavailable'
        : activeTreatments.length === 0
        ? 'No active treatments available'
        : 'Choose a treatment'

    useEffect(() => {
        if (
            canView &&
            !isLoading &&
            !error &&
            value !== null &&
            !selectedAvailable
        ) {
            onChange(null)
        }
    }, [canView, error, isLoading, onChange, selectedAvailable, value])

    return (
        <div>
            <label
                htmlFor={selectId}
                className="text-sm font-bold text-clinic-ink">
                Treatment
            </label>
            <select
                id={selectId}
                name="treatmentId"
                value={selectedAvailable ? value ?? '' : ''}
                required={required}
                disabled={
                    disabled ||
                    !canView ||
                    isLoading ||
                    Boolean(error) ||
                    activeTreatments.length === 0
                }
                aria-invalid={Boolean(message)}
                aria-describedby={`${selectId}-message`}
                onChange={event =>
                    onChange(
                        activeTreatments.find(
                            treatment =>
                                treatment.id === Number(event.target.value),
                        ) ?? null,
                    )
                }
                className="mt-2 block w-full rounded-md border-clinic-line bg-white text-sm text-clinic-ink focus:border-clinic-blue focus:ring-clinic-blue/20 disabled:opacity-50">
                <option value="">{placeholder}</option>
                {activeTreatments.map(treatment => (
                    <option key={treatment.id} value={treatment.id}>
                        {treatment.name} · {treatment.duration_minutes} min ·{' '}
                        {treatment.price}
                    </option>
                ))}
            </select>
            <p
                id={`${selectId}-message`}
                role={message ? 'alert' : undefined}
                className="mt-2 text-sm text-rose-700">
                {message}
            </p>
            {error && (
                <button
                    type="button"
                    disabled={isValidating}
                    onClick={() => void retry()}
                    className="mt-2 text-sm font-bold text-clinic-blue disabled:opacity-50">
                    {isValidating ? 'Loading...' : 'Retry treatments'}
                </button>
            )}
        </div>
    )
}

export default TreatmentSelector
