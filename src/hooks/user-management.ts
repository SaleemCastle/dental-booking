import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, normalizeAxiosError } from '../lib/api'
import { canManageUsers } from '../lib/permissions'
import { adminRemovalError } from '../lib/user-management'
import {
    getManagedUsers,
    getManagedRoles,
    getRolePermissions,
    ManagedUser,
    ManagedRole,
    RolePermission,
    updateUserRoles,
    updateRolePermissions,
} from '../services/user-management'

export const useUserManagement = () => {
    const { user, status, refreshSession, clearSession } = useAuthSession()
    const [deniedFor, setDeniedFor] = useState<typeof user>(null)
    const enabled =
        status === 'authenticated' && canManageUsers(user) && deniedFor !== user
    const [revision, setRevision] = useState(0)
    const [result, setResult] = useState<{
        owner: typeof user
        users: ManagedUser[]
        roles: ManagedRole[]
        permissions: RolePermission[]
    } | null>(null)
    const [error, setError] = useState<ApiError | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [success, setSuccess] = useState('')
    const active = useRef({ user, enabled, mounted: true })
    active.current = { ...active.current, user, enabled }
    const mutationLock = useRef(false)
    useEffect(() => {
        active.current.mounted = true
        return () => {
            active.current.mounted = false
        }
    }, [])
    const handleError = useCallback(
        (failure: ApiError) => {
            if (failure.statusCode === 401 || failure.statusCode === 403) {
                setError(failure)
                setDeniedFor(user)
                setResult(null)
                if (failure.statusCode === 401)
                    void clearSession().catch(() => undefined)
                else void refreshSession().catch(() => undefined)
            }
        },
        [user, clearSession, refreshSession],
    )
    useEffect(() => {
        setError(null)
        setResult(null)
    }, [user])
    useEffect(() => {
        setSuccess('')
    }, [user?.id])
    useEffect(() => {
        if (!enabled) return
        const controller = new AbortController()
        const current = () =>
            !controller.signal.aborted &&
            active.current.enabled &&
            active.current.user === user
        setLoading(true)
        setError(null)
        void Promise.all([
            getManagedUsers(user, controller.signal),
            getManagedRoles(user, controller.signal),
            getRolePermissions(user, controller.signal),
        ])
            .then(([users, roles, permissions]) => {
                if (current())
                    setResult({ owner: user, users, roles, permissions })
            })
            .catch(error => {
                if (!current()) return
                const failure = normalizeAxiosError(error)
                setResult(null)
                setError(failure)
                handleError(failure)
            })
            .finally(() => {
                if (current()) setLoading(false)
            })
        return () => controller.abort()
    }, [user, enabled, revision, handleError])
    const visible = enabled && result?.owner === user ? result : null
    const mutate = async (
        operation: () => Promise<void>,
        message: string,
        refreshAuth: boolean,
    ) => {
        if (!enabled || mutationLock.current) return false
        mutationLock.current = true
        setSaving(true)
        setSuccess('')
        const current = () =>
            active.current.mounted &&
            active.current.enabled &&
            active.current.user === user
        try {
            await operation()
            if (!current()) return false
            if (refreshAuth) {
                // Revalidate /api/user before the next protected action. If that
                // fails after a successful write, fail closed until re-login.
                try {
                    const refreshed = await refreshSession()
                    if (refreshed && String(refreshed.id) === String(user?.id))
                        setSuccess(message)
                } catch {
                    await clearSession()
                }
            } else setSuccess(message)
            return true
        } catch (error) {
            const failure = normalizeAxiosError(error)
            if (current()) handleError(failure)
            throw failure
        } finally {
            mutationLock.current = false
            if (active.current.mounted) setSaving(false)
        }
    }
    return {
        user,
        enabled,
        loading: enabled && (loading || (!visible && !error)),
        saving,
        users: visible?.users ?? [],
        roles: visible?.roles ?? [],
        permissions: visible?.permissions ?? [],
        error,
        success,
        handleError,
        refresh: () => {
            if (!saving) {
                setSuccess('')
                setRevision(value => value + 1)
            }
        },
        saveUser: (target: ManagedUser, ids: number[]) =>
            mutate(
                async () => {
                    const blocked = adminRemovalError(
                        target,
                        ids,
                        visible?.roles ?? [],
                        visible?.users ?? [],
                    )
                    if (blocked) throw new Error(blocked)
                    const updated = await updateUserRoles(user, target.id, ids)
                    if (
                        active.current.mounted &&
                        active.current.user === user &&
                        active.current.enabled
                    )
                        setResult(current =>
                            current?.owner === user
                                ? {
                                      ...current,
                                      users: current.users.map(item =>
                                          item.id === updated.id
                                              ? updated
                                              : item,
                                      ),
                                  }
                                : current,
                        )
                },
                `Roles updated for ${target.name}.`,
                String(target.id) === String(user?.id),
            ),
        savePermissions: (role: ManagedRole, ids: number[]) =>
            mutate(
                async () => {
                    const updated = await updateRolePermissions(
                        user,
                        role.id,
                        ids,
                    )
                    if (
                        active.current.mounted &&
                        active.current.user === user &&
                        active.current.enabled
                    )
                        setResult(current =>
                            current?.owner === user
                                ? {
                                      ...current,
                                      roles: current.roles.map(item =>
                                          item.id === updated.id
                                              ? updated
                                              : item,
                                      ),
                                      users: current.users.map(item => ({
                                          ...item,
                                          roles: item.roles.map(assigned =>
                                              assigned.id === updated.id
                                                  ? updated
                                                  : assigned,
                                          ),
                                      })),
                                  }
                                : current,
                        )
                },
                `Permissions updated for ${role.name}.`,
                true,
            ),
    }
}
