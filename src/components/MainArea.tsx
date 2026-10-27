import React from 'react'
import CurrentTabDetail from './CurrentTabDetail'
import PatientList from './PatientList'
import OverviewDashboard from './OverviewDashboard'
import TreatmentCatalog from './TreatmentCatalog'
import AppointmentSchedule from './AppointmentSchedule'
import AuditLogViewer from './AuditLogViewer'
import UserRoleManagement from './UserRoleManagement'
import BillingWorkspace from './BillingWorkspace'
import { PatientArchivedFilter, PatientPayload } from '../services/patients'

const MainArea = ({
    currentTab,
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
    onPatientCreateAppointment,
    onPatientUpdate,
    onPatientArchive,
    onPatientPageChange,
    onPatientListRetry,
    onOpenRelatedPatient,
    onPatientDetailRetry,
}: {
    currentTab: string
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
    onPatientCreateAppointment?: () => void
    onPatientUpdate?: (payload: Partial<PatientPayload>) => void
    onPatientArchive?: () => void
    onPatientPageChange?: (page: number) => void
    onPatientListRetry?: () => void
    onOpenRelatedPatient?: (id: number) => void
    onPatientDetailRetry?: () => void
}) => {
    const showingPatientDetail =
        currentTab === 'patient_list' &&
        (Boolean(selectedPatient) ||
            Boolean(patientDetailState?.isLoading) ||
            Boolean(patientDetailState?.errorMessage))

    const renderTabDetailSection = (tab: string) => {
        switch (tab) {
            case 'dashboard':
                return (
                    <OverviewDashboard onOpenPatient={onOpenRelatedPatient} />
                )
            case 'treatments':
                return <TreatmentCatalog />
            case 'calendar':
                return <AppointmentSchedule />
            case 'audit_logs':
                return <AuditLogViewer />
            case 'user_management':
                return <UserRoleManagement />
            case 'payment_information':
                return <BillingWorkspace />
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
                        onCreateAppointment={onPatientCreateAppointment}
                        onDetailRetry={onPatientDetailRetry}
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
            {!showingPatientDetail &&
                ![
                'dashboard',
                'treatments',
                'calendar',
                'audit_logs',
                'user_management',
                'payment_information',
                ].includes(currentTab) && (
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
