import React, { ReactNode, useEffect, useRef, useState } from 'react'
import { Dialog } from '@headlessui/react'
import { FiRefreshCw, FiShield, FiUsers, FiX } from 'react-icons/fi'
import { ApiError, normalizeAxiosError } from '../lib/api'
import { useUserManagement } from '../hooks/user-management'
import {
    adminRemovalError,
    filterManagedUsers,
    sameAssignments,
    userStatus,
} from '../lib/user-management'
import {
    getManagedUser,
    ManagedRole,
    ManagedUser,
    RolePermission,
} from '../services/user-management'
import type { AuthUser } from '../lib/auth-session'

const buttonClass =
    'rounded-md border border-clinic-line bg-white px-3 py-2 text-sm font-semibold text-clinic-ink hover:border-clinic-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-blue disabled:cursor-not-allowed disabled:opacity-50'
const primaryClass = `${buttonClass} border-clinic-blue bg-clinic-blue text-white hover:bg-blue-700`
const inputClass =
    'mt-1 block w-full rounded-md border-clinic-line text-sm focus:border-clinic-blue focus:ring-clinic-blue/20'

const ApiNotice = ({ error }: { error: ApiError }) => (
    <div
        role="alert"
        className="rounded-md border border-rose-200 bg-clinic-rose p-3 text-sm text-rose-900">
        <p>{error.message}</p>
        {Object.entries(error.errors).map(([field, messages]) => (
            <p key={field}>
                {field}: {messages.join(' ')}
            </p>
        ))}
        {error.code && <p className="mt-1 text-xs">Code: {error.code}</p>}
        {error.requestId && (
            <p className="mt-1 break-all text-xs">Request: {error.requestId}</p>
        )}
    </div>
)

const ManagementDialog = ({
    title,
    busy,
    onClose,
    children,
}: {
    title: string
    busy: boolean
    onClose: () => void
    children: ReactNode
}) => (
    <Dialog
        open
        onClose={() => {
            if (!busy) onClose()
        }}
        className="fixed inset-0 z-50 overflow-y-auto">
        <Dialog.Overlay className="fixed inset-0 bg-clinic-ink/45" />
        <div className="relative mx-auto my-6 w-[calc(100%-2rem)] max-w-3xl rounded-md bg-white shadow-clinic">
            <div className="flex items-center justify-between gap-4 border-b border-clinic-line p-5">
                <Dialog.Title className="text-lg font-extrabold text-clinic-ink">
                    {title}
                </Dialog.Title>
                <button
                    type="button"
                    aria-label="Close role editor"
                    className={buttonClass}
                    disabled={busy}
                    onClick={onClose}>
                    <FiX />
                </button>
            </div>
            {children}
        </div>
    </Dialog>
)

const ChangeReview = ({
    before,
    after,
    warning,
}: {
    before: string[]
    after: string[]
    warning: string
}) => (
    <div className="space-y-3 rounded-md bg-clinic-canvas p-4 text-sm">
        <p className="font-semibold">{warning}</p>
        <p>
            <strong>Current:</strong> {before.join(', ') || 'None'}
        </p>
        <p>
            <strong>New:</strong> {after.join(', ') || 'None'}
        </p>
        <p>The change takes effect immediately after confirmation.</p>
    </div>
)

