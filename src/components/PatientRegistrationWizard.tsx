import React, { ChangeEvent, useMemo, useRef, useState } from 'react'
import { FiClipboard, FiMapPin, FiUser } from 'react-icons/fi'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    WizardFieldErrors,
    WizardStepDefinition,
    getWizardStepForFieldError,
    hasWizardStepErrors,
    isWizardStepComplete,
} from '../lib/wizard'
import { createPatient, PatientPayload } from '../services/patients'
import InputError from './InputError'
import WizardModal, { WizardStep } from './WizardModal'

interface PatientRegistrationWizardProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

type PatientFormValues = PatientPayload

const initialValues: PatientFormValues = {
    firstName: '',
    lastName: '',
    appointments: '',
    streetAddress: '',
    town: '',
    city: '',
    sex: '',
    notes: '',
}

const stepDefinitions: WizardStepDefinition[] = [
    { id: 'identity', fields: ['firstName', 'lastName', 'sex'] },
    { id: 'contact', fields: ['streetAddress', 'town', 'city'] },
    { id: 'clinical', fields: ['appointments', 'notes'] },
]

const requiredFields = [
    'firstName',
    'lastName',
    'sex',
    'streetAddress',
    'city',
    'appointments',
]

const getStepRequiredFields = (stepIndex: number) =>
    requiredFields.filter(field =>
        stepDefinitions[stepIndex].fields.includes(field),
    )

const buildSteps = (
    values: PatientFormValues,
    errors: WizardFieldErrors,
): WizardStep[] => [
    {
        id: 'identity',
        label: 'Patient identity',
        icon: <FiUser />,
        isComplete:
            isWizardStepComplete(
                stepDefinitions[0],
                values,
                getStepRequiredFields(0),
            ) && !hasWizardStepErrors(stepDefinitions[0], errors),
    },
    {
        id: 'contact',
        label: 'Contact details',
        icon: <FiMapPin />,
        isComplete:
            isWizardStepComplete(
                stepDefinitions[1],
                values,
                getStepRequiredFields(1),
            ) && !hasWizardStepErrors(stepDefinitions[1], errors),
    },
    {
        id: 'clinical',
        label: 'Clinical context',
        icon: <FiClipboard />,
        isComplete:
            isWizardStepComplete(
                stepDefinitions[2],
                values,
                getStepRequiredFields(2),
            ) && !hasWizardStepErrors(stepDefinitions[2], errors),
    },
]

const validateStep = (
    values: PatientFormValues,
    stepIndex: number,
): ApiFieldErrors =>
    getStepRequiredFields(stepIndex).reduce<ApiFieldErrors>((errors, field) => {
        const value = values[field]

        if (typeof value === 'string' && value.trim().length === 0) {
            errors[field] = ['This field is required.']
        }

        return errors
    }, {})

const mergeErrors = (...errorSets: ApiFieldErrors[]) =>
    errorSets.reduce<ApiFieldErrors>(
        (merged, errors) => ({ ...merged, ...errors }),
        {},
    )

