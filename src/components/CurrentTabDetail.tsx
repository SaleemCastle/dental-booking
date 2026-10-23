import React, { useCallback } from 'react'
import { SlArrowRight } from 'react-icons/sl'
import CurrentTabDetailActionBox from './CurrentTabDetailActionBox'
import { useSelector } from 'react-redux'

import { AppState } from '../store/store'
import { PatientArchivedFilter } from '../services/patients'

const CurrentTabDetail = ({
    currentTab,
    patientTotal,
    archivedPatientFilter = 'without',
    onArchivedPatientFilterChange,
}: {
    currentTab: string
    patientTotal?: number
    archivedPatientFilter?: PatientArchivedFilter
    onArchivedPatientFilterChange?: (value: PatientArchivedFilter) => void
}) => {
    const handlePrint = () => {}
    const handleEdit = () => {}
    const patientListCount = useSelector(
        (state: AppState) => state.patients.patients.patients.length,
    )
    const displayedPatientCount = patientTotal ?? patientListCount

    const renderContent = useCallback(
        (tab: string) => {
            switch (tab) {
                case 'patient_list':
                    return (
                        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-clinic-line bg-white px-4 py-3 sm:px-8">
                            <div className="flex items-baseline gap-2">
                                <h3 className="text-xl font-extrabold text-clinic-ink">
                                    {displayedPatientCount}
                                </h3>
                                <h3 className="text-xs font-medium text-clinic-muted">
                                    total patient
                                    {displayedPatientCount === 1 ? '' : 's'}
                                </h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <label className="sr-only" htmlFor="patient-archive-filter">
                                    Filter patient records
                                </label>
                                <select
                                    id="patient-archive-filter"
                                    className="h-9 rounded-md border border-clinic-line bg-white px-3 text-xs font-semibold text-clinic-muted focus:border-clinic-blue focus:ring-clinic-blue/20"
                                    value={archivedPatientFilter}
                                    onChange={event =>
                                        onArchivedPatientFilterChange?.(
                                            event.target
                                                .value as PatientArchivedFilter,
                                        )
                                    }>
                                    <option value="without">
                                        Active records
                                    </option>
                                    <option value="with">
                                        Active and archived
                                    </option>
                                    <option value="only">Archived only</option>
                                </select>
                            </div>
                        </div>
                    )
                default:
                    return (
                        <div className="flex flex-row px-8 h-16 border-b border-clinic-line bg-white justify-between">
                            <div className="flex flex-row gap-6 items-center">
                                <h3 className="capitalize text-clinic-blue font-extrabold">
                                    {currentTab.split('_').join(' ')}
                                </h3>
                                <span>
                                    <SlArrowRight className="text-clinic-muted" />
                                </span>
                                <h3 className="text-clinic-muted">
                                    Today&apos;s clinic flow
                                </h3>
                            </div>

                            <div className="flex flex-row gap-1 items-center">
                                <CurrentTabDetailActionBox
                                    icon="print"
                                    onClick={handlePrint}
                                />
                                <CurrentTabDetailActionBox
                                    icon="edit"
                                    action="Edit Patient"
                                    onClick={handleEdit}
                                    containerStyles="max-h-[42px] px-5"
                                />
                            </div>
                        </div>
                    )
            }
        },
        [
            currentTab,
            displayedPatientCount,
            archivedPatientFilter,
            onArchivedPatientFilterChange,
        ],
    )
    return <>{renderContent(currentTab)}</>
}

export default CurrentTabDetail
