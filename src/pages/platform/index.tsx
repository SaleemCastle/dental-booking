import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useAuth } from '../../hooks/auth'
import { ApiError, normalizeAxiosError } from '../../lib/api'
import {
    getPlatformTenant,
    listPlatformTenants,
    setPlatformTenantStatus,
    TenantProfile,
} from '../../services/platform-tenants'
import TenantProvisioningForm from '../../components/TenantProvisioningForm'
import TenantProfileDetails from '../../components/TenantProfileDetails'

export default function PlatformTenants() {
    const router = useRouter()
    const { status, error: sessionError, refreshSession, logout } = useAuth()
    const [page, setPage] = useState(1)
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [confirmation, setConfirmation] = useState<
        TenantProfile['status'] | null
    >(null)
    const [busy, setBusy] = useState(false)
    const [blocked, setBlocked] = useState(false)
    const [message, setMessage] = useState('')
    const [actionError, setActionError] = useState<ApiError | null>(null)
    const inFlight = useRef(false)
    const list = useSWR(
        status === 'authenticated' ? ['platform:tenants', page] : null,
        () => listPlatformTenants(page),
        { shouldRetryOnError: false },
    )
    // Stale results never authorize platform controls after a failed revalidation.
    const authorized =
        status === 'authenticated' &&
        Boolean(list.data) &&
        !list.error &&
        !blocked
    const detail = useSWR(
        authorized && selectedId ? ['platform:tenant', selectedId] : null,
        () => getPlatformTenant(selectedId),
        { shouldRetryOnError: false },
    )
    useEffect(() => {
        if (status === 'unauthenticated') void router.replace('/platform/login')
    }, [status, router])
    useEffect(() => {
        if (
            detail.error?.statusCode === 403 ||
            detail.error?.statusCode === 401
        )
            setBlocked(true)
    }, [detail.error])
    const retry = async () => {
        setActionError(null)
        if (status === 'error') {
            await refreshSession().catch(() => undefined)
            return
        }
        try {
            await list.mutate()
            setBlocked(false)
        } catch {
            /* SWR displays the normalized error. */
        }
    }
    const changeStatus = async () => {
        if (!authorized || !selectedId || !confirmation || inFlight.current)
            return
        inFlight.current = true
        setBusy(true)
        setActionError(null)
        setMessage('')
        try {
            const tenant = await setPlatformTenantStatus(
                selectedId,
                confirmation,
            )
            await detail.mutate(tenant, false)
            setConfirmation(null)
            setMessage(`${tenant.name} is ${tenant.status}.`)
            await list.mutate()
        } catch (caught) {
            const error = normalizeAxiosError(caught)
            setActionError(error)
            if (error.statusCode === 401 || error.statusCode === 403)
                setBlocked(true)
        } finally {
            inFlight.current = false
            setBusy(false)
        }
    }
    const accessError = sessionError || list.error
    const lastPage = Number(
        list.data?.meta.lastPage ?? list.data?.meta.last_page,
    )
    return (
        <>
            <Head>
                <title>Platform clinics | Pure Pearl</title>
            </Head>
            <main className="min-h-screen bg-clinic-canvas p-4 text-clinic-ink sm:p-8">
                <div className="mx-auto max-w-6xl space-y-6">
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-sm text-clinic-muted">
                                Platform operations
                            </p>
                            <h1 className="text-2xl font-bold">
                                Clinic tenants
                            </h1>
                        </div>
                        <button
                            type="button"
                            onClick={() => void logout()}
                            className="rounded-md border border-clinic-line bg-white px-4 py-2">
                            Sign out
                        </button>
                    </header>
                    <p className="text-sm text-clinic-muted">
                        Each tenant represents one clinic. Platform access does
                        not grant access to clinic records.
                    </p>
                    {message && (
                        <p
                            role="status"
                            className="rounded-lg bg-green-100 p-4 text-green-900">
                            {message}
                        </p>
                    )}
                    {actionError && (
                        <div role="alert" className="text-rose-700">
                            <p>{actionError.message}</p>
                            {Object.entries(actionError.errors).map(
                                ([field, messages]) => (
                                    <p key={field}>
                                        {field}: {messages.join(' ')}
                                    </p>
                                ),
                            )}
                            {actionError.requestId && (
                                <p>Request ID: {actionError.requestId}</p>
                            )}
                        </div>
                    )}
                    {!authorized ? (
                        <section className="rounded-xl border border-clinic-line bg-white p-6">
                            {accessError || blocked ? (
                                <>
                                    <h2 className="font-bold">
                                        Platform access unavailable
                                    </h2>
                                    <p role="alert" className="my-3">
                                        {accessError?.statusCode === 403 ||
                                        blocked
                                            ? 'An active platform operator grant is required.'
                                            : accessError?.message}
                                    </p>
                                    {accessError?.requestId && (
                                        <p>
                                            Request ID: {accessError.requestId}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => void retry()}
                                        className="rounded-md border border-clinic-line px-4 py-2">
                                        Retry access check
                                    </button>
                                </>
                            ) : (
                                <p role="status">
                                    {status === 'unauthenticated'
                                        ? 'Redirecting to operator sign in…'
                                        : 'Verifying platform access…'}
                                </p>
                            )}
                        </section>
                    ) : (
                        <>
                            <section className="rounded-xl border border-clinic-line bg-white p-5">
                                <h2 className="mb-4 text-xl font-bold">
                                    All clinics
                                </h2>
                                {!list.data.tenants.length ? (
                                    <p>No clinics found.</p>
                                ) : (
                                    <ul className="divide-y divide-clinic-line">
                                        {list.data.tenants.map(tenant => (
                                            <li key={tenant.id}>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        setSelectedId(tenant.id)
                                                        setConfirmation(null)
                                                        setActionError(null)
                                                    }}
                                                    className="flex w-full flex-wrap items-center justify-between gap-2 py-4 text-left"
                                                    aria-pressed={
                                                        selectedId === tenant.id
                                                    }>
                                                    <span>
                                                        <span className="font-semibold">
                                                            {tenant.name}
                                                        </span>
                                                        <span className="ml-2 text-sm text-clinic-muted">
                                                            #{tenant.id} ·{' '}
                                                            {tenant.slug}
                                                        </span>
                                                    </span>
                                                    <span
                                                        className={`rounded-full px-3 py-1 text-sm ${
                                                            tenant.active
                                                                ? 'bg-green-100 text-green-800'
                                                                : 'bg-amber-100 text-amber-900'
                                                        }`}>
                                                        {tenant.active
                                                            ? 'Active'
                                                            : 'Suspended'}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="mt-4 flex items-center gap-4">
                                    <button
                                        type="button"
                                        disabled={page === 1 || busy}
                                        onClick={() => setPage(page - 1)}
                                        className="disabled:opacity-40">
                                        Previous
                                    </button>
                                    <span>
                                        Page {page}
                                        {Number.isFinite(lastPage)
                                            ? ` of ${lastPage}`
                                            : ''}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={
                                            busy ||
                                            (Number.isFinite(lastPage)
                                                ? page >= lastPage
                                                : list.data.tenants.length < 25)
                                        }
                                        onClick={() => setPage(page + 1)}
                                        className="disabled:opacity-40">
                                        Next
                                    </button>
                                </div>
                            </section>
                            {selectedId && (
                                <section className="rounded-xl border border-clinic-line bg-white p-5">
                                    <div className="mb-4 flex justify-between">
                                        <h2 className="font-bold">
                                            Clinic profile
                                        </h2>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                                setSelectedId(null)
                                                setConfirmation(null)
                                            }}>
                                            Close profile
                                        </button>
                                    </div>
                                    {detail.error ? (
                                        <div>
                                            <p role="alert">
                                                {detail.error.message}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void detail.mutate()
                                                }>
                                                Retry profile
                                            </button>
                                        </div>
                                    ) : !detail.data ? (
                                        <p role="status">
                                            Loading clinic profile…
                                        </p>
                                    ) : (
                                        <>
                                            <TenantProfileDetails
                                                tenant={detail.data}
                                            />
                                            <div className="mt-5 border-t border-clinic-line pt-5">
                                                {confirmation ? (
                                                    <div className="space-y-3">
                                                        <p>
                                                            {confirmation ===
                                                            'suspended'
                                                                ? 'Suspending blocks clinic data access for existing sessions. Other active memberships continue to work.'
                                                                : 'Reactivating restores access for authorized clinic members.'}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                void changeStatus()
                                                            }
                                                            className="mr-4 rounded-md bg-clinic-blue px-4 py-2 text-white disabled:opacity-50">
                                                            {busy
                                                                ? 'Updating…'
                                                                : `Confirm ${
                                                                      confirmation ===
                                                                      'suspended'
                                                                          ? 'suspension'
                                                                          : 'activation'
                                                                  }`}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                setConfirmation(
                                                                    null,
                                                                )
                                                            }>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setConfirmation(
                                                                detail.data
                                                                    .active
                                                                    ? 'suspended'
                                                                    : 'active',
                                                            )
                                                            setMessage('')
                                                            setActionError(null)
                                                        }}
                                                        className="rounded-md border border-clinic-line px-4 py-2">
                                                        {detail.data.active
                                                            ? 'Suspend clinic'
                                                            : 'Activate clinic'}
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </section>
                            )}
                            <TenantProvisioningForm
                                onForbidden={() => setBlocked(true)}
                                onSuccess={notice => {
                                    setMessage(notice)
                                    void list.mutate()
                                }}
                            />
                        </>
                    )}
                </div>
            </main>
        </>
    )
}
