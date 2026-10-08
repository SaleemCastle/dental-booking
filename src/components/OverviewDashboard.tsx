import React, { useEffect, useState } from 'react'
import { BsCheckCircleFill } from 'react-icons/bs'
import { MdOutlineCalendarMonth, MdOutlinePayments } from 'react-icons/md'
import { AiOutlineClockCircle } from 'react-icons/ai'
import {
    DashboardSummary,
    getDashboardSummary,
    getDashboardToneClass,
} from '../services/dashboard'

const OverviewDashboard = () => {
    const [summary, setSummary] = useState<DashboardSummary | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let isMounted = true

        getDashboardSummary()
            .then(dashboardSummary => {
                if (!isMounted) {
                    return
                }

                setSummary(dashboardSummary)
                setError('')
            })
            .catch(() => {
                if (!isMounted) {
                    return
                }

                setError('Unable to load dashboard summary.')
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false)
                }
            })

        return () => {
            isMounted = false
        }
    }, [])

    const collectionRate = Math.min(
        Math.max(summary?.collectionRate ?? 0, 0),
        100,
    )

    return (
        <section className="px-8 py-6">
            <div className="grid grid-cols-4 gap-4">
                {isLoading
                    ? Array.from({ length: 4 }).map((_, index) => (
                          <div
                              key={index}
                              className="rounded-md border border-clinic-line bg-white p-4 shadow-sm">
                              <div className="mb-4 h-6 w-24 rounded bg-clinic-canvas" />
                              <div className="h-9 w-20 rounded bg-clinic-canvas" />
                              <div className="mt-2 h-5 w-32 rounded bg-clinic-canvas" />
                          </div>
                      ))
                    : summary?.metrics.map(metric => (
                          <div
                              key={metric.label}
                              className="rounded-md border border-clinic-line bg-white p-4 shadow-sm">
                              <div
                                  className={`mb-4 inline-flex rounded px-2 py-1 text-xs font-bold ${getDashboardToneClass(
                                      metric.tone,
                                  )}`}>
                                  {metric.label}
                              </div>
                              <div className="text-3xl font-extrabold text-clinic-ink">
                                  {metric.value}
                              </div>
                              <p className="mt-1 text-sm text-clinic-muted">
                                  {metric.detail}
                              </p>
                          </div>
                      ))}
            </div>

            {error && (
                <div className="mt-6 rounded-md border border-clinic-rose bg-white p-4 text-sm font-bold text-rose-700 shadow-sm">
                    {error}
                </div>
            )}

            <div className="mt-6 grid grid-cols-[1.7fr_1fr] gap-6">
                <div className="rounded-md border border-clinic-line bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
                        <div>
                            <p className="text-xs font-bold uppercase text-clinic-muted">
                                Reservations
                            </p>
                            <h3 className="text-lg font-extrabold text-clinic-ink">
                                Today&apos;s treatment flow
                            </h3>
                        </div>
                        <MdOutlineCalendarMonth className="text-2xl text-clinic-blue" />
                    </div>
                    <div className="divide-y divide-clinic-line">
                        {isLoading && (
                            <div className="px-5 py-8 text-sm font-bold text-clinic-muted">
                                Loading today&apos;s appointments...
                            </div>
                        )}

                        {!isLoading &&
                            summary?.todayAppointments.map(appointment => (
                                <div
                                    key={appointment.id}
                                    className="grid grid-cols-[72px_1fr_150px_120px] items-center px-5 py-4">
                                    <p className="text-sm font-bold text-clinic-ink">
                                        {appointment.time}
                                    </p>
                                    <div>
                                        <p className="font-bold text-clinic-ink">
                                            {appointment.patient}
                                        </p>
                                        <p className="text-sm text-clinic-muted">
                                            {appointment.treatment}
                                        </p>
                                    </div>
                                    <span
                                        className={`w-fit rounded px-2 py-1 text-xs font-bold ${getDashboardToneClass(
                                            appointment.statusTone,
                                        )}`}>
                                        {appointment.status}
                                    </span>
                                    <button className="rounded-md border border-clinic-line px-3 py-2 text-sm font-bold text-clinic-muted hover:border-clinic-blue hover:text-clinic-blue">
                                        View
                                    </button>
                                </div>
                            ))}

                        {!isLoading &&
                            summary?.todayAppointments.length === 0 && (
                                <div className="px-5 py-8 text-sm font-bold text-clinic-muted">
                                    No appointments scheduled for today.
                                </div>
                            )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-md border border-clinic-line bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase text-clinic-muted">
                                    Revenue
                                </p>
                                <h3 className="text-lg font-extrabold text-clinic-ink">
                                    Payment health
                                </h3>
                            </div>
                            <MdOutlinePayments className="text-2xl text-clinic-blue" />
                        </div>
                        <div className="mt-5 h-2 overflow-hidden rounded bg-clinic-canvas">
                            <div
                                className="h-full rounded bg-clinic-blue"
                                style={{ width: `${collectionRate}%` }}
                            />
                        </div>
                        <p className="mt-1 text-sm text-clinic-muted">
                            {isLoading
                                ? 'Loading collection rate...'
                                : `${summary?.collectionRate ?? 0}% collected from today's appointments.`}
                        </p>
                    </div>

                    <div className="rounded-md border border-clinic-line bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <AiOutlineClockCircle className="text-xl text-clinic-blue" />
                            <h3 className="font-extrabold text-clinic-ink">
                                Staff worklist
                            </h3>
                        </div>
                        <div className="mt-4 space-y-3">
                            {isLoading && (
                                <p className="text-sm font-bold text-clinic-muted">
                                    Loading staff worklist...
                                </p>
                            )}

                            {!isLoading &&
                                summary?.staffWorklist.map(item => (
                                    <div
                                        key={item}
                                        className="flex gap-3 text-sm text-clinic-muted">
                                        <BsCheckCircleFill className="mt-0.5 shrink-0 text-clinic-teal" />
                                        <span>{item}</span>
                                    </div>
                                ))}

                            {!isLoading && summary?.staffWorklist.length === 0 && (
                                <p className="text-sm font-bold text-clinic-muted">
                                    No staff workload items for today.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default OverviewDashboard
