import React from 'react'
import { useSelector } from 'react-redux'
import { patientDataHeadings } from '../Constants'
import PatientRowDetails, { isArchivedPatient } from './PatientRowDetails'
import { AppState } from '../store/store'
import { PaginationMeta } from '../lib/api'
import { formatDate } from '../utils'
import { FiX } from 'react-icons/fi'

interface PatientListProps {
    meta?: PaginationMeta
    isLoading: boolean
    errorMessage: string
    selectedPatient?: Patient | null
    isDetailLoading: boolean
    detailErrorMessage: string
    onSelectPatient?: (patient: Patient) => void
    onCloseDetail?: () => void
    onPageChange?: (page: number) => void
    onRetry?: () => void
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

const PatientList = ({
    meta,
    isLoading,
    errorMessage,
    selectedPatient,
    isDetailLoading,
    detailErrorMessage,
    onSelectPatient,
    onCloseDetail,
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

    return (
        <section
            className={`grid gap-5 px-8 py-5 ${
                selectedPatient
                    ? 'xl:grid-cols-[minmax(0,1fr)_360px]'
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

                        <div className="grid gap-4">
                            <DetailField
                                label="Sex"
                                value={selectedPatient.sex}
                            />
                            <DetailField
                                label="Address"
                                value={[
                                    selectedPatient.streetAddress,
                                    selectedPatient.town,
                                    selectedPatient.city,
                                ]
                                    .filter(Boolean)
                                    .join(', ')}
                            />
                            <DetailField
                                label="Appointment context"
                                value={selectedPatient.appointments}
                            />
                            <DetailField
                                label="Registered"
                                value={formatDate(selectedPatient.created_at)}
                            />
                            <DetailField
                                label="Last updated"
                                value={formatDate(selectedPatient.updated_at)}
                            />
                            <DetailField
                                label="Notes"
                                value={selectedPatient.notes}
                            />
                        </div>

                        <div className="rounded-md border border-dashed border-clinic-line p-4">
                            <p className="text-xs font-bold uppercase text-clinic-muted">
                                Timeline
                            </p>
                            <p className="mt-2 text-sm text-clinic-muted">
                                Visits, notes, and archive events will appear
                                here as the clinical modules come online.
                            </p>
                        </div>
                    </div>
                </aside>
            ) : null}
        </section>
    )
}

export default PatientList
