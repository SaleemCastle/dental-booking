import React, { useEffect, useMemo, useState } from 'react'

import Head from 'next/head'
import { useRouter } from 'next/router'
import Sidebar from '../components/Sidebar'
import MainArea from '../components/MainArea'
import { NextPage } from 'next'
import { useDispatch } from 'react-redux'
import { setPatients } from '../store/reducers/patients/patientSlice'
import { getPatients } from '../services/patients'
import { useAuth } from '../hooks/auth'
import { canRunProtectedApi } from '../lib/auth-session'
import {
    AppModule,
    canAccessModuleId,
    getAuthorizedNavigationModules,
} from '../lib/permissions'

const Home: NextPage = () => {
    const router = useRouter()
    const [currentTab, setCurrentTab] = useState<AppModule>('dashboard')
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const dispatch = useDispatch()
    const { status, user, logout } = useAuth({ middleware: 'auth' })
    const authorizedModules = useMemo(
        () => getAuthorizedNavigationModules(user),
        [user],
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

    useEffect(() => {
        if (!canRunProtectedApi(status)) {
            return
        }

        if (!canAccessModuleId(user, 'patient_list')) {
            return
        }

        getPatients()
            .then(patientsResponse => dispatch(setPatients(patientsResponse)))
            .catch(() => undefined)
    }, [dispatch, status, user])

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

            <div className="relative w-full min-h-screen flex flex-row bg-clinic-canvas">
                <Sidebar
                    activeTab={currentTab}
                    setActiveTab={setCurrentTab}
                    modules={authorizedModules}
                    user={user}
                    isLoggingOut={isLoggingOut}
                    onLogout={handleLogout}
                />
                {canAccessModuleId(user, currentTab) && (
                    <MainArea currentTab={currentTab} />
                )}
            </div>
        </>
    )
}

export default Home
