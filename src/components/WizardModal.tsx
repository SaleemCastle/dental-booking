import React, { ReactNode, useCallback, useEffect, useRef } from 'react'
import { FiCheck, FiX } from 'react-icons/fi'

export interface WizardStep {
    id: string
    label: string
    icon?: ReactNode
    isComplete?: boolean
}

interface WizardModalProps {
    isOpen: boolean
    title: string
    steps: WizardStep[]
    currentStepIndex: number
    children: ReactNode
    infoBanner?: ReactNode
    isDirty?: boolean
    isNextDisabled?: boolean
    isSubmitting?: boolean
    submitLabel?: string
    errorMessage?: string
    onClose: () => void
    onCancel: () => void
    onPrevious: () => void
    onNext: () => void
    onSubmit: () => void
}

const confirmDiscardChanges = () =>
    typeof window === 'undefined' || window.confirm('Discard unsaved changes?')

const WizardModal = ({
    isOpen,
    title,
    steps,
    currentStepIndex,
    children,
    infoBanner,
    isDirty = false,
    isNextDisabled = false,
    isSubmitting = false,
    submitLabel = 'Submit',
    errorMessage,
    onClose,
    onCancel,
    onPrevious,
    onNext,
    onSubmit,
}: WizardModalProps) => {
    const closeButtonRef = useRef<HTMLButtonElement | null>(null)
    const currentStepRef = useRef<HTMLLIElement | null>(null)
    const isFirstStep = currentStepIndex === 0
    const isFinalStep = currentStepIndex === steps.length - 1

    const requestClose = useCallback(() => {
        if (!isDirty || confirmDiscardChanges()) {
            onClose()
        }
    }, [isDirty, onClose])

    const requestCancel = useCallback(() => {
        if (!isDirty || confirmDiscardChanges()) {
            onCancel()
        }
    }, [isDirty, onCancel])

    useEffect(() => {
        if (!isOpen) {
            return
        }

        closeButtonRef.current?.focus()
    }, [isOpen])

    useEffect(() => {
        if (isOpen) {
            currentStepRef.current?.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
            })
        }
    }, [isOpen, currentStepIndex])

    useEffect(() => {
        if (!isOpen) {
            return
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                requestClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)

        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, requestClose])

    if (!isOpen) {
        return null
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-clinic-ink/50 px-4 py-6">
            <section
                aria-labelledby="wizard-title"
                aria-modal="true"
                className="transition-all duration-300 ease-in-out flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-clinic-line bg-white shadow-clinic self-start ml-auto mr-4"
                role="dialog">
                <header className="shrink-0 border-b border-clinic-line bg-white px-6 py-5">
                    <div className="flex items-start justify-between gap-4 border-b border-clinic-line pb-6">
                        <div>
                            <h2
                                id="wizard-title"
                                className="mt-1 text-xl font-extrabold text-clinic-ink">
                                {title}
                            </h2>
                        </div>
                        <button
                            ref={closeButtonRef}
                            type="button"
                            aria-label="Close wizard"
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-clinic-line text-clinic-muted transition-colors hover:border-clinic-blue hover:text-clinic-blue"
                            onClick={requestClose}>
                            <FiX />
                        </button>
                    </div>

                    <ol
                        className="mt-6 grid overflow-x-auto pb-2"
                        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(5rem, 1fr))` }}>
                        {steps.map((step, index) => {
                            const isComplete =
                                step.isComplete || index < currentStepIndex
                            const isCurrent = index === currentStepIndex
                            const connectorWidth = isComplete
                                ? 'w-full'
                                : isCurrent
                                ? 'w-1/2'
                                : 'w-0'

                            return (
                                <li
                                    key={step.id}
                                    ref={isCurrent ? currentStepRef : undefined}
                                    aria-current={isCurrent ? 'step' : undefined}
                                    className="relative flex min-w-0 flex-col items-center gap-3">
                                    {index < steps.length - 1 && (
                                        <span
                                            aria-hidden="true"
                                            className="absolute left-[calc(50%+30px)] top-[21px] h-0.5 w-[calc(100%-60px)] bg-clinic-line">
                                            <span
                                                className={`block h-full transition-all duration-300 ${
                                                    isComplete
                                                        ? 'bg-clinic-teal'
                                                        : isCurrent
                                                        ? 'bg-clinic-blue'
                                                        : ''
                                                } ${connectorWidth}`}
                                            />
                                        </span>
                                    )}
                                    <div className={`bg-transparent ${isComplete ? 'border-clinic-teal' : isCurrent ? 'border-clinic-blue' : 'border-none'} border-dashed h-11 w-11 flex items-center justify-center rounded-full ${isCurrent ? 'border-2' : 'border-none'}`}>
                                        <span
                                            className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold ${
                                                isComplete
                                                    ? 'border-clinic-teal bg-clinic-teal text-white'
                                                    : isCurrent
                                                    ? 'border-clinic-blue bg-clinic-blue text-white'
                                                    : 'border-clinic-line bg-white text-clinic-muted'
                                            }`}>
                                            {isComplete ? (
                                                <FiCheck />
                                            ) : (
                                                step.icon ?? index + 1
                                            )}
                                        </span>
                                    </div>
                                    <span className="min-w-0 text-center">
                                        <span className="text-[11px] font-bold uppercase text-clinic-muted">
                                            Step {index + 1}
                                        </span>
                                        <span
                                            className={`block truncate text-sm font-bold ${
                                                isCurrent
                                                    ? 'text-clinic-blue'
                                                    : 'text-clinic-ink'
                                            }`}>
                                            {step.label}
                                        </span>
                                    </span>
                                </li>
                            )
                        })}
                    </ol>

                    {infoBanner && (
                        <div className="mt-5 rounded-md border border-clinic-line bg-clinic-canvas px-4 py-3 text-sm text-clinic-muted">
                            {infoBanner}
                        </div>
                    )}
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto bg-clinic-canvas px-6 py-5">
                    {errorMessage && (
                        <div className="mb-4 rounded-md border border-rose-200 bg-clinic-rose px-4 py-3 text-sm font-bold text-rose-700">
                            {errorMessage}
                        </div>
                    )}
                    <div className="animate-[fadeIn_160ms_ease-out] transition-all duration-200 ease-out">
                        {children}
                    </div>
                </div>

                <footer className="flex shrink-0 flex-col gap-3 border-t border-clinic-line bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        className="rounded-md border border-clinic-line px-4 py-2 text-sm font-bold text-clinic-muted transition-colors hover:border-clinic-blue hover:text-clinic-blue"
                        onClick={requestCancel}>
                        Cancel
                    </button>
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            disabled={isFirstStep || isSubmitting}
                            className="rounded-md border border-clinic-line px-4 py-2 text-sm font-bold text-clinic-muted transition-colors hover:border-clinic-blue hover:text-clinic-blue disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={onPrevious}>
                            Previous
                        </button>
                        <button
                            type="button"
                            disabled={isNextDisabled || isSubmitting}
                            className="rounded-md bg-clinic-blue px-5 py-2 text-sm font-bold text-white shadow-row transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={isFinalStep ? onSubmit : onNext}>
                            {isSubmitting
                                ? 'Submitting...'
                                : isFinalStep
                                ? submitLabel
                                : 'Next'}
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    )
}

export default WizardModal
