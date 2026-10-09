import React, { useEffect, useState } from 'react'

import Head from 'next/head'
import Sidebar from '../components/Sidebar'
import MainArea from '../components/MainArea'
import { NextPage } from 'next'
import { useDispatch } from 'react-redux'
import { setPatients } from '../store/reducers/patients/patientSlice'
import { getPatients } from '../services/patients'
import { useAuth } from '../hooks/auth'
import { canRunProtectedApi } from '../lib/auth-session'

const Home: NextPage = () => {
    const [currentTab, setCurrentTab] = useState('#overview')
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const dispatch = useDispatch()
    const { status, user, logout } = useAuth({ middleware: 'auth' })

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

        getPatients()
            .then(patientsResponse => dispatch(setPatients(patientsResponse)))
            .catch(() => undefined)
    }, [dispatch, status])

    if (status !== 'authenticated') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-clinic-canvas text-sm font-bold text-clinic-muted">
                {status === 'loading' ? 'Loading session...' : 'Redirecting...'}
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
                    user={user}
                    isLoggingOut={isLoggingOut}
                    onLogout={handleLogout}
                />
                <MainArea currentTab={currentTab} />
            </div>
        </>
    )
}

export default Home
