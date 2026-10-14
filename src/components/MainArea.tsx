import React from 'react'
import InfoSection from './InfoSection'
import CurrentTabDetail from './CurrentTabDetail'
import PatientList from './PatientList'
import OverviewDashboard from './OverviewDashboard'
import { PatientArchivedFilter } from '../services/patients'

const MainArea = ({
    currentTab,
    onAddPatient,
    patientSearch,
    onPatientSearchChange,
    onPatientSearchClear,
    patientMeta,
    patientListState,
    selectedPatient,
    patientDetailState,
    archivedPatientFilter,
    onArchivedPatientFilterChange,
    onPatientSelect,
    onPatientDetailClose,
    onPatientPageChange,
    onPatientListRetry,
}: {
    currentTab: string
    onAddPatient?: () => void
    patientSearch?: string
    onPatientSearchChange?: (value: string) => void
    onPatientSearchClear?: () => void
    patientMeta?: import('../lib/api').PaginationMeta
    patientListState?: { isLoading: boolean; errorMessage: string }
    selectedPatient?: Patient | null
    patientDetailState?: { isLoading: boolean; errorMessage: string }
    archivedPatientFilter?: PatientArchivedFilter
    onArchivedPatientFilterChange?: (value: PatientArchivedFilter) => void
    onPatientSelect?: (patient: Patient) => void
    onPatientDetailClose?: () => void
    onPatientPageChange?: (page: number) => void
    onPatientListRetry?: () => void
}) => {
    const renderTabDetailSection = (tab: string) => {
        switch (tab) {
            case 'dashboard':
                return <OverviewDashboard />
            case 'patient_list':
                return (
                    <PatientList
                        meta={patientMeta}
                        isLoading={patientListState?.isLoading ?? false}
                        errorMessage={patientListState?.errorMessage ?? ''}
                        selectedPatient={selectedPatient}
                        isDetailLoading={patientDetailState?.isLoading ?? false}
                        detailErrorMessage={
                            patientDetailState?.errorMessage ?? ''
                        }
                        onSelectPatient={onPatientSelect}
                        onCloseDetail={onPatientDetailClose}
                        onPageChange={onPatientPageChange}
                        onRetry={onPatientListRetry}
                    />
                )
        }
    }
    return (
        <main className="min-w-0 flex-1 min-h-screen bg-clinic-canvas">
            <InfoSection
                currentTab={currentTab}
                onAddPatient={onAddPatient}
                patientSearch={patientSearch}
                onPatientSearchChange={onPatientSearchChange}
                onPatientSearchClear={onPatientSearchClear}
            />
            <CurrentTabDetail
                currentTab={currentTab}
                patientTotal={patientMeta?.total}
                archivedPatientFilter={archivedPatientFilter}
                onArchivedPatientFilterChange={onArchivedPatientFilterChange}
            />
            {renderTabDetailSection(currentTab)}
        </main>
    )
}

export default MainArea
