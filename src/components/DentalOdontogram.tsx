import React, { KeyboardEvent, useId } from 'react'
import {
    Odontogram as ReactOdontogram,
    ToothConditionGroup,
    ToothDetail,
} from 'react-odontogram'
import {
    DentalChartMetadata,
    DentalTooth,
    Dentition,
    ToothNumbering,
    ToothSurface,
} from '../services/dental-charts'
import {
    dentalArches,
    describeDentalTooth,
    findingColor,
    toothLabel,
} from '../lib/dental-charts'

const surfaceShapes = {
    B: '2,2 38,2 28,12 12,12',
    L: '2,38 38,38 28,28 12,28',
    left: '2,2 12,12 12,28 2,38',
    right: '38,2 28,12 28,28 38,38',
    center: '12,12 28,12 28,28 12,28',
}

export const DentalToothGlyph = ({
    id,
    state,
}: {
    id: string
    state?: DentalTooth
}) => {
    const instanceId = useId().replace(/:/g, '')
    const quadrant = Number(id[0])
    const upper = [1, 2, 5, 6].includes(quadrant)
    const mesialRight = [1, 4, 5, 8].includes(quadrant)
    const center = Number(id[1]) <= 3 ? 'I' : 'O'
    const shapes: Array<[ToothSurface, string]> = [
        ['B', upper ? surfaceShapes.B : surfaceShapes.L],
        ['L', upper ? surfaceShapes.L : surfaceShapes.B],
        ['M', mesialRight ? surfaceShapes.right : surfaceShapes.left],
        ['D', mesialRight ? surfaceShapes.left : surfaceShapes.right],
        [center, surfaceShapes.center],
    ]
    return (
        <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
            {shapes.map(([surface, points]) => {
                const colors = Array.from(
                    new Set(
                        state?.findings
                            .filter(
                                finding =>
                                    !finding.surfaces.length ||
                                    finding.surfaces.includes(surface),
                            )
                            .map(findingColor) ?? [],
                    ),
                )
                const gradient = `tooth-${instanceId}-${id}-${surface}`
                return (
                    <g key={surface}>
                        {colors.length > 1 && (
                            <defs>
                                <linearGradient id={gradient}>
                                    {colors.flatMap((color, index) => [
                                        <stop
                                            key={`${index}-start`}
                                            offset={`${
                                                (index / colors.length) * 100
                                            }%`}
                                            stopColor={color}
                                        />,
                                        <stop
                                            key={`${index}-end`}
                                            offset={`${
                                                ((index + 1) / colors.length) *
                                                100
                                            }%`}
                                            stopColor={color}
                                        />,
                                    ])}
                                </linearGradient>
                            </defs>
                        )}
                        <polygon
                            points={points}
                            fill={
                                colors.length > 1
                                    ? `url(#${gradient})`
                                    : colors[0] ?? '#ffffff'
                            }
                            stroke={state ? '#64748b' : '#94a3b8'}
                            strokeDasharray={state ? undefined : '2 2'}
                        />
                    </g>
                )
            })}
            {state && state.status !== 'present' && (
                <path
                    d={
                        state.status === 'unerupted'
                            ? 'M6 30 L34 30'
                            : 'M5 5 L35 35 M35 5 L5 35'
                    }
                    stroke="#172033"
                    strokeWidth="3"
                    strokeDasharray={
                        state.status === 'unerupted' ? '3 2' : undefined
                    }
                />
            )}
        </svg>
    )
}