const UserRoleEditor = ({
    actor,
    id,
    roles,
    users,
    busy,
    onSave,
    onClose,
    onError,
}: {
    actor: AuthUser
    id: number
    roles: ManagedRole[]
    users: ManagedUser[]
    busy: boolean
    onSave: (target: ManagedUser, ids: number[]) => Promise<boolean>
    onClose: () => void
    onError: (error: ApiError) => void
}) => {
    const [target, setTarget] = useState<ManagedUser | null>(null)
    const [ids, setIds] = useState<number[]>([])
    const [error, setError] = useState<ApiError | null>(null)
    const [loading, setLoading] = useState(true)
    const [revision, setRevision] = useState(0)
    const [review, setReview] = useState(false)
    const mounted = useRef(true)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])
    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError(null)
        void getManagedUser(actor, id, controller.signal)
            .then(user => {
                if (!controller.signal.aborted) {
                    setTarget(user)
                    setIds(user.roles.map(role => role.id))
                }
            })
            .catch(error => {
                if (controller.signal.aborted) return
                const failure = normalizeAxiosError(error)
                setError(failure)
                onError(failure)
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false)
            })
        return () => controller.abort()
    }, [actor, id, revision, onError])
    const available = [
        ...roles,
        ...(target?.roles ?? []).filter(
            role => !roles.some(item => item.id === role.id),
        ),
    ]
    const blocked = target
        ? adminRemovalError(target, ids, available, users)
        : ''
    const changed =
        target &&
        !sameAssignments(
            target.roles.map(role => role.id),
            ids,
        )
    const save = async () => {
        if (!target || !review || blocked || !changed || busy) return
        setError(null)
        try {
            if (await onSave(target, ids)) onClose()
        } catch (error) {
            if (mounted.current) {
                setError(normalizeAxiosError(error))
                setReview(false)
            }
        }
    }
    return (
        <ManagementDialog
            title={review ? 'Confirm role changes' : 'User details & roles'}
            busy={busy}
            onClose={onClose}>
            <div className="space-y-4 p-5">
                {loading && <p role="status">Loading current user roles...</p>}
                {error && <ApiNotice error={error} />}
                {!loading && !target && (
                    <button
                        className={buttonClass}
                        onClick={() => setRevision(value => value + 1)}>
                        Retry user details
                    </button>
                )}
                {!loading && target && (
                    <>
                        <div className="break-words">
                            <h3 className="font-bold">{target.name}</h3>
                            <p className="text-sm text-clinic-muted">
                                {target.email} · {userStatus(target)}
                            </p>
                        </div>
                        {review ? (
                            <ChangeReview
                                before={target.roles.map(role => role.name)}
                                after={available
                                    .filter(role => ids.includes(role.id))
                                    .map(role => role.name)}
                                warning={
                                    String(actor.id) === String(target.id)
                                        ? 'You are changing your own access. Removing admin will close management access.'
                                        : 'Review this user’s access before applying the change.'
                                }
                            />
                        ) : (
                            <fieldset disabled={busy}>
                                <legend className="mb-2 text-sm font-semibold">
                                    Assigned roles
                                </legend>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {available.map(role => {
                                        const protectedAdmin =
                                            role.slug === 'admin' &&
                                            target.roles.some(
                                                item => item.slug === 'admin',
                                            ) &&
                                            Boolean(
                                                adminRemovalError(
                                                    target,
                                                    ids.filter(
                                                        id => id !== role.id,
                                                    ),
                                                    available,
                                                    users,
                                                ),
                                            )
                                        const disabled =
                                            role.assignable === false ||
                                            protectedAdmin ||
                                            !roles.some(
                                                item => item.id === role.id,
                                            )
                                        return (
                                            <label
                                                key={role.id}
                                                className="flex items-start gap-3 rounded-md border border-clinic-line p-3 text-sm">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 rounded text-clinic-blue focus:ring-clinic-blue"
                                                    checked={ids.includes(
                                                        role.id,
                                                    )}
                                                    disabled={disabled}
                                                    onChange={event => {
                                                        setIds(current =>
                                                            event.target.checked
                                                                ? [
                                                                      ...current,
                                                                      role.id,
                                                                  ]
                                                                : current.filter(
                                                                      id =>
                                                                          id !==
                                                                          role.id,
                                                                  ),
                                                        )
                                                        setError(null)
                                                    }}
                                                />
                                                <span>
                                                    <span className="block font-semibold">
                                                        {role.name}
                                                    </span>
                                                    <span className="text-clinic-muted">
                                                        {protectedAdmin
                                                            ? 'Required or last administrator'
                                                            : disabled
                                                            ? 'Assignment is restricted'
                                                            : role.description ||
                                                              role.slug}
                                                    </span>
                                                </span>
                                            </label>
                                        )
                                    })}
                                </div>
                            </fieldset>
                        )}
                        {blocked && (
                            <p role="alert" className="text-sm text-rose-700">
                                {blocked}
                            </p>
                        )}
                        {!ids.length && (
                            <p className="text-sm text-amber-800">
                                This user will have no roles.
                            </p>
                        )}
                        <div className="flex flex-wrap justify-end gap-2 border-t border-clinic-line pt-4">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy}
                                onClick={
                                    review ? () => setReview(false) : onClose
                                }>
                                {review ? 'Back to editing' : 'Cancel'}
                            </button>
                            <button
                                type="button"
                                className={primaryClass}
                                disabled={busy || !changed || Boolean(blocked)}
                                onClick={
                                    review
                                        ? () => void save()
                                        : () => setReview(true)
                                }>
                                {busy
                                    ? 'Saving roles...'
                                    : review
                                    ? 'Confirm role changes'
                                    : 'Review role changes'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </ManagementDialog>
    )
}

const PermissionEditor = ({
    role,
    permissions,
    busy,
    onSave,
    onClose,
}: {
    role: ManagedRole
    permissions: RolePermission[]
    busy: boolean
    onSave: (role: ManagedRole, ids: number[]) => Promise<boolean>
    onClose: () => void
}) => {
    const [ids, setIds] = useState(() =>
        role.permissions.map(permission => permission.id),
    )
    const [review, setReview] = useState(false)
    const [error, setError] = useState<ApiError | null>(null)
    const [announcement, setAnnouncement] = useState('')
    const [search, setSearch] = useState('')
    const mounted = useRef(true)
    const movedId = useRef<number | null>(null)
    const permissionButtons = useRef<Record<number, HTMLButtonElement>>({})
    useEffect(
        () => () => {
            mounted.current = false
        },
        [],
    )
    useEffect(() => {
        if (movedId.current !== null) {
            permissionButtons.current[movedId.current]?.focus()
            movedId.current = null
        }
    }, [ids])
    const catalog = [
        ...permissions,
        ...role.permissions.filter(
            item => !permissions.some(permission => permission.id === item.id),
        ),
    ]
    const changed = !sameAssignments(
        role.permissions.map(permission => permission.id),
        ids,
    )
    const move = (id: number, assigned: boolean) => {
        const permission = catalog.find(item => item.id === id)
        if (busy || review || !permission) return
        movedId.current = id
        setIds(current =>
            assigned
                ? Array.from(new Set([...current, id]))
                : current.filter(item => item !== id),
        )
        setAnnouncement(
            `${permission.name} ${assigned ? 'assigned to' : 'removed from'} ${
                role.name
            }.`,
        )
        setError(null)
    }
    const drop = (event: React.DragEvent, assigned: boolean) => {
        event.preventDefault()
        const value = event.dataTransfer.getData(
            'application/x-dental-permission',
        )
        if (/^[1-9]\d*$/.test(value)) move(Number(value), assigned)
    }
    const save = async () => {
        if (busy || !review || !changed) return
        setError(null)
        try {
            if (await onSave(role, ids)) onClose()
        } catch (error) {
            if (mounted.current) {
                setError(normalizeAxiosError(error))
                setReview(false)
            }
        }
    }
    return (
        <ManagementDialog
            title={
                review
                    ? 'Confirm permission changes'
                    : `Permissions for ${role.name}`
            }
            busy={busy}
            onClose={onClose}>
            <div className="space-y-4 p-5">
                {error && <ApiNotice error={error} />}
                {review ? (
                    <ChangeReview
                        before={role.permissions.map(item => item.slug)}
                        after={catalog
                            .filter(item => ids.includes(item.id))
                            .map(item => item.slug)}
                        warning={`This changes access for every user with the ${role.name} role.`}
                    />
                ) : (
                    <>
                        <p
                            className="text-sm text-clinic-muted"
                            id="permission-help">
                            Drag permissions between lists, or use each
                            permission’s Add or Remove button with the keyboard
                            or touch.
                        </p>
                        <label className="block text-sm font-semibold">
                            Search permissions
                            <input
                                className={inputClass}
                                value={search}
                                onChange={event =>
                                    setSearch(event.target.value)
                                }
                            />
                        </label>
                        <div
                            className="grid gap-4 sm:grid-cols-2"
                            aria-describedby="permission-help">
                            {[false, true].map(assigned => {
                                const items = catalog.filter(
                                    item =>
                                        ids.includes(item.id) === assigned &&
                                        `${item.name} ${item.slug}`
                                            .toLowerCase()
                                            .includes(
                                                search.trim().toLowerCase(),
                                            ),
                                )
                                return (
                                    <section
                                        key={String(assigned)}
                                        aria-label={
                                            assigned
                                                ? 'Assigned permissions'
                                                : 'Available permissions'
                                        }
                                        onDragOver={event => {
                                            event.preventDefault()
                                            event.dataTransfer.dropEffect =
                                                'move'
                                        }}
                                        onDrop={event => drop(event, assigned)}
                                        className={`min-h-[180px] rounded-md border-2 border-dashed p-3 ${
                                            assigned
                                                ? 'border-blue-200 bg-clinic-sky'
                                                : 'border-clinic-line bg-clinic-canvas'
                                        }`}>
                                        <h3 className="mb-3 text-sm font-bold">
                                            {assigned
                                                ? 'Assigned'
                                                : 'Available'}{' '}
                                            (
                                            {
                                                catalog.filter(
                                                    item =>
                                                        ids.includes(
                                                            item.id,
                                                        ) === assigned,
                                                ).length
                                            }
                                            )
                                        </h3>
                                        <ul className="max-h-72 space-y-2 overflow-y-auto">
                                            {items.map(item => (
                                                <li key={item.id}>
                                                    <button
                                                        ref={element => {
                                                            if (element)
                                                                permissionButtons.current[
                                                                    item.id
                                                                ] = element
                                                        }}
                                                        type="button"
                                                        draggable={!busy}
                                                        disabled={busy}
                                                        onDragStart={event => {
                                                            event.dataTransfer.setData(
                                                                'application/x-dental-permission',
                                                                String(item.id),
                                                            )
                                                            event.dataTransfer.effectAllowed =
                                                                'move'
                                                        }}
                                                        onClick={() =>
                                                            move(
                                                                item.id,
                                                                !assigned,
                                                            )
                                                        }
                                                        aria-label={`${
                                                            assigned
                                                                ? 'Remove'
                                                                : 'Add'
                                                        } ${item.slug}`}
                                                        className={`${buttonClass} flex w-full items-center justify-between gap-2 text-left`}>
                                                        <span className="min-w-0 break-words">
                                                            <span className="block">
                                                                {item.name}
                                                            </span>
                                                            <span className="block text-xs text-clinic-muted">
                                                                {item.slug}
                                                            </span>
                                                        </span>
                                                        <span className="text-xs text-clinic-blue">
                                                            {assigned
                                                                ? 'Remove'
                                                                : 'Add'}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                        {!items.length && (
                                            <p className="text-sm text-clinic-muted">
                                                {search
                                                    ? 'No matching permissions.'
                                                    : assigned
                                                    ? 'No permissions assigned.'
                                                    : 'No permissions available.'}
                                            </p>
                                        )}
                                    </section>
                                )
                            })}
                        </div>
                        <p role="status" className="sr-only">
                            {announcement}
                        </p>
                    </>
                )}
                {!ids.length && (
                    <p className="text-sm text-amber-800">
                        This role will have no permissions.
                    </p>
                )}
                <div className="flex flex-wrap justify-end gap-2 border-t border-clinic-line pt-4">
                    <button
                        className={buttonClass}
                        disabled={busy}
                        onClick={review ? () => setReview(false) : onClose}>
                        {review ? 'Back to editing' : 'Cancel'}
                    </button>
                    <button
                        className={primaryClass}
                        disabled={busy || !changed}
                        onClick={
                            review ? () => void save() : () => setReview(true)
                        }>
                        {busy
                            ? 'Saving permissions...'
                            : review
                            ? 'Confirm permission changes'
                            : 'Review permission changes'}
                    </button>
                </div>
            </div>
        </ManagementDialog>
    )
}

const UserRoleManagement = () => {
    const management = useUserManagement()
    const {
        user,
        enabled,
        users,
        roles,
        permissions,
        loading,
        saving,
        error,
        success,
    } = management
    const [view, setView] = useState<'users' | 'roles'>('users')
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selection, setSelection] = useState<{
        owner: AuthUser
        userId?: number
        roleId?: number
    } | null>(null)
    useEffect(() => {
        setSelection(null)
        setSearch('')
        setRoleFilter('')
        setStatusFilter('')
    }, [user, enabled])
    if (!enabled)
        return (
            <section aria-label="User & Role Management" className="p-6">
                {error && <ApiNotice error={error} />}
                <p role="alert">
                    User and role management is available to administrators
                    only.
                </p>
            </section>
        )
    const filtered = filterManagedUsers(users, search, roleFilter, statusFilter)
    const selectedRole =
        selection?.owner === user
            ? roles.find(item => item.id === selection.roleId)
            : undefined
    return (
        <section
            aria-label="User & Role Management"
            className="space-y-5 p-4 text-clinic-ink sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold">
                        User & Role Management
                    </h1>
                    <p className="mt-1 text-sm text-clinic-muted">
                        Manage clinic access and the permissions each role
                        grants.
                    </p>
                </div>
                <button
                    className={buttonClass}
                    disabled={loading || saving}
                    onClick={management.refresh}>
                    <FiRefreshCw className="mr-2 inline" />
                    Refresh users and roles
                </button>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Management views">
                <button
                    className={view === 'users' ? primaryClass : buttonClass}
                    aria-pressed={view === 'users'}
                    onClick={() => setView('users')}>
                    <FiUsers className="mr-2 inline" />
                    Users ({users.length})
                </button>
                <button
                    className={view === 'roles' ? primaryClass : buttonClass}
                    aria-pressed={view === 'roles'}
                    onClick={() => setView('roles')}>
                    <FiShield className="mr-2 inline" />
                    Roles & permissions ({roles.length})
                </button>
            </div>
            {success && (
                <p
                    role="status"
                    className="rounded-md bg-clinic-mint p-3 text-sm text-emerald-900">
                    {success}
                </p>
            )}
            {error && (
                <div className="space-y-3">
                    <ApiNotice error={error} />
                    <button
                        className={buttonClass}
                        onClick={management.refresh}>
                        Retry management data
                    </button>
                </div>
            )}
            {loading && (
                <p role="status">Loading users, roles and permissions...</p>
            )}
            {!loading && !error && view === 'users' && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="text-sm font-semibold sm:col-span-2">
                            Search users
                            <input
                                type="search"
                                maxLength={255}
                                placeholder="Name or email"
                                className={inputClass}
                                value={search}
                                onChange={event =>
                                    setSearch(event.target.value)
                                }
                            />
                        </label>
                        <label className="text-sm font-semibold">
                            Role
                            <select
                                className={inputClass}
                                value={roleFilter}
                                onChange={event =>
                                    setRoleFilter(event.target.value)
                                }>
                                <option value="">All roles</option>
                                {roles.map(role => (
                                    <option key={role.id} value={role.slug}>
                                        {role.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm font-semibold">
                            Status
                            <select
                                className={inputClass}
                                value={statusFilter}
                                onChange={event =>
                                    setStatusFilter(event.target.value)
                                }>
                                <option value="">All statuses</option>
                                {Array.from(new Set(users.map(userStatus)))
                                    .sort()
                                    .map(status => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                            </select>
                        </label>
                    </div>
                    {(search || roleFilter || statusFilter) && (
                        <button
                            className={buttonClass}
                            onClick={() => {
                                setSearch('')
                                setRoleFilter('')
                                setStatusFilter('')
                            }}>
                            Clear user filters
                        </button>
                    )}
                    {!filtered.length ? (
                        <p
                            role="status"
                            className="rounded-md border border-clinic-line bg-white p-6 text-sm text-clinic-muted">
                            {users.length
                                ? 'No users match these filters.'
                                : 'No application users found.'}
                        </p>
                    ) : (
                        <div
                            className="overflow-x-auto rounded-md border border-clinic-line bg-white"
                            role="region"
                            aria-label="Application users"
                            tabIndex={0}>
                            <table className="w-full min-w-[620px] text-left text-sm">
                                <caption className="sr-only">
                                    Application users, their current roles and
                                    status
                                </caption>
                                <thead className="bg-clinic-canvas text-xs uppercase text-clinic-muted">
                                    <tr>
                                        {[
                                            'Name / email',
                                            'Current roles',
                                            'Status',
                                            'Actions',
                                        ].map(label => (
                                            <th
                                                key={label}
                                                scope="col"
                                                className="p-4">
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(target => (
                                        <tr
                                            key={target.id}
                                            className="border-t border-clinic-line">
                                            <td className="p-4">
                                                <span className="block font-semibold">
                                                    {target.name}
                                                </span>
                                                <span className="text-clinic-muted">
                                                    {target.email}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {target.roles.length ? (
                                                        target.roles.map(
                                                            role => (
                                                                <span
                                                                    key={
                                                                        role.id
                                                                    }
                                                                    className="rounded bg-clinic-sky px-2 py-1 text-xs font-semibold text-clinic-blue">
                                                                    {role.name}
                                                                </span>
                                                            ),
                                                        )
                                                    ) : (
                                                        <span className="text-clinic-muted">
                                                            No roles
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span
                                                    className={`rounded px-2 py-1 text-xs ${
                                                        target.email_verified_at
                                                            ? 'bg-clinic-mint'
                                                            : 'bg-clinic-amber'
                                                    }`}>
                                                    {userStatus(target)}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <button
                                                    className={buttonClass}
                                                    disabled={saving}
                                                    aria-label={`Manage roles for ${target.email}`}
                                                    onClick={() =>
                                                        setSelection({
                                                            owner: user,
                                                            userId: target.id,
                                                        })
                                                    }>
                                                    Manage roles
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-xs text-clinic-muted">
                        {filtered.length} of {users.length} users. When account
                        status is unavailable, email verification is shown.
                    </p>
                </>
            )}
            {!loading && !error && view === 'roles' && (
                <>
                    <p className="text-sm text-clinic-muted">
                        Changes to a role’s permissions apply to every user
                        assigned that role.
                    </p>
                    {!roles.length && (
                        <p role="status">
                            No roles available. Contact your administrator to
                            configure clinic roles.
                        </p>
                    )}
                    <div className="grid gap-4 lg:grid-cols-2">
                        {roles.map(role => (
                            <article
                                key={role.id}
                                className="rounded-md border border-clinic-line bg-white p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="font-bold">
                                            {role.name}
                                        </h2>
                                        <p className="text-xs text-clinic-muted">
                                            {role.slug}
                                            {role.is_system
                                                ? ' · System role'
                                                : ''}
                                        </p>
                                    </div>
                                    <button
                                        className={buttonClass}
                                        disabled={saving}
                                        aria-label={`Edit permissions for ${role.slug}`}
                                        onClick={() =>
                                            setSelection({
                                                owner: user,
                                                roleId: role.id,
                                            })
                                        }>
                                        Edit permissions
                                    </button>
                                </div>
                                {role.description && (
                                    <p className="mt-3 text-sm text-clinic-muted">
                                        {role.description}
                                    </p>
                                )}
                                <p className="mt-3 text-sm">
                                    {role.permissions.length} permissions ·{' '}
                                    {
                                        users.filter(target =>
                                            target.roles.some(
                                                item => item.id === role.id,
                                            ),
                                        ).length
                                    }{' '}
                                    users
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {role.permissions.map(permission => (
                                        <span
                                            key={permission.id}
                                            className="break-all rounded bg-clinic-canvas px-2 py-1 text-xs text-clinic-muted">
                                            {permission.slug}
                                        </span>
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            )}
            {selection?.owner === user && selection.userId !== undefined && (
                <UserRoleEditor
                    actor={user}
                    id={selection.userId}
                    roles={roles}
                    users={users}
                    busy={saving}
                    onSave={management.saveUser}
                    onClose={() => setSelection(null)}
                    onError={management.handleError}
                />
            )}
            {selectedRole && (
                <PermissionEditor
                    key={selectedRole.id}
                    role={selectedRole}
                    permissions={permissions}
                    busy={saving}
                    onSave={management.savePermissions}
                    onClose={() => setSelection(null)}
                />
            )}
        </section>
    )
}

export default UserRoleManagement
