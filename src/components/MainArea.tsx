import React from 'react'
import InfoSection from './InfoSection'
import CurrentTabDetail from './CurrentTabDetail'
import PatientList from './PatientList'
import OverviewDashboard from './OverviewDashboard'

const MainArea = ({ currentTab }: { currentTab: string }) => {
    const renderTabDetailSection = (tab: string) => {
        switch (tab) {
            case 'dashboard':
                return <OverviewDashboard />
            case 'patient_list':
                return <PatientList />
        }
    }
    return (
        <main className="min-w-0 flex-1 min-h-screen bg-clinic-canvas">
            <InfoSection currentTab={currentTab} />
            <CurrentTabDetail currentTab={currentTab} />
            {renderTabDetailSection(currentTab)}
        </main>
    )
}

export default MainArea