const DentalOdontogram = ({
    metadata,
    dentition,
    numbering,
    teeth,
    selected,
    onSelect,
    selectionOnly = false,
}: {
    metadata: DentalChartMetadata
    dentition: Dentition
    numbering: ToothNumbering
    teeth: DentalTooth[]
    selected?: string
    onSelect: (id: string) => void
    selectionOnly?: boolean
}) => {
    const positions = metadata.dentitions[dentition]
    const arches = dentalArches(positions)
    const describe = (detail: ToothDetail) => {
        const position = positions.find(
            position => position.fdi === detail.notations.fdi,
        )
        if (!position) return 'Unknown tooth'
        if (selectionOnly) return 'Tooth ' + toothLabel(position, numbering)
        return (
            'Tooth ' +
            toothLabel(position, numbering) +
            ': ' +
            describeDentalTooth(
                teeth.find(tooth => tooth.tooth === position.fdi),
            )
        )
    }
    const conditions = teeth.reduce<ToothConditionGroup[]>((groups, tooth) => {
        const finding =
            tooth.findings.find(finding => finding.status === 'active') ??
            tooth.findings[0]
        if (!finding && tooth.status === 'present') return groups
        const color = finding
            ? findingColor(finding)
            : tooth.status === 'unerupted'
            ? '#2563eb'
            : '#64748b'
        const label = finding
            ? finding.code.replace(/_/g, ' ') +
              (finding.status === 'resolved' ? ' (resolved)' : '')
            : tooth.status
        const existing = groups.find(group => group.label === label)
        if (existing) existing.teeth.push('teeth-' + tooth.tooth)
        else
            groups.push({
                label,
                teeth: ['teeth-' + tooth.tooth],
                fillColor: color,
                outlineColor: color,
            })
        return groups
    }, [])
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const moves: Record<string, number> = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -arches[0].length,
            ArrowDown: arches[0].length,
        }
        if (!(event.key in moves)) return
        const target = event.target
        if (!(target instanceof Element)) return
        const elements = Array.from(
            event.currentTarget.querySelectorAll<SVGGElement>(
                'svg.Odontogram g[role="option"][data-tooth]',
            ),
        )
        const byId = new Map(
            elements.map(element => [element.dataset.tooth, element]),
        )
        const ordered = arches
            .flat()
            .map(position => byId.get(position.fdi))
            .filter((element): element is SVGGElement => Boolean(element))
        const index = ordered.indexOf(target as SVGGElement)
        if (index < 0) return
        event.preventDefault()
        ordered[
            Math.max(0, Math.min(ordered.length - 1, index + moves[event.key]))
        ]?.focus()
    }
    const handleChange = (selection: ToothDetail[]) => {
        const id = selection[0]?.notations.fdi ?? ''
        if (!id || positions.some(position => position.fdi === id)) onSelect(id)
    }
    return (
        <div className="space-y-3">
            <p className="text-center text-xs leading-5 text-clinic-muted">
                Patient’s right appears on the left. Select a tooth; use arrow
                keys to move between teeth.
            </p>
            <div
                role="group"
                aria-label={dentition + ' odontogram'}
                onKeyDown={handleKeyDown}
                className="mx-auto w-full max-w-[440px]">
                <ReactOdontogram
                    key={dentition + '-' + numbering}
                    dentition={dentition}
                    name="dental-chart-teeth"
                    selected={selected ? ['teeth-' + selected] : []}
                    singleSelect
                    onChange={handleChange}
                    toothAriaLabel={describe}
                    notation={numbering === 'fdi' ? 'FDI' : 'Universal'}
                    layout="circle"
                    maxTeeth={dentition === 'primary' ? 5 : 8}
                    teethConditions={conditions}
                    showLabels={conditions.length > 0}
                    showTooltip
                    tooltip={{
                        content: detail =>
                            detail ? (
                                <div className="max-w-xs space-y-2 text-sm">
                                    <p className="whitespace-pre-wrap break-words">
                                        {describe(detail)}
                                    </p>
                                    {!selectionOnly && (
                                        <DentalToothGlyph
                                            id={detail.notations.fdi}
                                            state={teeth.find(
                                                tooth =>
                                                    tooth.tooth ===
                                                    detail.notations.fdi,
                                            )}
                                        />
                                    )}
                                </div>
                            ) : null,
                    }}
                    colors={{
                        darkBlue: '#2f5bff',
                        baseBlue: '#9aa8c4',
                        lightBlue: '#dce5ff',
                    }}
                    className="dental-booking-odontogram"
                    styles={{ maxWidth: '360px', gap: '10px' }}
                />
            </div>
            <p className="text-center text-xs text-clinic-muted">
                {selectionOnly
                    ? 'Select a tooth for this planned procedure.'
                    : 'Dashed outlines are uncharted. Select a tooth to inspect its status, findings and individual surfaces.'}
            </p>
        </div>
    )
}

export default DentalOdontogram
