import React from 'react'
import useSWR from 'swr'
import { useAppointmentPermissions } from '../hooks/appointments'
import { ApiError, ApiFieldErrors } from '../lib/api'
import {
    Appointment,
    AppointmentRoom,
    getAppointmentLocations,
} from '../services/appointments'
import {
    appointmentButtonClass,
    appointmentInputClass,
} from './AppointmentDialog'
import InputError from './InputError'

interface LocationSelectorProps {
    roomId: string
    chairId: string
    onChange: (roomId: string, chairId: string) => void
    current?: Appointment | null
    disabled?: boolean
    errors?: ApiFieldErrors
}

const AppointmentLocationSelector = ({
    roomId,
    chairId,
    onChange,
    current,
    disabled = false,
    errors = {},
}: LocationSelectorProps) => {
    const { user, canView } = useAppointmentPermissions()
    const { data: rooms, error, isValidating, mutate } = useSWR<
        AppointmentRoom[],
        ApiError
    >(
        canView ? ['appointment-locations', user] : null,
        getAppointmentLocations,
        { shouldRetryOnError: false },
    )
    const loading = canView && !rooms && !error
    const choices = error ? [] : rooms ?? []
    const selectedRoom = choices.find(room => String(room.id) === roomId)
    const chairs = selectedRoom?.chairs ?? []
    const missingRoom =
        roomId && !choices.some(room => String(room.id) === roomId)
    const missingChair =
        chairId && !chairs.some(chair => String(chair.id) === chairId)

    return (
        <fieldset className="rounded-md border border-clinic-line p-4">
            <legend className="px-1 text-sm font-bold text-clinic-ink">
                Room and chair (optional)
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
                <label
                    htmlFor="appointment-room_id"
                    className="text-sm font-bold text-clinic-ink">
                    Room
                    <select
                        id="appointment-room_id"
                        name="room_id"
                        value={roomId}
                        disabled={
                            disabled || !canView || loading || Boolean(error)
                        }
                        aria-invalid={Boolean(errors.room_id?.length)}
                        aria-describedby="appointment-room-errors"
                        className={appointmentInputClass}
                        onChange={event => onChange(event.target.value, '')}>
                        <option value="">
                            {loading ? 'Loading rooms...' : 'No room reserved'}
                        </option>
                        {missingRoom && (
                            <option value={roomId}>
                                {current?.roomName ?? `Room #${roomId}`}{' '}
                                (current)
                            </option>
                        )}
                        {choices.map(room => (
                            <option key={room.id} value={room.id}>
                                {room.name}
                            </option>
                        ))}
                    </select>
                    <div id="appointment-room-errors">
                        <InputError
                            messages={errors.room_id}
                            className="mt-2"
                        />
                    </div>
                </label>
                <label
                    htmlFor="appointment-chair_id"
                    className="text-sm font-bold text-clinic-ink">
                    Chair
                    <select
                        id="appointment-chair_id"
                        name="chair_id"
                        value={chairId}
                        disabled={
                            disabled ||
                            !canView ||
                            loading ||
                            Boolean(error) ||
                            !roomId
                        }
                        aria-invalid={Boolean(errors.chair_id?.length)}
                        aria-describedby="appointment-chair-errors"
                        className={appointmentInputClass}
                        onChange={event =>
                            onChange(roomId, event.target.value)
                        }>
                        <option value="">
                            {!roomId
                                ? 'Choose a room first'
                                : 'No chair reserved'}
                        </option>
                        {missingChair && (
                            <option value={chairId}>
                                {current?.chairName ?? `Chair #${chairId}`}{' '}
                                (current)
                            </option>
                        )}
                        {chairs.map(chair => (
                            <option key={chair.id} value={chair.id}>
                                {chair.name}
                            </option>
                        ))}
                    </select>
                    <div id="appointment-chair-errors">
                        <InputError
                            messages={errors.chair_id}
                            className="mt-2"
                        />
                    </div>
                </label>
            </div>
            <p className="mt-3 text-xs text-clinic-muted">
                A chair also reserves its room. Availability is checked when
                saving. Choose “No room reserved” to clear both reservations.
            </p>
            {!loading && !error && choices.length === 0 && (
                <p className="mt-2 text-sm text-clinic-muted">
                    No rooms are configured. You can save without a location.
                </p>
            )}
            {error && (
                <div role="alert" className="mt-3 text-sm text-rose-700">
                    <p>
                        {error.message} Existing location selections are
                        retained.
                    </p>
                    <button
                        type="button"
                        disabled={isValidating}
                        onClick={() => void mutate()}
                        className={`${appointmentButtonClass} mt-2`}>
                        Retry locations
                    </button>
                </div>
            )}
        </fieldset>
    )
}

export default AppointmentLocationSelector
