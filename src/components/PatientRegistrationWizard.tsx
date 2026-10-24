import React, { ChangeEvent, useMemo, useRef, useState } from 'react'
import {
    FiActivity,
    FiClipboard,
    FiMapPin,
    FiPhone,
    FiUser,
} from 'react-icons/fi'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    PatientRegistrationValues,
    buildPatientRegistrationPayload,
    initialPatientRegistrationValues,
    normalizePatientRegistrationErrors,
    patientFieldMaxLengths,
    patientRegistrationSteps as stepDefinitions,
    requiredPatientFields as requiredFields,
    validatePatientRegistrationStep as validateStep,
} from '../lib/patient-registration'
import {
    WizardFieldErrors,
    getWizardStepForFieldError,
    hasWizardStepErrors,
    isWizardStepComplete,
} from '../lib/wizard'
import { createPatient } from '../services/patients'
import InputError from './InputError'
import WizardModal, { WizardStep } from './WizardModal'

interface PatientRegistrationWizardProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

type PatientFormValues = PatientRegistrationValues

const initialValues = initialPatientRegistrationValues

const getStepRequiredFields = (stepIndex: number) =>
    requiredFields.filter(field =>
        stepDefinitions[stepIndex].fields.includes(field),
    )

const buildSteps = (
    values: PatientFormValues,
    errors: WizardFieldErrors,
): WizardStep[] => {
    const labels = [
        'Identity',
        'Address',
        'Emergency contact',
        'Medical history',
        'Visit notes',
    ]
    const icons = [
        <FiUser key="identity" />,
        <FiMapPin key="address" />,
        <FiPhone key="emergency" />,
        <FiActivity key="medical" />,
        <FiClipboard key="context" />,
    ]

    return stepDefinitions.map((step, index) => ({
        id: step.id,
        label: labels[index],
        icon: icons[index],
        isComplete:
            (getStepRequiredFields(index).length > 0 ||
                step.fields.some(field => values[field].trim().length > 0)) &&
            isWizardStepComplete(step, values, getStepRequiredFields(index)) &&
            Object.keys(validateStep(values, index)).length === 0 &&
            !hasWizardStepErrors(step, errors),
    }))
}

const stepDescriptions = [
    'Enter the patient’s name and sex as recorded in their patient record.',
    'Enter the patient’s current residential address.',
    'Add someone to contact in an emergency. These details are optional.',
    'Record known allergies, current medications, and medical alerts. These details are optional.',
    'Add the reason for the visit and any other registration notes.',
]

