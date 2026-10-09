import React, { useState } from 'react'
import Image from 'next/image'
import { RiMenuFoldFill } from 'react-icons/ri'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { BsFillCalendar3EventFill, BsPersonFill } from 'react-icons/bs'
import { Tabs, sidebarTabs } from '../Constants'
import { AiOutlineMessage } from 'react-icons/ai'
import { IoSettings } from 'react-icons/io5'
import { MdDashboard, MdPayment } from 'react-icons/md'
import { Transition } from '@headlessui/react'

const getIcons = (tab: Tabs, active: boolean) => {
    const iconClass = `text-lg ${
        active ? 'text-clinic-blue' : 'text-clinic-muted'
    } font-medium`
    switch (tab) {
        case Tabs.Calendar:
            return <BsFillCalendar3EventFill className={iconClass} />
        case Tabs.Messages:
            return <AiOutlineMessage className={iconClass} />
        case Tabs.Overview:
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
}: {
    activeTab: string
    setActiveTab: (tab: string) => void
}) => {
    return (
        <aside className="py-5 min-h-screen w-[280px] shrink-0 border-r border-clinic-line bg-white">
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
                {sidebarTabs.map((tab, index) => {
                    const isTwoWordsOrMore = tab.split(' ').length > 1
                    const link = isTwoWordsOrMore
                        ? tab.split(' ').join('_').toLowerCase()
                        : tab.toLowerCase()
                    const isCurrentTab = activeTab === `#${link}`

                    return (
                        <Transition
                            key={index}
                            show={true}
                            enter="transition-opacity duration-75"
                            enterFrom="opacity-0"
                            enterTo="opacity-100"
                            leave="transition-opacity duration-150"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0">
                            <Link
                                onClick={e => {
                                    setActiveTab(
                                        '#' + (link as string).toLowerCase(),
                                    )
                                }}
                                href={`#${link}`}
                                key={index}
                                className={`rounded-md px-3 py-3 flex flex-row items-center gap-3 transition-colors ${
                                    isCurrentTab
                                        ? 'bg-clinic-sky text-clinic-blue'
                                        : 'text-clinic-muted hover:bg-clinic-canvas'
                                }`}>
                                <span>
                                    {getIcons(tab as Tabs, isCurrentTab)}
                                </span>
                                <h3
                                    className={`text-sm font-semibold ${
                                        isCurrentTab
                                            ? 'text-clinic-blue'
                                            : 'text-clinic-ink'
                                    }`}>
                                    {tab}
                                </h3>
                            </Link>
                        </Transition>
                    )
                })}
            </nav>
        </aside>
    )
}

export default Sidebar
