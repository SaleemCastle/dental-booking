import React, { useState } from 'react'
import Image from 'next/image'
import { RiMenuFoldFill } from 'react-icons/ri'
import Link from 'next/link'
import { BsFillCalendar3EventFill, BsPersonFill } from 'react-icons/bs'
import { Tabs } from '../Constants'
import { AiOutlineMessage } from 'react-icons/ai'
import { IoSettings } from 'react-icons/io5'
import { MdDashboard, MdPayment } from 'react-icons/md'
import { Transition } from '@headlessui/react'
import { FiLogOut } from 'react-icons/fi'
import {
    AuthUser,
    getAuthUserDisplayName,
    getAuthUserEmail,
} from '../lib/auth-session'
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
        case Tabs.PaymentInformation:
            return <MdPayment className={iconClass} />
        case Tabs.Settings:
            return <IoSettings className={iconClass} />
    }
}

const Sidebar = ({
    activeTab,
    setActiveTab,
    modules,
    user,
    isLoggingOut = false,
    onLogout,
}: {
    activeTab: AppModule
    setActiveTab: (tab: AppModule) => void
    modules: NavigationModule[]
    user?: AuthUser | null
    isLoggingOut?: boolean
    onLogout?: () => void
}) => {
    const displayName = getAuthUserDisplayName(user ?? null)
    const displayEmail = getAuthUserEmail(user ?? null)

    return (
        <aside className="flex min-h-screen w-[280px] shrink-0 flex-col border-r border-clinic-line bg-white py-5">
            <div className="min-h-0 flex-1">
                <div className="flex flex-row px-5 gap-3 items-center">
                    <Image
                        src="/logo/pure_pearl.svg"
                        alt="logo"
                        width={30}
                        height={30}
                        className="object-contain"
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                        <h3 className="text-base font-extrabold text-clinic-ink truncate">
                            Pure Pearl Dental
                        </h3>
                        <p className="text-xs text-clinic-muted truncate">
                            Clinic management suite
                        </p>
                    </div>
                    <span>
                        <RiMenuFoldFill className="text-clinic-muted text-lg" />
                    </span>
                </div>
                <div className="mx-5 mt-5 rounded-md border border-clinic-line bg-clinic-canvas p-3">
                    <p className="text-[11px] font-semibold uppercase text-clinic-muted">
                        Avionna Clinic
                    </p>
                    <p className="mt-1 text-xs text-clinic-ink">
                        Jln Sudirman, NYC
                    </p>
                </div>
                <nav className="mt-5 flex flex-col gap-1 px-3">
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
                                    className={`rounded-md px-3 py-3 flex flex-row items-center gap-3 transition-colors ${
                                        isCurrentTab
                                            ? 'bg-clinic-sky text-clinic-blue'
                                            : 'text-clinic-muted hover:bg-clinic-canvas'
                                    }`}>
                                    <span>
                                        {getIcons(module.label, isCurrentTab)}
                                    </span>
                                    <h3
                                        className={`text-sm font-semibold ${
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

            <div className="mx-3 mt-5 border-t border-clinic-line pt-4">
                <div className="rounded-md bg-clinic-canvas p-3">
                    <p className="truncate text-sm font-extrabold text-clinic-ink">
                        {displayName}
                    </p>
                    {displayEmail && (
                        <p className="mt-1 truncate text-xs text-clinic-muted">
                            {displayEmail}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    disabled={isLoggingOut}
                    onClick={onLogout}
                    className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-semibold text-clinic-muted transition-colors hover:bg-clinic-canvas hover:text-clinic-blue disabled:cursor-not-allowed disabled:opacity-60">
                    <FiLogOut className="text-lg" />
                    <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
                </button>
            </div>
        </aside>
    )
}

export default Sidebar
