import React, { useEffect, useState } from 'react'

import Head from 'next/head'
import Sidebar from '../components/Sidebar'
import MainArea from '../components/MainArea'
import { NextPage } from 'next'
import { useDispatch } from 'react-redux'
import { setPatients } from '../store/reducers/patients/patientSlice'
import { getPatients } from '../services/patients'
import { useAuth } from '../hooks/auth'

const Home: NextPage = () => {
    const [currentTab, setCurrentTab] = useState('#overview')
    const dispatch = useDispatch()
    const { status, isAuthenticated } = useAuth({ middleware: 'auth' })

    useEffect(() => {
        if (!isAuthenticated) {
            return
        }

        getPatients()
            .then(patientsResponse => dispatch(setPatients(patientsResponse)))
            .catch(() => undefined)
    }, [dispatch, isAuthenticated])

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
                <Sidebar activeTab={currentTab} setActiveTab={setCurrentTab} />
                <MainArea currentTab={currentTab} />
            </div>
        </>
    )
}

export default Home
