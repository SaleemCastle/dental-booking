import React, { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { patientDataHeadings } from '../Constants'
import PatientRowDetails, { isArchivedPatient } from './PatientRowDetails'
import { AppState } from '../store/store'
import { PaginationMeta } from '../lib/api'
import { formatDate } from '../utils'
import { FiX } from 'react-icons/fi'
import { PatientPayload } from '../services/patients'
import PatientClinicalNotes from './PatientClinicalNotes'
import PatientFollowUps from './PatientFollowUps'

interface PatientListProps {
    meta?: PaginationMeta
    isLoading: boolean
    errorMessage: string
    selectedPatient?: Patient | null
    isDetailLoading: boolean
    detailErrorMessage: string
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
    onSelectPatient?: (patient: Patient) => void
    onCloseDetail?: () => void
    onDetailRetry?: () => void
    onUpdatePatient?: (payload: Partial<PatientPayload>) => void | Promise<void>
    onArchivePatient?: () => void | Promise<void>
    onPageChange?: (page: number) => void
    onRetry?: () => void
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

const getNumber = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback

const DetailField = ({ label, value }: { label: string; value?: string }) => (
    <div>
        <p className="text-xs font-bold uppercase text-clinic-muted">{label}</p>
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
            <p className="text-xs font-bold uppercase text-clinic-muted">
                {label}
            </p>
            {items.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    {items.map(value => (
                        <span
                            key={value}
                            className="rounded bg-clinic-sky px-2 py-1 text-xs font-semibold text-clinic-blue">
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

const PatientList = ({
    meta,
    isLoading,
    errorMessage,
    selectedPatient,
    isDetailLoading,
    detailErrorMessage,
    mutationState,
    permissions,
    onSelectPatient,
    onCloseDetail,
    onDetailRetry,
    onUpdatePatient,
    onArchivePatient,
    onPageChange,
    onRetry,
}: PatientListProps) => {
    const patients = useSelector(
        (state: AppState) => state.patients.patients.patients,
    )
    const currentPage = getNumber(meta?.currentPage, 1)
    const lastPage = getNumber(meta?.lastPage, currentPage)
    const total = getNumber(meta?.total, patients.length)
    const from = getNumber(meta?.from, patients.length > 0 ? 1 : 0)
    const to = getNumber(meta?.to, patients.length)
    const showRows = !isLoading && !errorMessage && patients.length > 0
    const showEmpty = !isLoading && !errorMessage && patients.length === 0
    const [isEditing, setIsEditing] = useState(false)
    const [editValues, setEditValues] = useState<PatientEditValues | null>(null)
    const selectedPatientArchived = selectedPatient
        ? isArchivedPatient(selectedPatient)
        : false
    const canSubmitEdit =
        permissions.canEdit && !mutationState.isSaving && !isDetailLoading

    useEffect(() => {
        if (!selectedPatient) {
            setIsEditing(false)
            setEditValues(null)
            return
        }

        setEditValues(getPatientEditValues(selectedPatient))
        setIsEditing(false)
    }, [selectedPatient])

    const fieldClass =
        'mt-2 block w-full rounded-md border-clinic-line bg-white text-sm text-clinic-ink shadow-sm focus:border-clinic-blue focus:ring-clinic-blue/20 disabled:bg-clinic-canvas disabled:text-clinic-muted'

    const updateField = (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        const { name, value } = event.target

        setEditValues(previous =>
            previous ? { ...previous, [name]: value } : previous,
        )
    }

    const submitEdit = async () => {
        if (!editValues || !canSubmitEdit) {
            return
        }

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
            await onUpdatePatient?.(payload)
            setIsEditing(false)
        } catch {
            // The parent owns the API error message shown in this pane.
        }
    }

    const archiveSelectedPatient = async () => {
        if (
            !permissions.canArchive ||
            selectedPatientArchived ||
            mutationState.isArchiving
        ) {
            return
        }

        if (
            window.confirm(
                'Archive this patient record? It will be hidden from active patient searches.',
            )
        ) {
            await onArchivePatient?.()
        }
    }

    const renderInput = (
        name: keyof PatientEditValues,
        label: string,
        disabled = false,
    ) => (
        <label className="block">
            <span className="text-xs font-bold uppercase text-clinic-muted">
                {label}
            </span>
            <input
                name={name}
                value={editValues?.[name] ?? ''}
                className={`${fieldClass} h-12 px-3`}
                disabled={disabled}
                onChange={updateField}
            />
        </label>
    )

    const renderGenderSelector = (disabled = false) => (
        <fieldset className="block">
            <legend className="text-xs font-bold uppercase text-clinic-muted">
                Gender
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
                {['Male', 'Female'].map(gender => (
                    <label
                        key={gender}
                        className={`flex h-12 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm font-bold text-clinic-ink transition-colors focus-within:ring-2 focus-within:ring-clinic-blue/20 ${
                            editValues?.sex === gender
                                ? 'border-clinic-blue'
                                : 'border-clinic-line'
                        } ${
                            disabled
                                ? 'cursor-not-allowed opacity-60'
                                : ''
                        }`}>
                        <input
                            type="radio"
                            name="sex"
                            value={gender}
                            checked={editValues?.sex === gender}
                            disabled={disabled}
                            onChange={updateField}
                            className="h-5 w-5 border-clinic-line text-clinic-blue focus:ring-clinic-blue disabled:cursor-not-allowed"
                        />
                        {gender}
                    </label>
                ))}
            </div>
        </fieldset>
    )

    const renderTextArea = (
        name: keyof PatientEditValues,
        label: string,
        rows = 3,
        disabled = false,
    ) => (
        <label className="block">
            <span className="text-xs font-bold uppercase text-clinic-muted">
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

    const detailAddress = useMemo(
        () =>
            selectedPatient
                ? [
                      selectedPatient.streetAddress,
                      selectedPatient.town,
                      selectedPatient.city,
                  ]
                      .filter(Boolean)
                      .join(', ')
                : '',
        [selectedPatient],
    )

    return (
        <section
            className={`grid gap-5 px-8 py-5 ${
                selectedPatient || isDetailLoading || detailErrorMessage
                    ? 'xl:grid-cols-[minmax(0,1fr)_440px]'
                    : 'grid-cols-1'
            }`}>
            <div className="min-w-0">
                <div className="flex flex-row w-full items-center pl-4 gap-2 pb-3">
                    <div className="h-4 w-4 border border-clinic-line rounded bg-white mr-3" />
                    {patientDataHeadings.map((heading, index) => (
                        <h3
                            className={`flex-[1.5] ${
                                index === 0 ? 'flex-grow-[2]' : ''
                            } text-xs font-bold uppercase text-clinic-muted`}
                            key={index}>
                            {heading}
                        </h3>
                    ))}
                </div>

                {isLoading ? (
                    <div className="space-y-3">
                        {[0, 1, 2, 3].map(item => (
                            <div
                                key={item}
                                className="h-[66px] animate-pulse rounded-md border border-clinic-line bg-white"
                            />
                        ))}
                    </div>
                ) : null}

                {errorMessage ? (
                    <div className="rounded-md border border-rose-200 bg-white p-10 text-center shadow-sm">
                        <h3 className="text-base font-bold text-clinic-ink">
                            Patients could not be loaded
                        </h3>
                        <p className="mt-2 text-sm text-clinic-muted">
                            {errorMessage}
                        </p>
                        <button
                            type="button"
                            className="mt-5 rounded-md bg-clinic-blue px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                            onClick={onRetry}>
                            Retry
                        </button>
                    </div>
                ) : null}

                {showRows
                    ? patients.map((patient: Patient) => (
                          <PatientRowDetails
                              key={patient.id}
                              info={patient}
                              isSelected={selectedPatient?.id === patient.id}
                              onSelect={onSelectPatient}
                          />
                      ))
                    : null}

                {showEmpty ? (
                    <div className="rounded-md border border-dashed border-clinic-line bg-white p-10 text-center shadow-sm">
                        <h3 className="text-base font-bold text-clinic-ink">
                            No patients found
                        </h3>
                        <p className="mt-2 text-sm text-clinic-muted">
                            Adjust the search terms or archived filter to find
                            another record.
                        </p>
                    </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-3 rounded-md border border-clinic-line bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-clinic-muted">
                        Showing {from}-{to} of {total}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="rounded-md border border-clinic-line px-3 py-2 text-sm font-bold text-clinic-muted hover:border-clinic-blue hover:text-clinic-blue disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={isLoading || currentPage <= 1}
                            onClick={() => onPageChange?.(currentPage - 1)}>
                            Previous
                        </button>
                        <span className="min-w-[90px] text-center text-sm font-bold text-clinic-ink">
                            Page {currentPage} of {lastPage}
                        </span>
                        <button
                            type="button"
                            className="rounded-md border border-clinic-line px-3 py-2 text-sm font-bold text-clinic-muted hover:border-clinic-blue hover:text-clinic-blue disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={isLoading || currentPage >= lastPage}
                            onClick={() => onPageChange?.(currentPage + 1)}>
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {!selectedPatient && (isDetailLoading || detailErrorMessage) && (
                <aside
                    className="rounded-md border border-clinic-line bg-white p-5 shadow-sm"
                    aria-label="Patient detail">
                    <div className="flex justify-between gap-3">
                        <h3 className="text-sm font-extrabold text-clinic-ink">
                            Patient detail
                        </h3>
                        <button
                            type="button"
                            onClick={onCloseDetail}
                            aria-label="Close patient detail"
                            className="text-clinic-muted">
                            <FiX />
                        </button>
                    </div>
                    {isDetailLoading ? (
                        <p
                            role="status"
                            className="mt-4 text-sm text-clinic-muted">
                            Loading patient detail…
                        </p>
                    ) : (
                        <div role="alert" className="mt-4 text-sm text-red-700">
                            <p>{detailErrorMessage}</p>
                            <button
                                type="button"
                                onClick={onDetailRetry}
                                className="mt-3 rounded-md border border-clinic-line px-3 py-2 font-bold">
                                Retry patient detail
                            </button>
                        </div>
                    )}
                </aside>
            )}
            {selectedPatient ? (
                <aside className="rounded-md border border-clinic-line bg-white p-5 shadow-sm">
                    <div className="space-y-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase text-clinic-muted">
                                    Patient detail
                                </p>
                                <h3 className="mt-1 text-xl font-extrabold text-clinic-ink">
                                    {selectedPatient.firstName}{' '}
                                    {selectedPatient.lastName}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <span
                                    className={`rounded px-2 py-1 text-xs font-bold ${
                                        isArchivedPatient(selectedPatient)
                                            ? 'bg-clinic-rose text-rose-700'
                                            : 'bg-clinic-mint text-emerald-700'
                                    }`}>
                                    {isArchivedPatient(selectedPatient)
                                        ? 'Archived'
                                        : 'Active'}
                                </span>
                                <button
                                    type="button"
                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-clinic-line text-clinic-muted hover:border-clinic-blue hover:text-clinic-blue"
                                    aria-label="Close patient detail"
                                    onClick={onCloseDetail}>
                                    <FiX />
                                </button>
                            </div>
                        </div>

                        {isDetailLoading ? (
                            <p className="rounded-md bg-clinic-sky px-3 py-2 text-sm font-semibold text-clinic-blue">
                                Loading patient details...
                            </p>
                        ) : null}

                        {detailErrorMessage ? (
                            <p className="rounded-md bg-clinic-rose px-3 py-2 text-sm font-semibold text-rose-700">
                                {detailErrorMessage}
                            </p>
                        ) : null}

                        {mutationState.errorMessage ? (
                            <p className="rounded-md bg-clinic-rose px-3 py-2 text-sm font-semibold text-rose-700">
                                {mutationState.errorMessage}
                            </p>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                            {permissions.canEdit ? (
                                <button
                                    type="button"
                                    className="rounded-md border border-clinic-line px-3 py-2 text-sm font-bold text-clinic-muted hover:border-clinic-blue hover:text-clinic-blue disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={isDetailLoading}
                                    onClick={() =>
                                        setIsEditing(previous => !previous)
                                    }>
                                    {isEditing ? 'Cancel edit' : 'Edit patient'}
                                </button>
                            ) : (
                                <span className="rounded-md bg-clinic-canvas px-3 py-2 text-sm font-semibold text-clinic-muted">
                                    Read-only access
                                </span>
                            )}
                            {permissions.canArchive &&
                            !selectedPatientArchived ? (
                                <button
                                    type="button"
                                    className="rounded-md border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-clinic-rose disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={
                                        mutationState.isArchiving ||
                                        isDetailLoading
                                    }
                                    onClick={archiveSelectedPatient}>
                                    {mutationState.isArchiving
                                        ? 'Archiving...'
                                        : 'Archive patient'}
                                </button>
                            ) : null}
                        </div>

                        {isEditing && editValues ? (
                            <div className="space-y-5">
                                <div className="grid gap-4 md:grid-cols-2">
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
                                    {renderGenderSelector(
                                        !permissions.canEditDemographics,
                                    )}
                                    {renderInput(
                                        'city',
                                        'City',
                                        !permissions.canEditDemographics,
                                    )}
                                </div>
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
                                {renderTextArea(
                                    'appointments',
                                    'Appointment context',
                                    2,
                                    !permissions.canEditDemographics,
                                )}
                                {renderTextArea(
                                    'notes',
                                    'Notes',
                                    4,
                                    !permissions.canEditDemographics,
                                )}
                                {renderTextArea(
                                    'allergies',
                                    'Allergies',
                                    3,
                                    !permissions.canEditMedical,
                                )}
                                {renderTextArea(
                                    'medications',
                                    'Medications',
                                    3,
                                    !permissions.canEditMedical,
                                )}
                                {renderTextArea(
                                    'medical_alerts',
                                    'Medical alerts',
                                    3,
                                    !permissions.canEditMedical,
                                )}
                                <button
                                    type="button"
                                    className="w-full rounded-md bg-clinic-blue px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={!canSubmitEdit}
                                    onClick={() => void submitEdit()}>
                                    {mutationState.isSaving
                                        ? 'Saving...'
                                        : 'Save changes'}
                                </button>
                            </div>
                        ) : (
                            <div className="grid gap-5">
                                <DetailField
                                    label="Sex"
                                    value={selectedPatient.sex}
                                />
                                <DetailField
                                    label="Address"
                                    value={detailAddress}
                                />
                                <DetailField
                                    label="Emergency contact"
                                    value={
                                        selectedPatient.emergency_contact_name
                                    }
                                />
                                <DetailField
                                    label="Emergency phone"
                                    value={
                                        selectedPatient.emergency_contact_phone
                                    }
                                />
                                <DetailField
                                    label="Emergency relationship"
                                    value={
                                        selectedPatient.emergency_contact_relationship
                                    }
                                />
                                <DetailList
                                    label="Allergies"
                                    values={selectedPatient.allergies}
                                />
                                <DetailList
                                    label="Medications"
                                    values={selectedPatient.medications}
                                />
                                <DetailList
                                    label="Medical alerts"
                                    values={selectedPatient.medical_alerts}
                                />
                                <DetailField
                                    label="Appointment context"
                                    value={selectedPatient.appointments}
                                />
                                <DetailField
                                    label="Registered"
                                    value={formatDate(
                                        selectedPatient.created_at,
                                    )}
                                />
                                <DetailField
                                    label="Last updated"
                                    value={formatDate(
                                        selectedPatient.updated_at,
                                    )}
                                />
                                <DetailField
                                    label="Notes"
                                    value={selectedPatient.notes}
                                />
                            </div>
                        )}

                        {!isDetailLoading && !detailErrorMessage && (
                            <PatientFollowUps
                                key={`follow-ups-${selectedPatient.id}`}
                                patient={selectedPatient}
                            />
                        )}
                        {!isDetailLoading && !detailErrorMessage && (
                            <PatientClinicalNotes
                                key={selectedPatient.id}
                                patient={selectedPatient}
                            />
                        )}
                    </div>
                </aside>
            ) : null}
        </section>
    )
}

export default PatientList
