import React from 'react'
import type { TenantProfile } from '../services/platform-tenants'

export default function TenantProfileDetails({
    tenant,
}: {
    tenant: TenantProfile
}) {
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{tenant.name}</h2>
            <span
                className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                    tenant.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-900'
                }`}>
                {tenant.status === 'active' ? 'Active' : 'Suspended'}
            </span>
            <dl className="grid gap-4 sm:grid-cols-2">
                {Object.entries({
                    'Clinic ID': tenant.id,
                    Slug: tenant.slug,
                    Timezone: tenant.timezone,
                    Currency: tenant.currency,
                    'Contact email': tenant.contact_email,
                    'Contact phone': tenant.contact_phone,
                    Address: tenant.address,
                    'Display name': tenant.branding?.display_name,
                    'Primary color': tenant.branding?.primary_color,
                    'Logo URL': tenant.branding?.logo_url,
                }).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                        <dt className="text-sm text-clinic-muted">{label}</dt>
                        <dd className="break-words">{value || 'Not set'}</dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}