const PatientRegistrationWizard = ({
    isOpen,
    onClose,
    onSuccess,
}: PatientRegistrationWizardProps) => {
    const [values, setValues] = useState<PatientFormValues>(initialValues)
    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const [clientErrors, setClientErrors] = useState<ApiFieldErrors>({})
    const [serverErrors, setServerErrors] = useState<ApiFieldErrors>({})
    const [submitError, setSubmitError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const fieldRefs = useRef<Record<string, HTMLElement | null>>({})

    const errors = useMemo(() => mergeErrors(clientErrors, serverErrors), [
        clientErrors,
        serverErrors,
    ])
    const steps = useMemo(() => buildSteps(values, errors), [errors, values])
    const currentStepErrors = validateStep(values, currentStepIndex)
    const isCurrentStepValid = Object.keys(currentStepErrors).length === 0
    const isDirty = Object.values(values).some(
        value => typeof value === 'string' && value.trim().length > 0,
    )

    const reset = () => {
        setValues(initialValues)
        setCurrentStepIndex(0)
        setClientErrors({})
        setServerErrors({})
        setSubmitError('')
        setIsSubmitting(false)
    }

    const closeAndReset = () => {
        reset()
        onClose()
    }

    const setFieldRef = (field: string) => (element: HTMLElement | null) => {
        fieldRefs.current[field] = element
    }

    const focusFirstErroredField = (nextErrors: ApiFieldErrors) => {
        const firstField = Object.keys(nextErrors)[0]

        if (!firstField) {
            return
        }

        window.setTimeout(() => fieldRefs.current[firstField]?.focus(), 80)
    }

    const updateValue = (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        const { name, value } = event.target

        setValues(previous => ({ ...previous, [name]: value }))
        setClientErrors(previous => ({ ...previous, [name]: [] }))
        setServerErrors(previous => ({ ...previous, [name]: [] }))
        setSubmitError('')
    }

    const goNext = () => {
        const nextErrors = validateStep(values, currentStepIndex)

        setClientErrors(previous => mergeErrors(previous, nextErrors))

        if (Object.keys(nextErrors).length > 0) {
            focusFirstErroredField(nextErrors)
            return
        }

        setCurrentStepIndex(index => Math.min(index + 1, steps.length - 1))
    }

    const goPrevious = () => {
        setCurrentStepIndex(index => Math.max(index - 1, 0))
    }

    const submit = async () => {
        const allErrors = stepDefinitions.reduce<ApiFieldErrors>(
            (validationErrors, _step, stepIndex) =>
                mergeErrors(validationErrors, validateStep(values, stepIndex)),
            {},
        )

        setClientErrors(allErrors)

        if (Object.keys(allErrors).length > 0) {
            const stepIndex = getWizardStepForFieldError(
                stepDefinitions,
                allErrors,
            )

            setCurrentStepIndex(stepIndex >= 0 ? stepIndex : 0)
            focusFirstErroredField(allErrors)
            return
        }

        setIsSubmitting(true)
        setSubmitError('')

        try {
            await createPatient(values)
            onSuccess()
            closeAndReset()
        } catch (error) {
            const apiError = normalizeAxiosError(error)
            const stepIndex = getWizardStepForFieldError(
                stepDefinitions,
                apiError.errors,
            )

            setSubmitError(apiError.message)
            setServerErrors(apiError.errors)

            if (stepIndex >= 0) {
                setCurrentStepIndex(stepIndex)
                focusFirstErroredField(apiError.errors)
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const inputClass =
        'mt-2 block h-12 w-full rounded-md border-clinic-line bg-white px-3 text-sm text-clinic-ink shadow-sm focus:border-clinic-blue focus:ring-clinic-blue/20'

    const renderInput = (
        field: keyof PatientFormValues,
        label: string,
        placeholder: string,
    ) => (
        <label className="block">
            <span className="text-sm font-bold text-clinic-ink">{label}</span>
            <input
                ref={setFieldRef(field)}
                id={field}
                name={field}
                value={values[field]}
                placeholder={placeholder}
                className={inputClass}
                onChange={updateValue}
            />
            <InputError messages={errors[field]} className="mt-2" />
        </label>
    )

    const renderStep = () => {
        switch (currentStepIndex) {
            case 0:
                return (
                    <div className="grid gap-5 md:grid-cols-2">
                        {renderInput('firstName', 'First name', 'Jane')}
                        {renderInput('lastName', 'Last name', 'Doe')}
                        <fieldset className="block">
                            <legend className="text-sm font-bold text-clinic-ink">
                                Gender
                            </legend>
                            <div className="mt-2 grid grid-cols-2 gap-3">
                                {['Male', 'Female'].map((gender, index) => (
                                    <label
                                        key={gender}
                                        className={`flex h-12 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-clinic-blue/20 ${
                                            values.sex === gender
                                                ? 'border-clinic-blue text-clinic-ink'
                                                : 'border-clinic-line text-clinic-ink'
                                        }`}>
                                        <input
                                            ref={
                                                index === 0
                                                    ? setFieldRef('sex')
                                                    : undefined
                                            }
                                            type="radio"
                                            name="sex"
                                            value={gender}
                                            checked={values.sex === gender}
                                            onChange={updateValue}
                                            className="h-5 w-5 border-clinic-line text-clinic-blue focus:ring-clinic-blue"
                                        />
                                        {gender}
                                    </label>
                                ))}
                            </div>
                            <InputError
                                messages={errors.sex}
                                className="mt-2"
                            />
                        </fieldset>
                    </div>
                )
            case 1:
                return (
                    <div className="grid gap-5 md:grid-cols-2">
                        {renderInput(
                            'streetAddress',
                            'Street address',
                            '123 Main Street',
                        )}
                        {renderInput('town', 'Town', 'Midtown')}
                        {renderInput('city', 'City', 'Bogota')}
                    </div>
                )
            default:
                return (
                    <div className="space-y-5">
                        {renderInput(
                            'appointments',
                            'Appointment context',
                            'Cleaning, consultation, follow-up',
                        )}
                        <label className="block">
                            <span className="text-sm font-bold text-clinic-ink">
                                Notes
                            </span>
                            <textarea
                                ref={setFieldRef('notes')}
                                id="notes"
                                name="notes"
                                value={values.notes}
                                rows={6}
                                className={inputClass}
                                placeholder="Allergies, preferences, or scheduling notes"
                                onChange={updateValue}
                            />
                            <InputError
                                messages={errors.notes}
                                className="mt-2"
                            />
                        </label>
                    </div>
                )
        }
    }

    return (
        <WizardModal
            isOpen={isOpen}
            title="Register patient"
            steps={steps}
            currentStepIndex={currentStepIndex}
            infoBanner="Capture essentials first. Clinical and billing details can be expanded after the patient record exists."
            isDirty={isDirty}
            isNextDisabled={!isCurrentStepValid}
            isSubmitting={isSubmitting}
            submitLabel="Create patient"
            errorMessage={submitError}
            onClose={closeAndReset}
            onCancel={closeAndReset}
            onPrevious={goPrevious}
            onNext={goNext}
            onSubmit={submit}>
            <div className="rounded-md border border-clinic-line bg-white p-5 shadow-sm">
                {renderStep()}
            </div>
        </WizardModal>
    )
}

export default PatientRegistrationWizard
