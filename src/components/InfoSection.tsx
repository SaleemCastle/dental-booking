import React from 'react'
import { BsPersonFill } from 'react-icons/bs'
import { BiBell } from 'react-icons/bi'
import ActionButton from './ActionButton'
import Searchbar from './Searchbar'
import { formatTabs } from '../utils'

const InfoSection = ({ currentTab }: IInfoSectionProps) => {
    const handleClick = () => {}
    return (
        <div className="flex flex-row px-8 h-20 border-b border-clinic-line bg-white/80 justify-between items-center">
            <div className="flex flex-row gap-4 items-center">
                <span>
                    <BsPersonFill className="text-clinic-blue text-2xl" />
                </span>
                <div>
                    <p className="text-xs font-semibold uppercase text-clinic-muted">
                        Workspace
                    </p>
                    <h3 className="font-extrabold text-xl capitalize text-clinic-ink">
                        {formatTabs(currentTab).substring(1)}
                    </h3>
                </div>
            </div>

            <div className="flex flex-row gap-3 items-center">
                <Searchbar />
                <ActionButton action="add" onClick={handleClick} />
                <div className="flex h-9 w-9 border border-clinic-line bg-white items-center justify-center relative rounded-md">
                    <BiBell className="text-clinic-muted" />
                    <div className="absolute h-2 w-2 rounded-full bg-rose-500 top-2 right-2" />
                </div>
            </div>
        </div>
    )
}

export default InfoSection
