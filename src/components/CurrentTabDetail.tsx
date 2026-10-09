import React, { Fragment, useCallback, useState } from 'react'
import { SlArrowRight } from 'react-icons/sl'
import CurrentTabDetailActionBox from './CurrentTabDetailActionBox'
import { useSelector } from 'react-redux'

import { patientDataHeadings } from '../Constants'
import { AppState } from '../store/store'
import { Listbox, Transition } from '@headlessui/react'
import { BsCheck, BsChevronCompactDown } from 'react-icons/bs'

const CurrentTabDropdownFilter = () => {
    const [selectedFilter, setSelectedFilter] = useState(patientDataHeadings[0])
    return (
        <div>
            <Listbox value={selectedFilter} onChange={setSelectedFilter}>
                <div className="relative mt-1 min-w-[200px]">
                    <Listbox.Button className="text-clinic-muted relative w-full cursor-default rounded-md border border-clinic-line bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus-visible:border-clinic-blue focus-visible:ring-2 focus-visible:ring-clinic-blue/20 sm:text-sm">
                        <span className="block truncate">{selectedFilter}</span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <BsChevronCompactDown
                                className="h-5 w-5 text-clinic-muted "
                                aria-hidden="true"
                            />
                        </span>
                    </Listbox.Button>
                    <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0">
                        <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-clinic ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                            {patientDataHeadings.map((heading, index) => (
                                <Listbox.Option
                                    key={index}
                                    className={({ active }) =>
                                        `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                            active
                                                ? 'bg-clinic-sky text-clinic-blue'
                                                : 'text-clinic-ink'
                                        }`
                                    }
                                    value={heading}>
                                    {({ selected }) => (
                                        <>
                                            <span
                                                className={`block truncate ${
                                                    selected
                                                        ? 'font-medium'
                                                        : 'font-normal'
                                                }`}>
                                                {heading}
                                            </span>
                                            {selected ? (
                                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-clinic-blue">
                                                    <BsCheck
                                                        className="h-5 w-5"
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                            ) : null}
                                        </>
                                    )}
                                </Listbox.Option>
                            ))}
                        </Listbox.Options>
                    </Transition>
                </div>
            </Listbox>
        </div>
    )
}

const CurrentTabDetail = ({ currentTab }: { currentTab: string }) => {
    const handlePrint = () => {}
    const handleEdit = () => {}
    const patientListCount = useSelector(
        (state: AppState) => state.patients.patients.patients.length,
    )

    const renderContent = useCallback(
        (tab: string) => {
            switch (tab) {
                case 'patient_list':
                    return (
                        <div className="flex flex-row px-8 h-16 border-b border-clinic-line bg-white justify-between">
                            <div className="flex flex-row gap-6 items-center">
                                <div className="flex flex-row gap-3 items-baseline">
                                    <h3 className="text-2xl text-clinic-blue font-extrabold">
                                        {patientListCount}
                                    </h3>
                                    <h3 className="font-semibold text-clinic-muted">{`patient${
                                        patientListCount > 1 ? 's' : ''
                                    }`}</h3>
                                </div>
                                <span className="h-7 w-px bg-clinic-line" />
                                <h3 className="text-clinic-muted text-sm">
                                    Sort by:
                                </h3>
                                <CurrentTabDropdownFilter />
                            </div>
                            <div className="flex flex-row gap-1 items-center">
                                <CurrentTabDetailActionBox
                                    icon="print"
                                    onClick={handlePrint}
                                />
                                <CurrentTabDetailActionBox
                                    icon="filter"
                                    action="Filter"
                                    onClick={handleEdit}
                                    containerStyles="max-h-[42px] px-5"
                                />
                                <CurrentTabDetailActionBox
                                    icon="column"
                                    action="Edit Column"
                                    onClick={handleEdit}
                                    containerStyles="max-h-[42px] px-5"
                                />
                            </div>
                        </div>
                    )
                default:
                    return (
                        <div className="flex flex-row px-8 h-16 border-b border-clinic-line bg-white justify-between">
                            <div className="flex flex-row gap-6 items-center">
                                <h3 className="capitalize text-clinic-blue font-extrabold">
                                    {currentTab.split('_').join(' ')}
                                </h3>
                                <span>
                                    <SlArrowRight className="text-clinic-muted" />
                                </span>
                                <h3 className="text-clinic-muted">
                                    Today&apos;s clinic flow
                                </h3>
                            </div>

                            <div className="flex flex-row gap-1 items-center">
                                <CurrentTabDetailActionBox
                                    icon="print"
                                    onClick={handlePrint}
                                />
                                <CurrentTabDetailActionBox
                                    icon="edit"
                                    action="Edit Patient"
                                    onClick={handleEdit}
                                    containerStyles="max-h-[42px] px-5"
                                />
                            </div>
                        </div>
                    )
            }
        },
        [currentTab, patientListCount],
    )
    return <>{renderContent(currentTab)}</>
}

export default CurrentTabDetail
