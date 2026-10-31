import React from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { canManageUsers } from '../lib/permissions'
import { getCurrentClinicProfile } from '../services/clinic-profile'
import TenantProfileDetails from './TenantProfileDetails'

export default function ClinicProfileSettings() {
    const { user, currentTenant, status, refreshSession } = useAuthSession()
    const allowed =
        status === 'authenticated' &&
        canManageUsers(user) &&
        Boolean(currentTenant)
    const { data, error, mutate } = useSWR(
        allowed ? ['clinic:profile', currentTenant.id] : null,
        () => getCurrentClinicProfile(user, currentTenant),
        { shouldRetryOnError: false },
    )
    if (!allowed) return null
    return (
        <section className="space-y-4 rounded-xl border border-clinic-line bg-white p-6">
            <h2 className="text-xl font-bold">
                Clinic profile and preferences
            </h2>
            <p className="text-sm text-clinic-muted">
                These details were supplied during clinic provisioning. Clinic
                profile updates are currently unavailable. Contact your platform
                operator for assistance.
            </p>
            {error ? (
                <div role="alert">
                    <p>{error.message}</p>
                    {error.requestId && <p>Request ID: {error.requestId}</p>}
                    <button
                        type="button"
                        onClick={() => {
                            void refreshSession().catch(() => undefined)
                            void mutate()
                        }}
                        className="mt-3 rounded-md border border-clinic-line px-4 py-2">
                        Retry clinic profile
                    </button>
                </div>
            ) : data ? (
                <TenantProfileDetails tenant={data} />
            ) : (
                <p role="status">Loading clinic profile…</p>
            )}
        </section>
    )
}
