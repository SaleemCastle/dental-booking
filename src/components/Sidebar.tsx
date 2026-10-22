import React, { useState } from 'react'
import Link from 'next/link'
import { BsFillCalendar3EventFill, BsPersonFill } from 'react-icons/bs'
import { Tabs } from '../Constants'
import { AiOutlineMessage } from 'react-icons/ai'
import { IoSettings } from 'react-icons/io5'
import { MdDashboard, MdPayment } from 'react-icons/md'
import { Transition } from '@headlessui/react'
import { FiClipboard, FiShield } from 'react-icons/fi'
import { AppModule, NavigationModule } from '../lib/permissions'

const getIcons = (tab: Tabs, active: boolean) => {
    const iconClass = `text-lg ${
        active ? 'text-clinic-blue' : 'text-clinic-muted'
    } font-medium`
    switch (tab) {
        case Tabs.Calendar:
            return <BsFillCalendar3EventFill className={iconClass} />
        case Tabs.Messages:
            return <AiOutlineMessage className={iconClass} />
        case Tabs.Dashboard:
            return <MdDashboard className={iconClass} />
        case Tabs.PatientList:
            return <BsPersonFill className={iconClass} />
        case Tabs.Treatments:
            return <FiClipboard className={iconClass} />
        case Tabs.PaymentInformation:
            return <MdPayment className={iconClass} />
        case Tabs.Settings:
            return <IoSettings className={iconClass} />
        case Tabs.AuditLogs:
        case Tabs.UserManagement:
            return <FiShield className={iconClass} />
    }
}

const Sidebar = ({
    activeTab,
    setActiveTab,
    modules,
    isCollapsed,
}: {
    activeTab: AppModule
    setActiveTab: (tab: AppModule) => void
    modules: NavigationModule[]
    isCollapsed: boolean
}) => {
    return (
        <aside
            className={`${
                isCollapsed ? 'w-0 md:w-[72px]' : 'w-full md:w-[220px]'
            } min-h-0 shrink-0 overflow-hidden border-r border-clinic-line bg-white py-3 transition-[width] duration-300 ease-in-out md:min-h-[calc(100vh-4rem)]`}>
            <div className="min-h-0 flex-1">
                {!isCollapsed && (
                    <div className="mx-4 mt-2 rounded-md border border-clinic-line bg-clinic-canvas p-3">
                        <p className="text-[11px] font-semibold uppercase text-clinic-muted">
                            Avionna Clinic
                        </p>
                        <p className="mt-1 text-xs text-clinic-ink">
                            Jln Sudirman, NYC
                        </p>
                    </div>
                )}
                <nav className="mt-3 flex flex-col gap-1 px-2">
                    {modules.map(module => {
                        const isCurrentTab = activeTab === module.id

                        return (
                            <Transition
                                key={module.id}
                                show={true}
                                enter="transition-opacity duration-75"
                                enterFrom="opacity-0"
                                enterTo="opacity-100"
                                leave="transition-opacity duration-150"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0">
                                <Link
                                    onClick={() => {
                                        setActiveTab(module.id)
                                    }}
                                    href={module.href}
                                    title={isCollapsed ? module.label : undefined}
                                    aria-label={module.label}
                                    className={`flex flex-row items-center gap-3 rounded-md px-3 py-3 transition-colors ${
                                        isCollapsed
                                            ? 'md:justify-center md:px-2'
                                            : ''
                                    } ${
                                        isCurrentTab
                                            ? 'bg-clinic-sky text-clinic-blue'
                                            : 'text-clinic-muted hover:bg-clinic-canvas'
                                    }`}>
                                    <span>
                                        {getIcons(module.label, isCurrentTab)}
                                    </span>
                                    <h3
                                        className={`text-sm font-semibold ${
                                            isCollapsed ? 'md:hidden' : ''
                                        } ${
                                            isCurrentTab
                                                ? 'text-clinic-blue'
                                                : 'text-clinic-ink'
                                        }`}>
                                        {module.label}
                                    </h3>
                                </Link>
                            </Transition>
                        )
                    })}
                </nav>
            </div>
        </aside>
    )
}

export default Sidebar
