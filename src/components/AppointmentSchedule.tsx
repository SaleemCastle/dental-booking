import React, { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
    FiChevronLeft,
    FiChevronRight,
    FiPlus,
    FiRefreshCw,
} from 'react-icons/fi'
import {
    useAppointmentMutationSync,
    useAppointments,
} from '../hooks/appointments'
import { ApiError } from '../lib/api'
import {
    appointmentStatusClasses,
    appointmentStatusLabels,
    shiftScheduleDate,
    sortAppointments,
    utcToday,
} from '../lib/appointment-workflow'
import {
    availabilityForDate,
    calendarEndHour,
    calendarIntervalStyle,
    calendarMinutes,
    calendarStartHour,
    formatCalendarDate,
    formatCalendarTime,
    getCalendarWeek,
    getDateTimeParts,
    layoutCalendarAppointments,
} from '../lib/appointment-calendar'
import {
    Appointment,
    AppointmentPayload,
    AppointmentProvider,
    AppointmentRoom,
    createAppointment,
    getAppointmentLocations,
    getAppointmentProviders,
    getAppointments,
    getProviderAvailability,
    getProviderName,
    ProviderAvailability,
    updateAppointment,
} from '../services/appointments'
import AppointmentDetails from './AppointmentDetails'
import AppointmentForm from './AppointmentForm'
import {
    appointmentButtonClass,
    appointmentInputClass,
    appointmentPrimaryClass,
} from './AppointmentDialog'

type CalendarView = 'day' | 'week'

