import React from 'react'
import { BiSearch } from 'react-icons/bi'

const Searchbar = () => {
    return (
        <div className="flex flex-row rounded-md border border-clinic-line bg-white w-64 h-9 overflow-hidden px-3 items-center gap-2 shadow-sm">
            <BiSearch className="text-clinic-muted" />
            <input
                type="text"
                className="w-full flex-9 outline-none border-none bg-transparent p-0 text-sm text-clinic-ink placeholder-clinic-muted focus:ring-0"
                placeholder="Search patients, bookings, invoices"
            />
        </div>
    )
}

export default Searchbar
