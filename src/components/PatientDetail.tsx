import React, { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { FiArrowLeft, FiCalendar } from 'react-icons/fi'
import { formatDate } from '../utils'
import { PatientPayload } from '../services/patients'
import PatientClinicalWorkspace from './PatientClinicalWorkspace'
import PatientFollowUps from './PatientFollowUps'
import { isArchivedPatient } from './PatientRowDetails'

interface PatientDetailProps {
    patient: Patient
    isLoading: boolean
    errorMessage: string
    mutationState: {
        isSaving: boolean
        isArchiving: boolean
        errorMessage: string
    }
    permissions: {
        canEdit: boolean
        canEditDemographics: boolean
        canEditMedical: boolean
        canArchive: boolean
    }
    onBack?: () => void
    onRetry?: () => void
    onUpdate?: (payload: Partial<PatientPayload>) => void | Promise<void>
    onArchive?: () => void | Promise<void>
    onCreateAppointment?: () => void
}

interface PatientEditValues {
    firstName: string
    lastName: string
    sex: string
    streetAddress: string
    town: string
    city: string
    appointments: string
    notes: string
    emergency_contact_name: string
    emergency_contact_phone: string
    emergency_contact_relationship: string
    allergies: string
    medications: string
    medical_alerts: string
}

type DetailTab =
    | 'Patient Information'
    | 'Appointment History'
    | 'Next Treatment'
    | 'Medical Record'

const detailTabs: DetailTab[] = [
    'Patient Information',
    'Appointment History',
    'Next Treatment',
    'Medical Record',
]

const listToInput = (values?: string[]) => values?.join('\n') ?? ''

const inputToList = (value: string) =>
    value
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(Boolean)

const getPatientEditValues = (patient: Patient): PatientEditValues => ({
    firstName: patient.firstName ?? '',
    lastName: patient.lastName ?? '',
    sex: patient.sex ?? '',
    streetAddress: patient.streetAddress ?? '',
    town: patient.town ?? '',
    city: patient.city ?? '',
    appointments: patient.appointments ?? '',
    notes: patient.notes ?? '',
    emergency_contact_name: patient.emergency_contact_name ?? '',
    emergency_contact_phone: patient.emergency_contact_phone ?? '',
    emergency_contact_relationship:
        patient.emergency_contact_relationship ?? '',
    allergies: listToInput(patient.allergies),
    medications: listToInput(patient.medications),
    medical_alerts: listToInput(patient.medical_alerts),
})

const DetailField = ({
    label,
    value,
}: {
    label: string
    value?: string | null
}) => (
    <div>
        <p className="text-xs font-semibold text-clinic-muted">{label}</p>
        <p className="mt-1 text-sm font-semibold text-clinic-ink">
            {value && value.trim().length > 0 ? value : 'Not captured'}
        </p>
    </div>
)

const DetailList = ({
    label,
    values,
}: {
    label: string
    values?: string[]
}) => {
    const items = values?.filter(value => value.trim().length > 0) ?? []

    return (
        <div>
            <p className="text-xs font-semibold text-clinic-muted">{label}</p>
            {items.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    {items.map(value => (
                        <span
                            key={value}
                            className="rounded-full bg-clinic-sky px-3 py-1 text-xs font-semibold text-clinic-blue">
                            {value}
                        </span>
                    ))}
                </div>
            ) : (
                <p className="mt-1 text-sm font-semibold text-clinic-ink">
                    None recorded
                </p>
            )}
        </div>
    )
}