const AppointmentSchedule = () => {
    const [date, setDate] = useState(utcToday)
    const [view, setView] = useState<CalendarView>('day')
    const [provider, setProvider] = useState('')
    const [room, setRoom] = useState('')
    const [chair, setChair] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [editor, setEditor] = useState<{
        appointment: Appointment | null
        startsAt?: string
        dentistId?: number
    } | null>(null)
    const [notice, setNotice] = useState('')
    const savingRef = useRef(false)
    const calendarRef = useRef<HTMLDivElement>(null)
    const access = useAppointments(date)
    const { user, canView, canCreate, canUpdate, canViewAvailability } = access
    const syncCalendarAppointment = useAppointmentMutationSync(date)
    const weekDates = useMemo(() => getCalendarWeek(date), [date])
    const previousDate = shiftScheduleDate(date, -1)
    const previousDay = useSWR<Appointment[], ApiError>(
        canView && view === 'day' ? ['appointments', user, previousDate] : null,
        () => getAppointments(previousDate),
        { shouldRetryOnError: false },
    )
    const appointmentsKey =
        view === 'week' ? ['appointment-week', user, weekDates[0]] : null
    const {
        data: weekAppointments,
        error: weekError,
        isValidating: isWeekValidating,
        mutate: retryWeek,
    } = useSWR<Appointment[], ApiError>(
        canView ? appointmentsKey : null,
        async () =>
            (
                await Promise.all(
                    [
                        shiftScheduleDate(weekDates[0], -1),
                        ...weekDates,
                    ].map(day => getAppointments(day)),
                )
            ).flat(),
        { shouldRetryOnError: false },
    )
    const {
        data: providers,
        error: providerError,
        isValidating: providersValidating,
        mutate: retryProviders,
    } = useSWR<AppointmentProvider[], ApiError>(
        canView ? ['appointment-providers', user] : null,
        getAppointmentProviders,
        { shouldRetryOnError: false },
    )
    const {
        data: rooms,
        error: roomError,
        isValidating: roomsValidating,
        mutate: retryRooms,
    } = useSWR<AppointmentRoom[], ApiError>(
        canView ? ['appointment-locations', user] : null,
        getAppointmentLocations,
        { shouldRetryOnError: false },
    )
    const {
        data: loadedAvailability,
        error: availabilityError,
        isValidating: availabilityValidating,
        mutate: retryAvailability,
    } = useSWR<ProviderAvailability, ApiError>(
        canViewAvailability && provider
            ? ['provider-availability', user, provider]
            : null,
        () => getProviderAvailability(Number(provider)),
        { shouldRetryOnError: false },
    )
    const availability =
        canViewAvailability && !availabilityError
            ? loadedAvailability
            : undefined

    const changeDate = (nextDate: string) => {
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(nextDate) ||
            !Number.isFinite(Date.parse(`${nextDate}T12:00:00Z`))
        )
            return
        setDate(nextDate)
        setSelectedId(null)
        setNotice('')
    }
    const save = async (payload: Partial<AppointmentPayload>) => {
        if (
            savingRef.current ||
            !editor ||
            (editor.appointment ? !canUpdate : !canCreate)
        )
            throw new Error(
                'You do not have permission to save this appointment.',
            )
        savingRef.current = true
        try {
            const saved = editor.appointment
                ? await updateAppointment(editor.appointment.id, payload)
                : await createAppointment(payload as AppointmentPayload)
            await syncCalendarAppointment(saved, editor.appointment)
            setDate(saved.startsAt.slice(0, 10))
            setStatusFilter('')
            setProvider(String(saved.dentist_id))
            setRoom(saved.room_id == null ? '' : String(saved.room_id))
            setChair(saved.chair_id == null ? '' : String(saved.chair_id))
            setEditor(null)
            setSelectedId(saved.id)
            setNotice(
                editor.appointment
                    ? 'Appointment updated.'
                    : 'Appointment booked.',
            )
        } finally {
            savingRef.current = false
        }
    }
    const loadingCalendar =
        (view === 'week'
            ? !weekAppointments && !weekError
            : access.isLoading || (!previousDay.data && !previousDay.error)) ||
        (!providers && !providerError)
    useEffect(() => {
        if (!loadingCalendar && calendarRef.current)
            calendarRef.current.scrollTop = 7 * 60
    }, [loadingCalendar, date, view])

    if (!canView)
        return (
            <p role="alert" className="p-8 text-sm text-clinic-muted">
                You do not have permission to view the schedule.
            </p>
        )

    const displayedDates = view === 'week' ? weekDates : [date]
    const allAppointments = Array.from(
        new Map(
            (view === 'week'
                ? weekAppointments ?? []
                : [...(previousDay.data ?? []), ...(access.appointments ?? [])]
            ).map(item => [item.id, item]),
        ).values(),
    ).filter(appointment =>
        displayedDateIntersects(appointment, displayedDates),
    )
    const allProviders: AppointmentProvider[] = Array.from(
        new Map<number, AppointmentProvider>([
            ...allAppointments.map(
                appointment =>
                    [
                        appointment.dentist_id,
                        {
                            id: appointment.dentist_id,
                            name: appointment.dentistName,
                        },
                    ] as const,
            ),
            ...(providers ?? []).map(item => [item.id, item] as const),
        ]).values(),
    )
    const providerById = new Map(
        allProviders.map(item => [item.id, getProviderName(item)]),
    )
    const roomList = rooms ?? []
    const chairList = roomList
        .filter(item => !room || item.id === Number(room))
        .flatMap(item => item.chairs)
    const visibleAppointments = sortAppointments(
        allAppointments.filter(
            appointment =>
                (!provider || appointment.dentist_id === Number(provider)) &&
                (!room || appointment.room_id === Number(room)) &&
                (!chair || appointment.chair_id === Number(chair)) &&
                (!statusFilter || appointment.status === statusFilter),
        ),
    )
    const scheduleError =
        view === 'week' ? weekError : access.error ?? previousDay.error
    const isLoading = loadingCalendar
    const isValidating =
        access.isValidating ||
        previousDay.isValidating ||
        isWeekValidating ||
        providersValidating ||
        roomsValidating ||
        availabilityValidating
    const providerLanes =
        view === 'day'
            ? provider
                ? allProviders.filter(item => item.id === Number(provider))
                : allProviders
            : []
    const selectedProviderName = provider
        ? providerById.get(Number(provider)) ?? `Provider #${provider}`
        : ''
    // Appointment date queries and the existing booking form use the API's UTC
    // application timezone, as do provider availability rules in this rollout.
    const timezone = 'UTC'
    function displayedDateIntersects(
        appointment: Appointment,
        dates: string[],
    ) {
        const start = getDateTimeParts(appointment.startsAt, 'UTC')
        const end = getDateTimeParts(appointment.endsAt, 'UTC')
        return dates.some(
            day =>
                start.date <= day &&
                (end.date > day || (end.date === day && end.minutes > 0)),
        )
    }
    const createFromSlot = (
        day: string,
        minute: number,
        dentistId?: number,
    ) => {
        if (!canCreate) return
        setDate(day)
        setNotice('')
        setEditor({
            appointment: null,
            startsAt: `${day}T${formatCalendarTime(minute)}`,
            dentistId,
        })
    }
    const retrySchedule = () => {
        void access.retry()
        if (view === 'day') void previousDay.mutate()
        if (view === 'week') void retryWeek()
        if (provider) void retryAvailability()
        if (providerError) void retryProviders()
        if (roomError) void retryRooms()
    }

    const renderAppointment = (
        segment: ReturnType<typeof layoutCalendarAppointments>[number],
    ) => {
        const { appointment } = segment
        const time = getDateTimeParts(appointment.startsAt, timezone)
        const end = getDateTimeParts(appointment.endsAt, timezone)
        return (
            <button
                key={appointment.id}
                type="button"
                title={`${appointment.patientName} · ${
                    appointment.dentistName
                } · ${formatCalendarTime(time.minutes)} – ${formatCalendarTime(
                    end.minutes,
                )} · ${appointmentStatusLabels[appointment.status]} · ${
                    appointment.roomName ?? 'No room'
                } · ${appointment.chairName ?? 'No chair'}`}
                aria-label={`View appointment ${appointment.id} for ${
                    appointment.patientName
                }, ${formatCalendarTime(time.minutes)} to ${formatCalendarTime(
                    end.minutes,
                )}, ${appointmentStatusLabels[appointment.status]}, ${
                    appointment.roomName ?? 'no room'
                }, ${appointment.chairName ?? 'no chair'}`}
                onClick={() => setSelectedId(appointment.id)}
                className={`absolute z-20 overflow-hidden rounded-md border border-clinic-line p-1.5 text-left shadow-sm hover:z-30 hover:shadow ${
                    appointmentStatusClasses[appointment.status]
                }`}
                style={{
                    top: `${segment.start}px`,
                    height: `${segment.height}px`,
                    left: `calc(${
                        (segment.column * 100) / segment.columns
                    }% + 3px)`,
                    width: `calc(${100 / segment.columns}% - 6px)`,
                }}>
                <span className="block truncate text-xs font-bold">
                    {appointment.patientName}
                </span>
                <span className="block truncate text-[11px]">
                    {segment.continuesBefore ? 'Continued · ' : ''}
                    {formatCalendarTime(segment.start)} –{' '}
                    {formatCalendarTime(segment.end)}
                    {view === 'week' &&
                        ` · ${
                            appointment.dentistName ||
                            providerById.get(appointment.dentist_id)
                        }`}
                </span>
                <span className="hidden truncate text-[11px] sm:block">
                    {appointment.treatmentName ?? appointment.appointment_type}{' '}
                    · {appointmentStatusLabels[appointment.status]}
                </span>
            </button>
        )
    }
    const renderAvailability = (day: string) => {
        if (!availability?.configured) return null
        const dayRules = availabilityForDate(availability, day)
        return (
            <>
                <div
                    aria-label={
                        dayRules.workingHours.length
                            ? 'Outside provider working hours'
                            : 'Provider unavailable all day'
                    }
                    className="absolute inset-0 bg-[repeating-linear-gradient(135deg,#f1f3f6_0px,#f1f3f6_7px,#e6e9ee_7px,#e6e9ee_14px)]"
                />
                {dayRules.workingHours.map((interval, index) => {
                    const style = calendarIntervalStyle(interval)
                    return style ? (
                        <div
                            key={`work-${index}`}
                            aria-label={`Working ${interval.start_time} to ${interval.end_time}`}
                            className="absolute right-0 left-0 bg-white"
                            style={style}
                        />
                    ) : null
                })}
                {dayRules.breaks.map((interval, index) => {
                    const style = calendarIntervalStyle(interval)
                    return style ? (
                        <div
                            key={`break-${index}`}
                            aria-label={`Break ${interval.start_time} to ${interval.end_time}`}
                            className="absolute right-0 left-0 border-y border-dashed border-amber-400 bg-[repeating-linear-gradient(135deg,#fef3c7_0px,#fef3c7_7px,#fde68a_7px,#fde68a_14px)]"
                            style={style}
                        />
                    ) : null
                })}
            </>
        )
    }
    const renderLane = (day: string, laneProvider?: AppointmentProvider) => {
        const laneAppointments = layoutCalendarAppointments(
            visibleAppointments.filter(appointment =>
                view === 'week'
                    ? true
                    : appointment.dentist_id === laneProvider?.id,
            ),
            day,
            timezone,
        )
        const selectedLane =
            Boolean(provider) &&
            (view === 'week' || laneProvider?.id === Number(provider))
        return (
            <div
                key={`${day}-${laneProvider?.id ?? 'day'}`}
                data-calendar-date={day}
                className="relative min-w-[230px] flex-1 border-r border-clinic-line last:border-r-0"
                style={{ height: `${calendarMinutes}px` }}>
                {selectedLane && renderAvailability(day)}
                {Array.from(
                    { length: (calendarEndHour - calendarStartHour) * 2 },
                    (_, index) => {
                        const minute = calendarStartHour * 60 + index * 30
                        return (
                            <button
                                key={minute}
                                type="button"
                                disabled={!canCreate}
                                aria-label={`Create appointment ${day} ${formatCalendarTime(
                                    minute,
                                )}`}
                                title={
                                    canCreate
                                        ? `Book at ${formatCalendarTime(
                                              minute,
                                          )}`
                                        : undefined
                                }
                                onClick={() =>
                                    createFromSlot(
                                        day,
                                        minute,
                                        laneProvider?.id ??
                                            (provider
                                                ? Number(provider)
                                                : undefined),
                                    )
                                }
                                className="absolute right-0 left-0 z-10 h-[30px] border-b border-dotted border-clinic-line/70 text-left hover:bg-clinic-blue/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-blue disabled:cursor-default"
                                style={{ top: `${index * 30}px` }}
                            />
                        )
                    },
                )}
                {laneAppointments.map(renderAppointment)}
                {laneAppointments.length === 0 &&
                    availability?.configured &&
                    selectedLane &&
                    availabilityForDate(availability, day).workingHours
                        .length === 0 && (
                        <p className="absolute top-1/2 z-[5] w-full -translate-y-1/2 px-2 text-center text-xs font-bold uppercase tracking-wide text-clinic-muted">
                            Not available
                        </p>
                    )}
            </div>
        )
    }

    return (
        <section
            aria-label="Appointment calendar"
            className="min-w-0 p-4 sm:p-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-extrabold text-clinic-ink">
                        Appointment calendar
                    </h1>
                    <p className="mt-1 text-sm text-clinic-muted">
                        {view === 'day'
                            ? formatCalendarDate(date, {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                              })
                            : `${formatCalendarDate(weekDates[0], {
                                  month: 'short',
                                  day: 'numeric',
                              })} – ${formatCalendarDate(weekDates[6], {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                              })}`}
                        {' · Times in '}
                        {timezone}
                    </p>
                </div>
                {canCreate && (
                    <button
                        type="button"
                        onClick={() => {
                            setNotice('')
                            setEditor({
                                appointment: null,
                                dentistId: provider
                                    ? Number(provider)
                                    : undefined,
                            })
                        }}
                        className={`${appointmentPrimaryClass} flex items-center gap-2`}>
                        <FiPlus /> Book appointment
                    </button>
                )}
            </div>

            <div className="mb-5 flex flex-wrap items-end gap-3">
                <div className="flex items-end gap-2">
                    <button
                        type="button"
                        aria-label={`Previous ${view}`}
                        onClick={() =>
                            changeDate(
                                shiftScheduleDate(
                                    date,
                                    view === 'week' ? -7 : -1,
                                ),
                            )
                        }
                        className={appointmentButtonClass}>
                        <FiChevronLeft className="h-5 w-5" />
                    </button>
                    <label
                        htmlFor="schedule-date"
                        className="text-sm font-bold text-clinic-ink">
                        Date
                        <input
                            id="schedule-date"
                            type="date"
                            value={date}
                            className={appointmentInputClass}
                            onChange={event => changeDate(event.target.value)}
                        />
                    </label>
                    <button
                        type="button"
                        aria-label={`Next ${view}`}
                        onClick={() =>
                            changeDate(
                                shiftScheduleDate(
                                    date,
                                    view === 'week' ? 7 : 1,
                                ),
                            )
                        }
                        className={appointmentButtonClass}>
                        <FiChevronRight className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => changeDate(utcToday())}
                        className={appointmentButtonClass}>
                        Today
                    </button>
                </div>
                <div
                    role="group"
                    aria-label="Calendar view"
                    className="flex rounded-md border border-clinic-line bg-white p-1">
                    {(['day', 'week'] as const).map(item => (
                        <button
                            key={item}
                            type="button"
                            aria-pressed={view === item}
                            onClick={() => setView(item)}
                            className={`rounded px-3 py-1.5 text-sm font-bold capitalize ${
                                view === item
                                    ? 'bg-clinic-blue text-white'
                                    : 'text-clinic-muted hover:bg-clinic-canvas'
                            }`}>
                            {item === 'day' ? 'Day' : 'Week'}
                        </button>
                    ))}
                </div>
                <label
                    className="text-sm font-bold text-clinic-ink"
                    htmlFor="schedule-provider">
                    Provider
                    <select
                        id="schedule-provider"
                        value={provider}
                        onChange={event => setProvider(event.target.value)}
                        className={appointmentInputClass}>
                        <option value="">All providers</option>
                        {allProviders.map(item => (
                            <option key={item.id} value={item.id}>
                                {getProviderName(item)}
                            </option>
                        ))}
                    </select>
                </label>
                <label
                    className="text-sm font-bold text-clinic-ink"
                    htmlFor="schedule-room">
                    Room
                    <select
                        id="schedule-room"
                        value={room}
                        onChange={event => {
                            setRoom(event.target.value)
                            setChair('')
                        }}
                        className={appointmentInputClass}>
                        <option value="">All rooms</option>
                        {roomList.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label
                    className="text-sm font-bold text-clinic-ink"
                    htmlFor="schedule-chair">
                    Chair
                    <select
                        id="schedule-chair"
                        value={chair}
                        onChange={event => setChair(event.target.value)}
                        className={appointmentInputClass}
                        disabled={!chairList.length}>
                        <option value="">All chairs</option>
                        {chairList.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label
                    className="text-sm font-bold text-clinic-ink"
                    htmlFor="schedule-status">
                    Status
                    <select
                        id="schedule-status"
                        value={statusFilter}
                        onChange={event => setStatusFilter(event.target.value)}
                        className={appointmentInputClass}>
                        <option value="">All statuses</option>
                        {Object.entries(appointmentStatusLabels).map(
                            ([status, label]) => (
                                <option key={status} value={status}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                </label>
                <button
                    type="button"
                    disabled={isValidating}
                    onClick={retrySchedule}
                    className={`${appointmentButtonClass} flex items-center gap-2`}>
                    <FiRefreshCw />
                    {isValidating ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {notice && (
                <p
                    role="status"
                    className="mb-4 rounded-md bg-clinic-mint p-3 text-sm text-clinic-ink">
                    {notice}
                </p>
            )}
            {providerError && (
                <p role="alert" className="mb-3 text-sm text-rose-700">
                    Providers could not be loaded: {providerError.message}
                    <button
                        type="button"
                        onClick={() => void retryProviders()}
                        className="ml-2 underline">
                        Retry
                    </button>
                </p>
            )}
            {roomError && (
                <p role="alert" className="mb-3 text-sm text-rose-700">
                    Room and chair filters could not be loaded:{' '}
                    {roomError.message}
                    <button
                        type="button"
                        onClick={() => void retryRooms()}
                        className="ml-2 underline">
                        Retry
                    </button>
                </p>
            )}
            {provider && availabilityError && (
                <p role="alert" className="mb-3 text-sm text-rose-700">
                    Provider availability could not be loaded:{' '}
                    {availabilityError.message}
                    <button
                        type="button"
                        onClick={() => void retryAvailability()}
                        className="ml-2 underline">
                        Retry
                    </button>
                </p>
            )}
            {availability?.configured && provider && (
                <div
                    className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-clinic-muted"
                    aria-label="Calendar availability legend">
                    <span className="font-bold text-clinic-ink">
                        {selectedProviderName} availability
                        {availability.exceptions.some(item =>
                            displayedDates.includes(item.date),
                        )
                            ? ' · exception dates override weekly hours'
                            : ''}
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <i className="h-3 w-3 border border-clinic-line bg-white" />
                        Working
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <i className="h-3 w-3 bg-[repeating-linear-gradient(135deg,#f1f3f6_0px,#f1f3f6_3px,#e6e9ee_3px,#e6e9ee_6px)]" />
                        Unavailable
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <i className="h-3 w-3 bg-amber-200" />
                        Break
                    </span>
                </div>
            )}
            {!canViewAvailability && (
                <p className="mb-3 text-xs text-clinic-muted">
                    Working hours require availability viewing permission.
                    Appointment saves still check availability and conflicts.
                </p>
            )}
            {!provider && canViewAvailability && (
                <p className="mb-3 text-xs text-clinic-muted">
                    Choose a provider to show their working hours, breaks, and
                    unavailable periods.
                </p>
            )}
            {provider &&
                canViewAvailability &&
                !availability &&
                !availabilityError && (
                    <p role="status" className="mb-3 text-sm text-clinic-muted">
                        Loading provider availability...
                    </p>
                )}
            {availability && !availability.configured && provider && (
                <p
                    role="status"
                    className="mb-3 rounded-md bg-clinic-amber p-3 text-sm text-amber-800">
                    No working-hours configuration is saved for{' '}
                    {selectedProviderName}. Availability is not yet defined;
                    bookings use conflict checks only.
                </p>
            )}

            {scheduleError ? (
                <div
                    role="alert"
                    className="rounded-md border border-rose-200 bg-clinic-rose p-5 text-sm text-rose-700">
                    <p>{scheduleError.message}</p>
                    <button
                        type="button"
                        disabled={isValidating}
                        onClick={retrySchedule}
                        className={`${appointmentButtonClass} mt-3`}>
                        Try again
                    </button>
                </div>
            ) : isLoading ? (
                <p
                    role="status"
                    className="p-8 text-center text-sm text-clinic-muted">
                    Loading appointments...
                </p>
            ) : (
                <>
                    {visibleAppointments.length === 0 && (
                        <p
                            role="status"
                            className="mb-3 text-sm text-clinic-muted">
                            {allAppointments.length
                                ? 'No appointments match these filters.'
                                : `No appointments scheduled for this ${
                                      view === 'day' ? 'day' : 'week'
                                  }.`}
                        </p>
                    )}
                    {view === 'day' && providerLanes.length === 0 ? (
                        <div className="rounded-md border border-dashed border-clinic-line bg-white p-8 text-center text-sm text-clinic-muted">
                            No providers are configured for this clinic.
                            {canCreate &&
                                ' Use Book appointment to start a booking.'}
                        </div>
                    ) : (
                        <div
                            ref={calendarRef}
                            role="region"
                            aria-label={`${
                                view === 'day' ? 'Day' : 'Week'
                            } calendar, times in ${timezone}`}
                            tabIndex={0}
                            className="max-h-[70vh] overflow-auto rounded-md border border-clinic-line bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-blue"
                            aria-busy={isValidating}>
                            <div
                                className="w-full min-w-max"
                                style={{
                                    width:
                                        view === 'day'
                                            ? `max(100%, ${
                                                  providerLanes.length * 240 +
                                                  88
                                              }px)`
                                            : '100%',
                                }}>
                                <div
                                    className="sticky top-0 z-30 grid border-b border-clinic-line bg-white"
                                    style={{
                                        gridTemplateColumns: `88px repeat(${
                                            view === 'day'
                                                ? Math.max(
                                                      1,
                                                      providerLanes.length,
                                                  )
                                                : 7
                                        }, minmax(230px, 1fr))`,
                                    }}>
                                    <div className="sticky left-0 z-40 bg-clinic-canvas px-3 py-3 text-xs font-bold text-clinic-muted">
                                        {timezone}
                                    </div>
                                    {view === 'day'
                                        ? providerLanes.map(item => (
                                              <div
                                                  key={item.id}
                                                  className="border-l border-clinic-line px-3 py-2">
                                                  <p className="truncate text-sm font-bold text-clinic-ink">
                                                      {getProviderName(item)}
                                                  </p>
                                                  <p className="text-xs text-clinic-muted">
                                                      {
                                                          visibleAppointments.filter(
                                                              appointment =>
                                                                  appointment.dentist_id ===
                                                                  item.id,
                                                          ).length
                                                      }{' '}
                                                      appointments
                                                  </p>
                                              </div>
                                          ))
                                        : displayedDates.map(day => (
                                              <div
                                                  key={day}
                                                  className="border-l border-clinic-line px-3 py-2">
                                                  <button
                                                      type="button"
                                                      aria-label={`View day ${day}`}
                                                      onClick={() => {
                                                          changeDate(day)
                                                          setView('day')
                                                      }}
                                                      className="text-left hover:underline">
                                                      <span className="block text-sm font-bold text-clinic-ink">
                                                          {formatCalendarDate(
                                                              day,
                                                              {
                                                                  weekday:
                                                                      'short',
                                                              },
                                                          )}
                                                      </span>
                                                      <span className="block text-xs text-clinic-muted">
                                                          {formatCalendarDate(
                                                              day,
                                                              {
                                                                  month:
                                                                      'short',
                                                                  day:
                                                                      'numeric',
                                                              },
                                                          )}
                                                      </span>
                                                  </button>
                                              </div>
                                          ))}
                                </div>
                                <div
                                    className="grid"
                                    style={{
                                        gridTemplateColumns: `88px repeat(${
                                            view === 'day'
                                                ? Math.max(
                                                      1,
                                                      providerLanes.length,
                                                  )
                                                : 7
                                        }, minmax(230px, 1fr))`,
                                    }}>
                                    <div
                                        className="sticky left-0 z-20 bg-white"
                                        style={{
                                            height: `${calendarMinutes}px`,
                                        }}>
                                        {Array.from(
                                            {
                                                length:
                                                    calendarEndHour -
                                                    calendarStartHour,
                                            },
                                            (_, index) => (
                                                <div
                                                    key={index}
                                                    className="relative h-[60px] border-b border-clinic-line bg-white px-3 pt-1 text-xs text-clinic-muted">
                                                    {String(
                                                        calendarStartHour +
                                                            index,
                                                    ).padStart(2, '0')}
                                                    :00
                                                </div>
                                            ),
                                        )}
                                    </div>
                                    {view === 'day'
                                        ? providerLanes.map(item =>
                                              renderLane(date, item),
                                          )
                                        : displayedDates.map(day =>
                                              renderLane(day),
                                          )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {selectedId !== null && (
                <AppointmentDetails
                    key={selectedId}
                    id={selectedId}
                    onClose={() => setSelectedId(null)}
                    onEdit={appointment => {
                        if (canUpdate) {
                            setSelectedId(null)
                            setEditor({ appointment })
                        }
                    }}
                    onUpdated={async (saved, previous) => {
                        await syncCalendarAppointment(saved, previous)
                        setNotice(
                            `Appointment ${appointmentStatusLabels[
                                saved.status
                            ].toLowerCase()}.`,
                        )
                    }}
                />
            )}
            {editor && (editor.appointment ? canUpdate : canCreate) && (
                <AppointmentForm
                    key={`${editor.appointment?.id ?? 'new'}-${
                        editor.startsAt ?? ''
                    }`}
                    appointment={editor.appointment}
                    date={date}
                    initialStart={editor.startsAt}
                    initialDentistId={editor.dentistId}
                    initialRoomId={
                        room
                            ? Number(room)
                            : chair
                            ? chairList.find(item => item.id === Number(chair))
                                  ?.room_id
                            : undefined
                    }
                    initialChairId={chair ? Number(chair) : undefined}
                    onClose={() => setEditor(null)}
                    onSave={save}
                />
            )}
        </section>
    )
}

export default AppointmentSchedule