const mergeErrors = (...errorSets: ApiFieldErrors[]) =>
    errorSets.reduce<ApiFieldErrors>(
        (merged, errors) => ({
            ...merged,
            ...Object.fromEntries(
                Object.entries(errors).filter(
                    ([, messages]) => messages.length > 0,
                ),
            ),
        }),
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

        const nextValues = { ...values, [name]: value }
        setValues(nextValues)
        setClientErrors(previous => ({
            ...previous,
            [name]: validateStep(nextValues, currentStepIndex)[name] ?? [],
        }))
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
            await createPatient(buildPatientRegistrationPayload(values))
            onSuccess()
            closeAndReset()
        } catch (error) {
            const apiError = normalizeAxiosError(error)
            const fieldErrors = normalizePatientRegistrationErrors(
                apiError.errors,
            )
            const stepIndex = getWizardStepForFieldError(
                stepDefinitions,
                fieldErrors,
            )

            setSubmitError(apiError.message)
            setServerErrors(fieldErrors)

            if (stepIndex >= 0) {
                setCurrentStepIndex(stepIndex)
                focusFirstErroredField(fieldErrors)
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const inputClass =
        'mt-2 block w-full rounded-md border-clinic-line bg-white px-3 text-sm text-clinic-ink shadow-sm focus:border-clinic-blue focus:ring-clinic-blue/20'

    const renderInput = (
        field: keyof PatientFormValues,
        label: string,
        placeholder: string,
        type: 'text' | 'tel' = 'text',
    ) => (
        <label className="block">
            <span className="text-sm font-bold text-clinic-ink">
                {label}
                {requiredFields.includes(field) ? ' *' : ' (optional)'}
            </span>
            <input
                ref={setFieldRef(field)}
                id={field}
                name={field}
                type={type}
                value={values[field]}
                required={requiredFields.includes(field)}
                maxLength={patientFieldMaxLengths[field]}
                aria-invalid={Boolean(errors[field]?.length)}
                aria-describedby={
                    errors[field]?.length ? `${field}-error` : undefined
                }
                placeholder={placeholder}
                className={`${inputClass} h-12`}
                onChange={updateValue}
            />
            <div id={`${field}-error`}>
                <InputError messages={errors[field]} className="mt-2" />
            </div>
        </label>
    )

    const renderTextarea = (
        field: 'allergies' | 'medications' | 'medical_alerts' | 'notes',
        label: string,
        placeholder: string,
        hint?: string,
    ) => (
        <label className="block">
            <span className="text-sm font-bold text-clinic-ink">
                {label}
                {requiredFields.includes(field) ? ' *' : ' (optional)'}
            </span>
            {hint && (
                <span
                    id={`${field}-hint`}
                    className="mt-1 block text-xs text-clinic-muted">
                    {hint}
                </span>
            )}
            <textarea
                ref={setFieldRef(field)}
                id={field}
                name={field}
                value={values[field]}
                rows={field === 'notes' ? 4 : 3}
                required={requiredFields.includes(field)}
                aria-invalid={Boolean(errors[field]?.length)}
                aria-describedby={`${
                    hint ? `${field}-hint ` : ''
                }${field}-error`}
                className={`${inputClass} min-h-[6rem] py-3`}
                placeholder={placeholder}
                onChange={updateValue}
            />
            <div id={`${field}-error`}>
                <InputError messages={errors[field]} className="mt-2" />
            </div>
        </label>
    )

    const renderStep = () => {
        switch (currentStepIndex) {
            case 0:
                return (
                    <div className="grid gap-5 md:grid-cols-2">
                        {renderInput('firstName', 'First name', 'Jane')}
                        {renderInput('lastName', 'Last name', 'Doe')}
                        <fieldset
                            className="block md:col-span-2"
                            aria-describedby="sex-error">
                            <legend className="text-sm font-bold text-clinic-ink">
                                Sex *
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
                                            required
                                            onChange={updateValue}
                                            className="h-5 w-5 border-clinic-line text-clinic-blue focus:ring-clinic-blue"
                                        />
                                        {gender}
                                    </label>
                                ))}
                            </div>
                            <div id="sex-error">
                                <InputError
                                    messages={errors.sex}
                                    className="mt-2"
                                />
                            </div>
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
            case 2:
                return (
                    <div className="grid gap-5 md:grid-cols-2">
                        {renderInput(
                            'emergency_contact_name',
                            'Contact name',
                            'Alex Doe',
                        )}
                        {renderInput(
                            'emergency_contact_phone',
                            'Phone number',
                            '+57 300 123 4567',
                            'tel',
                        )}
                        {renderInput(
                            'emergency_contact_relationship',
                            'Relationship to patient',
                            'Spouse, parent, sibling',
                        )}
                    </div>
                )
            case 3:
                return (
                    <div className="space-y-5">
                        {renderTextarea(
                            'allergies',
                            'Allergies',
                            'Penicillin\nLatex',
                            'Enter one allergy per line or separate entries with commas.',
                        )}
                        {renderTextarea(
                            'medications',
                            'Current medications',
                            'Medication name and dose',
                            'Enter one medication per line or separate entries with commas.',
                        )}
                        {renderTextarea(
                            'medical_alerts',
                            'Medical alerts',
                            'Diabetes\nHigh blood pressure',
                            'Enter one medical alert per line or separate entries with commas.',
                        )}
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
                        {renderTextarea(
                            'notes',
                            'Registration notes',
                            'Patient preferences, scheduling needs, or other relevant notes',
                        )}
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
            infoBanner="Fields marked * are required. Emergency contact and medical history can be added now or later."
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
                <h3 className="text-base font-extrabold text-clinic-ink">
                    {steps[currentStepIndex].label}
                </h3>
                <p className="mb-5 mt-1 text-sm text-clinic-muted">
                    {stepDescriptions[currentStepIndex]}
                </p>
                {renderStep()}
            </div>
        </WizardModal>
    )
}

export default PatientRegistrationWizard