const PatientDetail = ({
    patient,
    isLoading,
    errorMessage,
    mutationState,
    permissions,
    onBack,
    onRetry,
    onUpdate,
    onArchive,
    onCreateAppointment,
}: PatientDetailProps) => {
    const [activeTab, setActiveTab] = useState<DetailTab>('Patient Information')
    const [isEditing, setIsEditing] = useState(false)
    const [editValues, setEditValues] = useState<PatientEditValues | null>(null)
    const archived = isArchivedPatient(patient)
    const canSubmitEdit =
        permissions.canEdit && !mutationState.isSaving && !isLoading

    useEffect(() => {
        setEditValues(getPatientEditValues(patient))
        setIsEditing(false)
        setActiveTab('Patient Information')
    }, [patient])

    const detailAddress = useMemo(
        () =>
            [patient.streetAddress, patient.town, patient.city]
                .filter(Boolean)
                .join(', '),
        [patient.city, patient.streetAddress, patient.town],
    )

    const fieldClass =
        'mt-2 block w-full rounded-md border-clinic-line bg-white text-sm text-clinic-ink shadow-sm focus:border-clinic-blue focus:ring-clinic-blue/20 disabled:bg-clinic-canvas disabled:text-clinic-muted'

    const updateField = (
        event: ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
    ) => {
        const { name, value } = event.target
        setEditValues(previous =>
            previous ? { ...previous, [name]: value } : previous,
        )
    }

    const renderInput = (
        name: keyof PatientEditValues,
        label: string,
        disabled = false,
    ) => (
        <label className="block">
            <span className="text-xs font-semibold text-clinic-muted">
                {label}
            </span>
            <input
                name={name}
                value={editValues?.[name] ?? ''}
                className={`${fieldClass} h-11 px-3`}
                disabled={disabled}
                onChange={updateField}
            />
        </label>
    )

    const renderTextArea = (
        name: keyof PatientEditValues,
        label: string,
        rows = 3,
        disabled = false,
    ) => (
        <label className="block">
            <span className="text-xs font-semibold text-clinic-muted">
                {label}
            </span>
            <textarea
                name={name}
                value={editValues?.[name] ?? ''}
                rows={rows}
                className={fieldClass}
                disabled={disabled}
                onChange={updateField}
            />
        </label>
    )

    const submitEdit = async () => {
        if (!editValues || !canSubmitEdit) return

        const payload: Partial<PatientPayload> = {}

        if (permissions.canEditDemographics) {
            Object.assign(payload, {
                firstName: editValues.firstName,
                lastName: editValues.lastName,
                sex: editValues.sex,
                streetAddress: editValues.streetAddress,
                town: editValues.town,
                city: editValues.city,
                appointments: editValues.appointments,
                notes: editValues.notes,
                emergency_contact_name: editValues.emergency_contact_name,
                emergency_contact_phone: editValues.emergency_contact_phone,
                emergency_contact_relationship:
                    editValues.emergency_contact_relationship,
            })
        }

        if (permissions.canEditMedical) {
            Object.assign(payload, {
                allergies: inputToList(editValues.allergies),
                medications: inputToList(editValues.medications),
                medical_alerts: inputToList(editValues.medical_alerts),
            })
        }

        try {
            await onUpdate?.(payload)
            setIsEditing(false)
        } catch {
            // The parent exposes the mutation error in the detail screen.
        }
    }

    const archivePatient = async () => {
        if (!permissions.canArchive || archived || mutationState.isArchiving) {
            return
        }

        if (
            window.confirm(
                'Archive this patient record? It will be hidden from active patient searches.',
            )
        ) {
            await onArchive?.()
        }
    }

    const initials = `${patient.firstName.charAt(0)}${patient.lastName.charAt(
        0,
    )}`.toUpperCase()

    return (
        <section
            aria-label={`Patient detail for ${patient.firstName} ${patient.lastName}`}
            aria-busy={isLoading}
            className="px-4 py-5 sm:px-8 sm:py-6">
            <div className="mx-auto max-w-[1440px] animate-[fadeIn_300ms_ease-out] motion-reduce:animate-none">
                <nav
                    aria-label="Breadcrumb"
                    className="mb-6 flex items-center gap-2 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={onBack}
                        className="text-clinic-muted transition-colors hover:text-clinic-blue">
                        Patient list
                    </button>
                    <span aria-hidden="true" className="text-clinic-muted">
                        /
                    </span>
                    <span className="text-clinic-blue">Patient detail</span>
                </nav>

                <header className="flex flex-wrap items-center justify-between gap-5 border-b border-clinic-line pb-6">
                    <div className="flex min-w-0 items-center gap-4">
                        <span
                            aria-hidden="true"
                            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white sm:h-[72px] sm:w-[72px] ${
                                archived ? 'bg-clinic-muted' : 'bg-clinic-teal'
                            }`}>
                            {initials}
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="truncate text-xl font-extrabold text-clinic-ink sm:text-2xl">
                                    {patient.firstName} {patient.lastName}
                                </h1>
                                <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                        archived
                                            ? 'bg-clinic-rose text-rose-700'
                                            : 'bg-clinic-mint text-emerald-700'
                                    }`}>
                                    {archived ? 'Archived' : 'Active'}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-clinic-muted">
                                Patient #{patient.id}
                                {detailAddress ? ` · ${detailAddress}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onCreateAppointment}
                            className="inline-flex h-10 items-center gap-2 rounded-md bg-clinic-blue px-4 text-sm font-bold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-clinic-blue/30">
                            <FiCalendar aria-hidden="true" />
                            Create appointment
                        </button>
                        <button
                            type="button"
                            aria-label="Back to patient list"
                            onClick={onBack}
                            className="flex h-10 w-10 items-center justify-center rounded-md border border-clinic-line bg-white text-clinic-muted transition-colors hover:border-clinic-blue hover:text-clinic-blue">
                            <FiArrowLeft aria-hidden="true" />
                        </button>
                    </div>
                </header>

                {isLoading && (
                    <div
                        role="status"
                        className="mt-4 flex items-center gap-3 rounded-md bg-clinic-sky px-4 py-3 text-sm font-semibold text-clinic-blue">
                        <span
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin rounded-full border-2 border-clinic-blue/30 border-t-clinic-blue motion-reduce:animate-none"
                        />
                        Loading patient details…
                    </div>
                )}
                {errorMessage && (
                    <div
                        role="alert"
                        className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-clinic-rose px-4 py-3 text-sm text-rose-800">
                        <span>{errorMessage}</span>
                        <button
                            type="button"
                            onClick={onRetry}
                            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 font-bold text-rose-800 transition-colors hover:bg-rose-50">
                            Retry
                        </button>
                    </div>
                )}
                {mutationState.errorMessage && (
                    <p
                        role="alert"
                        className="mt-4 rounded-md border border-rose-200 bg-clinic-rose px-4 py-3 text-sm font-semibold text-rose-800">
                        {mutationState.errorMessage}
                    </p>
                )}

                <div
                    role="tablist"
                    aria-label="Patient detail sections"
                    className="mt-5 flex overflow-x-auto border-b border-clinic-line">
                    {detailTabs.map(tab => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            id={`patient-tab-${tab
                                .replace(/\s+/g, '-')
                                .toLowerCase()}`}
                            aria-selected={activeTab === tab}
                            aria-controls="patient-detail-panel"
                            onClick={() => setActiveTab(tab)}
                            className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                                activeTab === tab
                                    ? 'border-clinic-blue text-clinic-blue'
                                    : 'border-transparent text-clinic-muted hover:text-clinic-ink'
                            }`}>
                            {tab}
                        </button>
                    ))}
                </div>

                <div
                    role="tabpanel"
                    id="patient-detail-panel"
                    aria-labelledby={`patient-tab-${activeTab
                        .replace(/\s+/g, '-')
                        .toLowerCase()}`}
                    className="pt-6">
                    {activeTab === 'Patient Information' && (
                        <div className="space-y-6">
                            <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm sm:p-6">
                                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-base font-extrabold text-clinic-ink">
                                            Patient information
                                        </h2>
                                        <p className="mt-1 text-sm text-clinic-muted">
                                            Personal details and medical alerts
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {permissions.canEdit && (
                                            <button
                                                type="button"
                                                disabled={isLoading}
                                                onClick={() =>
                                                    setIsEditing(
                                                        value => !value,
                                                    )
                                                }
                                                className="rounded-md border border-clinic-line px-3 py-2 text-sm font-bold text-clinic-muted transition-colors hover:border-clinic-blue hover:text-clinic-blue disabled:opacity-50">
                                                {isEditing
                                                    ? 'Cancel edit'
                                                    : 'Edit patient'}
                                            </button>
                                        )}
                                        {permissions.canArchive && !archived && (
                                            <button
                                                type="button"
                                                disabled={
                                                    isLoading ||
                                                    mutationState.isArchiving
                                                }
                                                onClick={() =>
                                                    void archivePatient()
                                                }
                                                className="rounded-md border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700 transition-colors hover:bg-clinic-rose disabled:opacity-50">
                                                {mutationState.isArchiving
                                                    ? 'Archiving…'
                                                    : 'Archive'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {isEditing && editValues ? (
                                    <div className="space-y-5">
                                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {renderInput(
                                                'firstName',
                                                'First name',
                                                !permissions.canEditDemographics,
                                            )}
                                            {renderInput(
                                                'lastName',
                                                'Last name',
                                                !permissions.canEditDemographics,
                                            )}
                                            <label className="block">
                                                <span className="text-xs font-semibold text-clinic-muted">
                                                    Gender
                                                </span>
                                                <select
                                                    name="sex"
                                                    value={editValues.sex}
                                                    disabled={
                                                        !permissions.canEditDemographics
                                                    }
                                                    onChange={updateField}
                                                    className={fieldClass}>
                                                    <option value="">
                                                        Select gender
                                                    </option>
                                                    <option value="Female">
                                                        Female
                                                    </option>
                                                    <option value="Male">
                                                        Male
                                                    </option>
                                                </select>
                                            </label>
                                            {renderInput(
                                                'streetAddress',
                                                'Street address',
                                                !permissions.canEditDemographics,
                                            )}
                                            {renderInput(
                                                'town',
                                                'Town',
                                                !permissions.canEditDemographics,
                                            )}
                                            {renderInput(
                                                'city',
                                                'City',
                                                !permissions.canEditDemographics,
                                            )}
                                            {renderInput(
                                                'emergency_contact_name',
                                                'Emergency contact',
                                                !permissions.canEditDemographics,
                                            )}
                                            {renderInput(
                                                'emergency_contact_phone',
                                                'Emergency phone',
                                                !permissions.canEditDemographics,
                                            )}
                                            {renderInput(
                                                'emergency_contact_relationship',
                                                'Emergency relationship',
                                                !permissions.canEditDemographics,
                                            )}
                                        </div>
                                        {renderTextArea(
                                            'appointments',
                                            'Appointment context',
                                            2,
                                            !permissions.canEditDemographics,
                                        )}
                                        {renderTextArea(
                                            'notes',
                                            'Notes',
                                            3,
                                            !permissions.canEditDemographics,
                                        )}
                                        {renderTextArea(
                                            'allergies',
                                            'Allergies',
                                            2,
                                            !permissions.canEditMedical,
                                        )}
                                        {renderTextArea(
                                            'medications',
                                            'Medications',
                                            2,
                                            !permissions.canEditMedical,
                                        )}
                                        {renderTextArea(
                                            'medical_alerts',
                                            'Medical alerts',
                                            2,
                                            !permissions.canEditMedical,
                                        )}
                                        <button
                                            type="button"
                                            disabled={!canSubmitEdit}
                                            onClick={() => void submitEdit()}
                                            className="rounded-md bg-clinic-blue px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                                            {mutationState.isSaving
                                                ? 'Saving…'
                                                : 'Save changes'}
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                                            <DetailField
                                                label="Gender"
                                                value={patient.sex}
                                            />
                                            <DetailField
                                                label="Address"
                                                value={detailAddress}
                                            />
                                            <DetailField
                                                label="Emergency contact"
                                                value={
                                                    patient.emergency_contact_name
                                                }
                                            />
                                            <DetailField
                                                label="Emergency phone"
                                                value={
                                                    patient.emergency_contact_phone
                                                }
                                            />
                                            <DetailField
                                                label="Emergency relationship"
                                                value={
                                                    patient.emergency_contact_relationship
                                                }
                                            />
                                            <DetailField
                                                label="Registered"
                                                value={formatDate(
                                                    patient.created_at,
                                                )}
                                            />
                                        </div>
                                        <div className="mt-6 grid gap-6 border-t border-clinic-line pt-6 sm:grid-cols-2 lg:grid-cols-3">
                                            <DetailList
                                                label="Allergies"
                                                values={patient.allergies}
                                            />
                                            <DetailList
                                                label="Medications"
                                                values={patient.medications}
                                            />
                                            <DetailList
                                                label="Medical alerts"
                                                values={patient.medical_alerts}
                                            />
                                            <DetailField
                                                label="Patient notes"
                                                value={patient.notes}
                                            />
                                            <DetailField
                                                label="Last updated"
                                                value={formatDate(
                                                    patient.updated_at,
                                                )}
                                            />
                                        </div>
                                    </>
                                )}
                            </section>

                            <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm sm:p-6">
                                <h2 className="border-l-2 border-clinic-blue pl-3 text-sm font-extrabold uppercase text-clinic-ink">
                                    Documents &amp; imaging
                                </h2>
                                <div className="mt-5 rounded-md border border-dashed border-clinic-line bg-clinic-canvas/60 px-5 py-8 text-center">
                                    <p className="text-sm font-semibold text-clinic-ink">
                                        Patient files and clinical images
                                    </p>
                                    <p className="mt-1 text-xs text-clinic-muted">
                                        Review and manage documents in the
                                        medical record.
                                    </p>
                                    <button
                                        type="button"
                                        className="mt-4 rounded-md border border-clinic-line bg-white px-3 py-2 text-sm font-bold text-clinic-blue hover:bg-clinic-sky"
                                        onClick={() =>
                                            setActiveTab('Medical Record')
                                        }>
                                        Open documents &amp; imaging
                                    </button>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'Appointment History' && (
                        <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm sm:p-6">
                            <h2 className="text-base font-extrabold text-clinic-ink">
                                Appointment history
                            </h2>
                            {patient.appointments?.trim() ? (
                                <div className="mt-5 rounded-md bg-clinic-canvas p-4">
                                    <p className="text-xs font-semibold text-clinic-muted">
                                        Appointment context
                                    </p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm text-clinic-ink">
                                        {patient.appointments}
                                    </p>
                                </div>
                            ) : (
                                <p className="mt-5 rounded-md border border-dashed border-clinic-line px-5 py-10 text-center text-sm text-clinic-muted">
                                    No appointment history is recorded for this
                                    patient.
                                </p>
                            )}
                        </section>
                    )}

                    {activeTab === 'Next Treatment' && (
                        <PatientFollowUps
                            key={`follow-ups-${patient.id}`}
                            patient={patient}
                        />
                    )}

                    {activeTab === 'Medical Record' && (
                        <div className="space-y-5">
                            {!isLoading && !errorMessage && (
                                <PatientClinicalWorkspace
                                    key={patient.id}
                                    patient={patient}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default PatientDetail
