import React, { useRef, useState } from 'react'
import { ApiError, normalizeAxiosError } from '../lib/api'
import {
    ProvisionTenantInput,
    provisionPlatformTenant,
} from '../services/platform-tenants'

const fields = [
    ['name', 'Clinic name', 'text', true],
    ['slug', 'Clinic slug', 'text', true],
    ['contact_email', 'Contact email', 'email', true],
    ['contact_phone', 'Contact phone', 'tel', false],
    ['address', 'Address', 'text', false],
    ['timezone', 'Timezone', 'text', true],
    ['currency', 'Currency', 'text', true],
    ['branding.display_name', 'Brand display name', 'text', false],
    ['branding.primary_color', 'Brand primary color', 'text', false],
    ['branding.logo_url', 'Brand logo URL', 'url', false],
    ['admin.name', 'Initial admin name', 'text', true],
    ['admin.email', 'Initial admin email', 'email', true],
    ['admin.password', 'Initial admin password', 'password', true],
] as const
const maxLengths: Record<string, number> = {
    name: 255,
    slug: 100,
    contact_email: 255,
    contact_phone: 50,
    address: 1000,
    currency: 3,
    'branding.display_name': 255,
    'branding.logo_url': 2048,
    'branding.primary_color': 7,
    'admin.password': 72,
}
export default function TenantProvisioningForm({
    onSuccess,
    onForbidden,
}: {
    onSuccess: (message: string) => void
    onForbidden: () => void
}) {
    const [key, setKey] = useState(() => crypto.randomUUID())
    const [snapshot, setSnapshot] = useState<ProvisionTenantInput | null>(null)
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState<ApiError | null>(null)
    const inFlight = useRef(false)
    const form = useRef<HTMLFormElement>(null)
    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (inFlight.current || done) return
        const values = new FormData(event.currentTarget)
        const value = (name: string) => String(values.get(name) ?? '')
        const branding = Object.fromEntries(
            ['display_name', 'primary_color', 'logo_url']
                .map(name => [name, value(`branding.${name}`)])
                .filter(([, entry]) => entry),
        )
        const payload: ProvisionTenantInput = snapshot ?? {
            idempotency_key: key,
            name: value('name'),
            slug: value('slug'),
            contact_email: value('contact_email'),
            timezone: value('timezone'),
            currency: value('currency'),
            ...(value('contact_phone')
                ? { contact_phone: value('contact_phone') }
                : {}),
            ...(value('address') ? { address: value('address') } : {}),
            ...(Object.keys(branding).length ? { branding } : {}),
            admin: {
                name: value('admin.name'),
                email: value('admin.email'),
                password: value('admin.password'),
            },
        }
        setSnapshot(payload)
        inFlight.current = true
        setBusy(true)
        setError(null)
        try {
            const result = await provisionPlatformTenant(payload)
            setSnapshot(null)
            form.current?.reset()
            setDone(true)
            onSuccess(
                `${
                    result.replayed
                        ? 'Original provisioning recovered'
                        : 'Clinic provisioned'
                }: ${result.tenant.name} (ID ${result.tenant.id}), admin ID ${
                    result.initialAdminId
                }. Status: ${result.tenant.status}.`,
            )
        } catch (caught) {
            const failure = normalizeAxiosError(caught)
            setError(failure)
            if (failure.statusCode === 422) setSnapshot(null)
            if (failure.statusCode === 403 || failure.statusCode === 401)
                onForbidden()
        } finally {
            inFlight.current = false
            setBusy(false)
        }
    }
    const startNew = () => {
        form.current?.reset()
        setSnapshot(null)
        setKey(crypto.randomUUID())
        setError(null)
        setDone(false)
    }
    return (
        <section className="rounded-xl border border-clinic-line bg-white p-5">
            <h2 className="text-xl font-bold">Provision a clinic</h2>
            <p className="my-3 text-sm text-clinic-muted">
                Creates one active clinic and a new admin identity. Existing
                identities cannot be enrolled. Outbound communications and
                checkout require separate configuration.
            </p>
            <p className="mb-4 break-all text-sm">
                Request key: <code>{key}</code>
            </p>
            {error && (
                <div role="alert" className="mb-4 text-rose-700">
                    <p>{error.message}</p>
                    {Object.entries(error.errors).map(([field, messages]) => (
                        <p key={field}>
                            {field}: {messages.join(' ')}
                        </p>
                    ))}
                    {error.requestId && <p>Request ID: {error.requestId}</p>}
                </div>
            )}
            <form ref={form} onSubmit={submit}>
                <fieldset
                    disabled={busy || Boolean(snapshot) || done}
                    className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
                    <label className="block text-sm font-semibold sm:col-span-2">
                        Idempotency key *
                        <input
                            name="idempotency_key"
                            required
                            value={key}
                            autoComplete="off"
                            onChange={event => setKey(event.target.value)}
                            className="mt-1 block w-full rounded-md border-clinic-line text-sm"
                        />
                        <span className="mt-1 block font-normal text-clinic-muted">
                            Keep this key and the original inputs for retries.
                            To recover an earlier request after leaving this
                            page, enter its original key and inputs.
                        </span>
                    </label>
                    {fields.map(([name, label, type, required]) => (
                        <label
                            key={name}
                            className="block text-sm font-semibold">
                            {label}
                            {required ? ' *' : ''}
                            <input
                                name={name}
                                type={type}
                                required={required}
                                defaultValue={
                                    name === 'timezone'
                                        ? 'UTC'
                                        : name === 'currency'
                                        ? 'USD'
                                        : ''
                                }
                                autoComplete={
                                    name === 'admin.password'
                                        ? 'new-password'
                                        : 'off'
                                }
                                minLength={
                                    name === 'admin.password' ? 12 : undefined
                                }
                                maxLength={maxLengths[name]}
                                pattern={
                                    name === 'currency'
                                        ? '[A-Z]{3}'
                                        : name === 'branding.primary_color'
                                        ? '#[0-9a-fA-F]{6}'
                                        : name === 'branding.logo_url'
                                        ? 'https://.+'
                                        : name === 'slug'
                                        ? '[a-z0-9]+(-[a-z0-9]+)*'
                                        : undefined
                                }
                                placeholder={
                                    name === 'timezone'
                                        ? 'America/Bogota'
                                        : name === 'branding.primary_color'
                                        ? '#123abc'
                                        : undefined
                                }
                                aria-invalid={Boolean(error?.errors[name])}
                                className="mt-1 block w-full rounded-md border-clinic-line text-sm"
                            />
                        </label>
                    ))}
                </fieldset>
                {snapshot && (
                    <p role="status" className="my-4 text-sm">
                        The original request is retained in this page for an
                        exact retry. Check its outcome before starting a
                        different request. Leaving or reloading clears this
                        form.
                    </p>
                )}
                <div className="mt-5 flex flex-wrap gap-4">
                    {!done && (
                        <button
                            disabled={busy}
                            className="rounded-md bg-clinic-blue px-4 py-2 font-semibold text-white disabled:opacity-50">
                            {busy
                                ? 'Provisioning…'
                                : snapshot
                                ? 'Retry original request'
                                : 'Provision clinic'}
                        </button>
                    )}
                    {(done || snapshot) && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={startNew}
                            className="rounded-md border border-clinic-line px-4 py-2">
                            Start a new request
                        </button>
                    )}
                </div>
            </form>
        </section>
    )
}
