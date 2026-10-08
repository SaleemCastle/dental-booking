import React from 'react'
import InfoSection from './InfoSection'
import CurrentTabDetail from './CurrentTabDetail'
import { Tabs } from '../Constants'
import { formatTabs } from '../utils'
import PatientList from './PatientList'
import OverviewDashboard from './OverviewDashboard'

const MainArea = ({ currentTab }: { currentTab: string }) => {
    const renderTabDetailSection = (tab: string) => {
        switch (tab) {
            case Tabs.Overview.toLowerCase():
                return <OverviewDashboard />
            case Tabs.PatientList.toLowerCase():
                return <PatientList />
        }
    }
    return (
        <main className="min-w-0 flex-1 min-h-screen bg-clinic-canvas">
            <InfoSection currentTab={currentTab} />
            <CurrentTabDetail currentTab={currentTab} />
            {renderTabDetailSection(formatTabs(currentTab).substring(1))}
        </main>
    )
}

export default MainArea
