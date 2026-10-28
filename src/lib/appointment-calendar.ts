import {
    Appointment,
    ProviderAvailability,
    ProviderAvailabilityInterval,
} from '../services/appointments'
import { shiftScheduleDate } from './appointment-workflow'

export const calendarStartHour = 0
export const calendarEndHour = 24
export const calendarMinutes = (calendarEndHour - calendarStartHour) * 60

export const getWeekStart = (date: string) => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    return shiftScheduleDate(date, -weekday)
}

export const getCalendarWeek = (date: string) => {
    const start = getWeekStart(date)
    return Array.from({ length: 7 }, (_, index) =>
        shiftScheduleDate(start, index),
    )
}

export const formatCalendarDate = (
    date: string,
    options: Intl.DateTimeFormatOptions,
) =>
    new Intl.DateTimeFormat(undefined, {
        ...options,
        timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`))

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()
export const getDateTimeParts = (iso: string, timeZone: string) => {
    if (!dateTimeFormatters.has(timeZone))
        dateTimeFormatters.set(
            timeZone,
            new Intl.DateTimeFormat('en-CA', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
            }),
        )
    const values = dateTimeFormatters.get(timeZone).formatToParts(new Date(iso))
    const parts = Object.fromEntries(
        values.map(part => [part.type, part.value]),
    )
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
    }
}

export const availabilityForDate = (
    availability: ProviderAvailability,
    date: string,
) => {
    const exception = availability.exceptions.find(item => item.date === date)
    if (exception)
        return {
            workingHours: exception.working_hours,
            breaks: exception.breaks,
            isException: true,
        }
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    return {
        workingHours: availability.weekly_hours.filter(
            item => item.day_of_week === weekday,
        ),
        breaks: availability.breaks.filter(
            item => item.day_of_week === weekday,
        ),
        isException: false,
    }
}

export const calendarIntervalStyle = (
    interval: ProviderAvailabilityInterval,
) => {
    const start =
        Number(interval.start_time.slice(0, 2)) * 60 +
        Number(interval.start_time.slice(3, 5))
    const end =
        interval.end_time === '24:00'
            ? 24 * 60
            : Number(interval.end_time.slice(0, 2)) * 60 +
              Number(interval.end_time.slice(3, 5))
    const visibleStart = Math.max(start, calendarStartHour * 60)
    const visibleEnd = Math.min(end, calendarEndHour * 60)
    if (visibleEnd <= visibleStart) return null
    return {
        top: `${visibleStart - calendarStartHour * 60}px`,
        height: `${visibleEnd - visibleStart}px`,
    }
}

export const formatCalendarTime = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
        minutes % 60,
    ).padStart(2, '0')}`

// Clip overnight appointments to each visible date. The API lists appointments
// by start date, so callers also fetch the preceding day's bookings.
export const layoutCalendarAppointments = (
    appointments: Appointment[],
    date: string,
    timezone = 'UTC',
) => {
    const segments = appointments
        .flatMap(appointment => {
            const start = getDateTimeParts(appointment.startsAt, timezone)
            const end = getDateTimeParts(appointment.endsAt, timezone)
            if (start.date > date || end.date < date) return []
            const from = start.date < date ? 0 : start.minutes
            const to = end.date > date ? 1440 : end.minutes
            if (to <= from) return []
            return [
                {
                    appointment,
                    start: from,
                    end: to,
                    height: Math.min(1440 - from, Math.max(30, to - from)),
                    column: 0,
                    columns: 1,
                    continuesBefore: start.date < date,
                    continuesAfter: end.date > date && end.minutes !== 0,
                },
            ]
        })
        .sort(
            (a, b) => a.start - b.start || a.appointment.id - b.appointment.id,
        )
    let group: typeof segments = []
    let columnEnds: number[] = []
    const finishGroup = () => {
        group.forEach(segment => {
            segment.columns = columnEnds.length
        })
        group = []
        columnEnds = []
    }
    for (const segment of segments) {
        if (columnEnds.length && columnEnds.every(end => end <= segment.start))
            finishGroup()
        let column = columnEnds.findIndex(end => end <= segment.start)
        if (column < 0) column = columnEnds.length
        segment.column = column
        columnEnds[column] = segment.start + segment.height
        group.push(segment)
    }
    finishGroup()
    return segments
}
