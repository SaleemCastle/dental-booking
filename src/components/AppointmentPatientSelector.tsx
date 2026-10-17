import React, { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import { getPatients, PatientsResponse } from '../services/patients'
import {
    appointmentButtonClass,
    appointmentInputClass,
} from './AppointmentDialog'
import InputError from './InputError'

const patientLabel = (patient: Patient) =>
    `${patient.firstName} ${patient.lastName}`.trim()
const isArchived = (patient: Patient) =>
    Boolean(
        patient.archived ||
            patient.isArchived ||
            patient.is_archived ||
            patient.archived_at ||
            patient.archivedAt ||
            patient.deleted_at,
    )

const AppointmentPatientSelector = ({
    value,
    onChange,
    current,
    disabled = false,
    errors = [],
}: {
    value: string
    onChange: (value: string) => void
    current?: { id: number; name: string }
    disabled?: boolean
    errors?: string[]
}) => {
    const { user, status } = useAuthSession()
    const canView =
        status === 'authenticated' &&
        getUserPermissionSet(user).has('patients.view')
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')
    const [page, setPage] = useState(1)
    const [selected, setSelected] = useState<{
        id: number
        name: string
    } | null>(null)
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setQuery(search.trim())
            setPage(1)
        }, 250)
        return () => window.clearTimeout(timer)
    }, [search])
    const { data, error, isValidating, mutate } = useSWR<
        PatientsResponse,
        ApiError
    >(
        canView && !disabled
            ? ['appointment-patients', user, query, page]
            : null,
        () =>
            getPatients({
                search: query,
                page,
                perPage: 20,
                archived: 'without',
            }),
        { shouldRetryOnError: false },
    )
    const choices = error
        ? []
        : (data?.patients ?? []).filter(patient => !isArchived(patient))
    const retained =
        selected && String(selected.id) === value
            ? selected
            : current && String(current.id) === value
            ? current
            : null
    const missingSelected =
        retained && !choices.some(patient => String(patient.id) === value)

    return (
        <div>
            <label
                htmlFor="appointment-patient-search"
                className="text-sm font-bold text-clinic-ink">
                Find patient
                <input
                    id="appointment-patient-search"
                    type="search"
                    value={search}
                    disabled={disabled || !canView}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search by name"
                    className={appointmentInputClass}
                />
            </label>
            <label
                htmlFor="appointment-patient_id"
                className="mt-3 block text-sm font-bold text-clinic-ink">
                Patient
                <select
                    id="appointment-patient_id"
                    name="patient_id"
                    required
                    value={value}
                    disabled={disabled || !canView || !data || Boolean(error)}
                    className={appointmentInputClass}
                    aria-invalid={Boolean(errors.length)}
                    aria-describedby="appointment-patient-errors"
                    onChange={event => {
                        const patient = choices.find(
                            item => String(item.id) === event.target.value,
                        )
                        setSelected(
                            patient
                                ? {
                                      id: patient.id,
                                      name: patientLabel(patient),
                                  }
                                : null,
                        )
                        onChange(event.target.value)
                    }}>
                    <option value="">
                        {!data && canView && !error && !disabled
                            ? 'Loading patients...'
                            : 'Choose a patient'}
                    </option>
                    {missingSelected && (
                        <option value={retained.id}>
                            {retained.name} (current)
                        </option>
                    )}
                    {choices.map(patient => (
                        <option key={patient.id} value={patient.id}>
                            {patientLabel(patient)}
                        </option>
                    ))}
                </select>
            </label>
            <div id="appointment-patient-errors">
                <InputError messages={errors} className="mt-2" />
            </div>
            {!canView && (
                <p className="mt-2 text-sm text-clinic-muted">
                    Patient selection requires permission to view patients. The
                    current patient can be retained.
                </p>
            )}
            {canView && !disabled && data && choices.length === 0 && (
                <p className="mt-2 text-sm text-clinic-muted">
                    No active patients match. Try another name.
                </p>
            )}
            {error && (
                <div role="alert" className="mt-2 text-sm text-rose-700">
                    {error.message}{' '}
                    <button
                        type="button"
                        disabled={isValidating}
                        onClick={() => void mutate()}
                        className={appointmentButtonClass}>
                        Retry patients
                    </button>
                </div>
            )}
            {data &&
                !disabled &&
                (page > 1 ||
                    data.meta?.lastPage > page ||
                    choices.length === 20) && (
                    <div className="mt-2 flex items-center gap-3 text-xs text-clinic-muted">
                        <button
                            type="button"
                            disabled={page === 1 || isValidating}
                            onClick={() => setPage(previous => previous - 1)}
                            className={appointmentButtonClass}>
                            Previous patients
                        </button>
                        <span>Page {page}</span>
                        <button
                            type="button"
                            disabled={
                                isValidating ||
                                (data.meta?.lastPage
                                    ? page >= data.meta.lastPage
                                    : choices.length < 20)
                            }
                            onClick={() => setPage(previous => previous + 1)}
                            className={appointmentButtonClass}>
                            More patients
                        </button>
                    </div>
                )}
        </div>
    )
}

export default AppointmentPatientSelector
