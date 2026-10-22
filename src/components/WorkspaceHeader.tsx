import React, { useState } from 'react'
import Image from 'next/image'
import {
    FiChevronDown,
    FiChevronLeft,
    FiChevronRight,
    FiLogOut,
} from 'react-icons/fi'
import { AppModule } from '../lib/permissions'
import {
    AuthUser,
    getAuthUserDisplayName,
    getAuthUserEmail,
} from '../lib/auth-session'
import { formatModuleLabel } from '../utils'
import ActionButton from './ActionButton'
import Searchbar from './Searchbar'

const getRoleLabel = (user: AuthUser | null) => {
    if (!user) {
        return 'Team member'
    }

    const role = user.role ?? user.roleName ?? user.role_name
    if (typeof role === 'string') {
        return role
    }
    if (role && typeof role === 'object' && 'name' in role) {
        const name = role.name
        if (typeof name === 'string') {
            return name
        }
    }

    if (Array.isArray(user.roles) && user.roles.length > 0) {
        const firstRole = user.roles[0]
        if (typeof firstRole === 'string') {
            return firstRole
        }
        if (
            firstRole &&
            typeof firstRole === 'object' &&
            'name' in firstRole
        ) {
            const name = firstRole.name
            if (typeof name === 'string') {
                return name
            }
        }
    }

    return 'Team member'
}

const WorkspaceHeader = ({
    currentTab,
    user,
    patientSearch = '',
    onPatientSearchChange,
    onPatientSearchClear,
    onAddPatient,
    onToggleSidebar,
    isSidebarCollapsed,
    onLogout,
    isLoggingOut = false,
}: {
    currentTab: AppModule
    user: AuthUser | null
    patientSearch?: string
    onPatientSearchChange: (value: string) => void
    onPatientSearchClear: () => void
    onAddPatient: () => void
    onToggleSidebar: () => void
    isSidebarCollapsed: boolean
    onLogout: () => void
    isLoggingOut?: boolean
}) => {
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
    const displayName = getAuthUserDisplayName(user)
    const displayEmail = getAuthUserEmail(user)
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0))
        .join('')
        .toUpperCase()

    return (
        <header className="relative z-20 flex h-16 items-center border-b border-clinic-line bg-white px-4 sm:px-6">
            <div
                className={`relative flex h-full shrink-0 items-center border-r border-clinic-line transition-[width] duration-300 ease-in-out ${
                    isSidebarCollapsed
                        ? 'w-[48px] justify-center md:justify-start'
                        : 'w-[196px] gap-2 pr-4'
                }`}>
                <Image
                    src="/logo/pure_pearl.svg"
                    alt=""
                    width={26}
                    height={26}
                    className="shrink-0 object-contain"
                />
                <span
                    className={`overflow-hidden whitespace-nowrap text-sm font-extrabold text-clinic-ink transition-[max-width,opacity] duration-300 ${
                        isSidebarCollapsed
                            ? 'max-w-0 opacity-0'
                            : 'max-w-36 opacity-100'
                    }`}>
                    Pure Pearl
                </span>
                <button
                    type="button"
                    aria-label={
                        isSidebarCollapsed
                            ? 'Expand navigation sidebar'
                            : 'Collapse navigation sidebar'
                    }
                    title={
                        isSidebarCollapsed
                            ? 'Expand navigation sidebar'
                            : 'Collapse navigation sidebar'
                    }
                    className="absolute right-0 top-1/2 z-10 flex h-8 w-8 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-clinic-line bg-white text-clinic-muted shadow-sm transition-colors hover:bg-clinic-canvas hover:text-clinic-blue"
                    onClick={onToggleSidebar}>
                    {isSidebarCollapsed ? (
                        <FiChevronRight />
                    ) : (
                        <FiChevronLeft />
                    )}
                </button>
            </div>

            <div className="flex min-w-0 flex-1 items-center pl-5 sm:pl-6">
                <h1 className="min-w-0 truncate text-lg font-bold text-clinic-ink capitalize">
                    {currentTab === 'user_management'
                        ? 'User & Role Management'
                        : formatModuleLabel(currentTab)}
                </h1>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                {currentTab === 'patient_list' && (
                    <>
                        <div className="hidden sm:block">
                            <Searchbar
                                value={patientSearch}
                                placeholder="Search patients..."
                                onChange={onPatientSearchChange}
                                onClear={onPatientSearchClear}
                            />
                        </div>
                        <ActionButton
                            action="add"
                            onClick={onAddPatient}
                            containerStyles="rounded-full"
                        />
                    </>
                )}
                <div className="relative">
                    <button
                        type="button"
                        aria-expanded={isAccountMenuOpen}
                        aria-haspopup="menu"
                        aria-label="Account menu"
                        className="flex items-center gap-2 rounded-full p-1.5 text-left transition-colors hover:bg-clinic-canvas sm:gap-3"
                        onClick={() =>
                            setIsAccountMenuOpen(isOpen => !isOpen)
                        }>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clinic-sky text-xs font-bold text-clinic-blue">
                            {initials || 'A'}
                        </span>
                        <span className="hidden min-w-0 sm:block">
                            <span className="block max-w-36 truncate text-xs font-bold text-clinic-ink">
                                {displayName}
                            </span>
                            <span className="block max-w-36 truncate text-[11px] capitalize text-clinic-muted">
                                {getRoleLabel(user)}
                            </span>
                        </span>
                        <FiChevronDown className="hidden text-clinic-muted sm:block" />
                    </button>
                    {isAccountMenuOpen && (
                        <div
                            role="menu"
                            className="absolute right-0 top-full mt-2 w-56 rounded-md border border-clinic-line bg-white p-2 shadow-clinic">
                            {displayEmail && (
                                <p className="truncate px-3 py-2 text-xs text-clinic-muted">
                                    {displayEmail}
                                </p>
                            )}
                            <button
                                type="button"
                                role="menuitem"
                                disabled={isLoggingOut}
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-clinic-ink hover:bg-clinic-canvas disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={onLogout}>
                                <FiLogOut />
                                {isLoggingOut ? 'Logging out...' : 'Log out'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}

export default WorkspaceHeader
