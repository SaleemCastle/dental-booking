import React, { useCallback, useEffect, useMemo, useState } from 'react'

import Head from 'next/head'
import { useRouter } from 'next/router'
import Sidebar from '../components/Sidebar'
import MainArea from '../components/MainArea'
import WorkspaceHeader from '../components/WorkspaceHeader'
import PatientRegistrationWizard from '../components/PatientRegistrationWizard'
import { NextPage } from 'next'
import { useDispatch } from 'react-redux'
import { setPatients } from '../store/reducers/patients/patientSlice'
import {
    archivePatient,
    getPatient,
    getPatients,
    PatientArchivedFilter,
    PatientListParams,
    PatientPayload,
    updatePatient,
} from '../services/patients'
import { useAuth } from '../hooks/auth'
import { canRunProtectedApi } from '../lib/auth-session'
import { normalizeAxiosError, PaginationMeta } from '../lib/api'
import {
    AppModule,
    canAccessModuleId,
    getAuthorizedNavigationModules,
    getUserPermissionSet,
} from '../lib/permissions'

const patientPageSize = 8

const Home: NextPage = () => {
    const router = useRouter()
    const [currentTab, setCurrentTab] = useState<AppModule>('dashboard')
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const [isPatientWizardOpen, setIsPatientWizardOpen] = useState(false)
    const [patientSearch, setPatientSearch] = useState('')
    const [patientPage, setPatientPage] = useState(1)
    const [
        archivedPatientFilter,
        setArchivedPatientFilter,
    ] = useState<PatientArchivedFilter>('without')
    const [patientMeta, setPatientMeta] = useState<PaginationMeta>()
    const [patientListState, setPatientListState] = useState({
        isLoading: false,
        errorMessage: '',
    })
    const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
        null,
    )
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [patientDetailVersion, setPatientDetailVersion] = useState(0)
    const [patientDetailState, setPatientDetailState] = useState({
        isLoading: false,
        errorMessage: '',
    })
    const [patientMutationState, setPatientMutationState] = useState({
        isSaving: false,
        isArchiving: false,
        errorMessage: '',
    })
    const dispatch = useDispatch()
    const { status, user, logout } = useAuth({ middleware: 'auth' })
    const authorizedModules = useMemo(
        () => getAuthorizedNavigationModules(user),
        [user],
    )
    const userPermissions = useMemo(() => getUserPermissionSet(user), [user])
    const patientPermissions = useMemo(
        () => ({
            canEdit:
                userPermissions.has('patients.update') ||
                userPermissions.has('patients.medical.update'),
            canEditDemographics: userPermissions.has('patients.update'),
            canEditMedical: userPermissions.has('patients.medical.update'),
            canArchive: userPermissions.has('patients.archive'),
        }),
        [userPermissions],
    )
    const firstAuthorizedTab = authorizedModules[0]?.id ?? null
    const requestedTab =
        typeof router.query.tab === 'string' ? router.query.tab : null

    const handleLogout = async () => {
        if (isLoggingOut) {
            return
        }

        setIsLoggingOut(true)
        await logout()
    }

    const loadPatients = useCallback(
        async (overrides: Partial<PatientListParams> = {}) => {
            const query = {
                search: patientSearch,
                page: patientPage,
                perPage: patientPageSize,
                archived: archivedPatientFilter,
                ...overrides,
            }

            setPatientListState({ isLoading: true, errorMessage: '' })

            try {
                const patientsResponse = await getPatients(query)
                dispatch(setPatients(patientsResponse))
                setPatientMeta(patientsResponse.meta)
            } catch (error) {
                const apiError = normalizeAxiosError(error)
                setPatientListState({
                    isLoading: false,
                    errorMessage: apiError.message,
                })
                return
            }

            setPatientListState({ isLoading: false, errorMessage: '' })
        },
        [archivedPatientFilter, dispatch, patientPage, patientSearch],
    )

    const handlePatientSearchChange = (value: string) => {
        setPatientSearch(value)
        setPatientPage(1)
        setSelectedPatientId(null)
        setSelectedPatient(null)
    }

    const handlePatientSearchClear = () => {
        handlePatientSearchChange('')
    }

    const handleArchivedPatientFilterChange = (
        value: PatientArchivedFilter,
    ) => {
        setArchivedPatientFilter(value)
        setPatientPage(1)
        setSelectedPatientId(null)
        setSelectedPatient(null)
    }

    const handlePatientDetailClose = () => {
        setSelectedPatientId(null)
        setSelectedPatient(null)
        setPatientDetailState({ isLoading: false, errorMessage: '' })
        setPatientMutationState({
            isSaving: false,
            isArchiving: false,
            errorMessage: '',
        })
    }

    const handlePatientPageChange = (page: number) => {
        setPatientPage(page)
        setSelectedPatientId(null)
        setSelectedPatient(null)
    }

    const handlePatientSelect = (patient: Patient) => {
        setSelectedPatient(patient)
        setSelectedPatientId(patient.id)
        setPatientDetailState({ isLoading: true, errorMessage: '' })
        setPatientMutationState({
            isSaving: false,
            isArchiving: false,
            errorMessage: '',
        })
    }

    const handleOpenRelatedPatient = (id: number) => {
        if (!canAccessModuleId(user, 'patient_list')) return
        setSelectedPatient(null)
        setSelectedPatientId(id)
        setPatientDetailVersion(value => value + 1)
        setPatientDetailState({ isLoading: true, errorMessage: '' })
        setPatientMutationState({
            isSaving: false,
            isArchiving: false,
            errorMessage: '',
        })
        void router.push(
            { pathname: '/', query: { tab: 'patient_list' } },
            undefined,
            { shallow: true },
        )
    }

    const handlePatientCreated = () => {
        setPatientPage(1)
        void loadPatients({ page: 1 })
    }

    const handlePatientUpdate = async (payload: Partial<PatientPayload>) => {
        if (!selectedPatient || !patientPermissions.canEdit) {
            return
        }

        setPatientMutationState({
            isSaving: true,
            isArchiving: false,
            errorMessage: '',
        })

        try {
            const updatedPatient = await updatePatient(
                selectedPatient.id,
                payload,
            )

            setSelectedPatient(updatedPatient)
            await loadPatients()
            setPatientMutationState({
                isSaving: false,
                isArchiving: false,
                errorMessage: '',
            })
        } catch (error) {
            const apiError = normalizeAxiosError(error)

            setPatientMutationState({
                isSaving: false,
                isArchiving: false,
                errorMessage: apiError.message,
            })
            throw apiError
        }
    }

    const handlePatientArchive = async () => {
        if (!selectedPatient || !patientPermissions.canArchive) {
            return
        }

        setPatientMutationState({
            isSaving: false,
            isArchiving: true,
            errorMessage: '',
        })

        try {
            await archivePatient(selectedPatient.id)
            handlePatientDetailClose()
            await loadPatients()
        } catch (error) {
            const apiError = normalizeAxiosError(error)

            setPatientMutationState({
                isSaving: false,
                isArchiving: false,
                errorMessage: apiError.message,
            })
        }
    }

    useEffect(() => {
        if (!canRunProtectedApi(status)) {
            return
        }

        if (!canAccessModuleId(user, 'patient_list')) {
            return
        }

        const debounce = window.setTimeout(
            () => void loadPatients(),
            patientSearch.trim() ? 300 : 0,
        )

        return () => window.clearTimeout(debounce)
    }, [loadPatients, patientSearch, status, user])

    useEffect(() => {
        if (!selectedPatientId) {
            setPatientDetailState({ isLoading: false, errorMessage: '' })
            return
        }

        let isCurrent = true

        setPatientDetailState({ isLoading: true, errorMessage: '' })

        getPatient(selectedPatientId)
            .then(patient => {
                if (!isCurrent) {
                    return
                }

                setSelectedPatient(patient)
                setPatientDetailState({ isLoading: false, errorMessage: '' })
            })
            .catch(error => {
                if (!isCurrent) {
                    return
                }

                const apiError = normalizeAxiosError(error)
                setPatientDetailState({
                    isLoading: false,
                    errorMessage: apiError.message,
                })
            })

        return () => {
            isCurrent = false
        }
    }, [selectedPatientId, patientDetailVersion])

    useEffect(() => {
        if (!canRunProtectedApi(status)) {
            return
        }

        if (requestedTab && canAccessModuleId(user, requestedTab)) {
            setCurrentTab(requestedTab as AppModule)
            return
        }

        if (firstAuthorizedTab) {
            setCurrentTab(firstAuthorizedTab)

            if (requestedTab !== firstAuthorizedTab) {
                void router.replace(
                    {
                        pathname: '/',
                        query: { tab: firstAuthorizedTab },
                    },
                    undefined,
                    { shallow: true },
                )
            }
        }
    }, [firstAuthorizedTab, requestedTab, router, status, user])

    if (status !== 'authenticated') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-clinic-canvas text-sm font-bold text-clinic-muted">
                {status === 'loading' ? 'Loading session...' : 'Redirecting...'}
            </div>
        )
    }

    if (!firstAuthorizedTab) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-clinic-canvas text-sm font-bold text-clinic-muted">
                No modules are available for your account.
            </div>
        )
    }

    return (
        <>
            <Head>
                <title>Dental Booking</title>
            </Head>

            <div className="relative min-h-screen w-full bg-clinic-canvas">
                <WorkspaceHeader
                    currentTab={currentTab}
                    user={user}
                    patientSearch={patientSearch}
                    onPatientSearchChange={handlePatientSearchChange}
                    onPatientSearchClear={handlePatientSearchClear}
                    onAddPatient={() => setIsPatientWizardOpen(true)}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={() =>
                        setIsSidebarCollapsed(isCollapsed => !isCollapsed)
                    }
                    onLogout={handleLogout}
                    isLoggingOut={isLoggingOut}
                />
                <div className="flex min-h-[calc(100vh-4rem)] flex-col md:flex-row">
                    <Sidebar
                        activeTab={currentTab}
                        setActiveTab={setCurrentTab}
                        modules={authorizedModules}
                        isCollapsed={isSidebarCollapsed}
                    />
                    {canAccessModuleId(user, currentTab) && (
                        <MainArea
                            currentTab={currentTab}
                            patientMeta={patientMeta}
                            patientListState={patientListState}
                            selectedPatient={selectedPatient}
                            patientDetailState={patientDetailState}
                            patientMutationState={patientMutationState}
                            patientPermissions={patientPermissions}
                            archivedPatientFilter={archivedPatientFilter}
                            onArchivedPatientFilterChange={
                                handleArchivedPatientFilterChange
                            }
                            onPatientSelect={handlePatientSelect}
                            onOpenRelatedPatient={handleOpenRelatedPatient}
                            onPatientDetailRetry={() =>
                                setPatientDetailVersion(value => value + 1)
                            }
                            onPatientDetailClose={handlePatientDetailClose}
                            onPatientUpdate={handlePatientUpdate}
                            onPatientArchive={handlePatientArchive}
                            onPatientPageChange={handlePatientPageChange}
                            onPatientListRetry={() => void loadPatients()}
                        />
                    )}
                </div>
            </div>
            <PatientRegistrationWizard
                isOpen={isPatientWizardOpen}
                onClose={() => setIsPatientWizardOpen(false)}
                onSuccess={handlePatientCreated}
            />
        </>
    )
}

export default Home
