import React from 'react'
import InfoSection from './InfoSection'
import CurrentTabDetail from './CurrentTabDetail'
import PatientList from './PatientList'
import OverviewDashboard from './OverviewDashboard'
import TreatmentCatalog from './TreatmentCatalog'
import AppointmentSchedule from './AppointmentSchedule'
import { PatientArchivedFilter, PatientPayload } from '../services/patients'

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
    patientMutationState,
    patientPermissions,
    archivedPatientFilter,
    onArchivedPatientFilterChange,
    onPatientSelect,
    onPatientDetailClose,
    onPatientUpdate,
    onPatientArchive,
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
    patientMutationState?: {
        isSaving: boolean
        isArchiving: boolean
        errorMessage: string
    }
    patientPermissions?: {
        canEdit: boolean
        canEditDemographics: boolean
        canEditMedical: boolean
        canArchive: boolean
    }
    archivedPatientFilter?: PatientArchivedFilter
    onArchivedPatientFilterChange?: (value: PatientArchivedFilter) => void
    onPatientSelect?: (patient: Patient) => void
    onPatientDetailClose?: () => void
    onPatientUpdate?: (payload: Partial<PatientPayload>) => void
    onPatientArchive?: () => void
    onPatientPageChange?: (page: number) => void
    onPatientListRetry?: () => void
}) => {
    const renderTabDetailSection = (tab: string) => {
        switch (tab) {
            case 'dashboard':
                return <OverviewDashboard />
            case 'treatments':
                return <TreatmentCatalog />
            case 'calendar':
                return <AppointmentSchedule />
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
                        mutationState={
                            patientMutationState ?? {
                                isSaving: false,
                                isArchiving: false,
                                errorMessage: '',
                            }
                        }
                        permissions={
                            patientPermissions ?? {
                                canEdit: false,
                                canEditDemographics: false,
                                canEditMedical: false,
                                canArchive: false,
                            }
                        }
                        onSelectPatient={onPatientSelect}
                        onCloseDetail={onPatientDetailClose}
                        onUpdatePatient={onPatientUpdate}
                        onArchivePatient={onPatientArchive}
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
            {!['treatments', 'calendar'].includes(currentTab) && (
                <CurrentTabDetail
                    currentTab={currentTab}
                    patientTotal={patientMeta?.total}
                    archivedPatientFilter={archivedPatientFilter}
                    onArchivedPatientFilterChange={
                        onArchivedPatientFilterChange
                    }
                />
            )}
            {renderTabDetailSection(currentTab)}
        </main>
    )
}

export default MainArea
