import React from 'react'
import { BiSearch } from 'react-icons/bi'
import { FiX } from 'react-icons/fi'

interface SearchbarProps {
    value?: string
    placeholder?: string
    onChange?: (value: string) => void
    onClear?: () => void
}

const Searchbar = ({
    value,
    placeholder = 'Search patients, bookings, invoices',
    onChange,
    onClear,
}: SearchbarProps) => {
    return (
        <div className="flex flex-row rounded-md border border-clinic-line bg-white w-64 h-9 overflow-hidden px-3 items-center gap-2 shadow-sm">
            <BiSearch className="text-clinic-muted" />
            <input
                type="text"
                className="w-full flex-9 outline-none border-none bg-transparent p-0 text-sm text-clinic-ink placeholder-clinic-muted focus:ring-0"
                placeholder={placeholder}
                value={value}
                onChange={event => onChange?.(event.target.value)}
            />
            {value ? (
                <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded text-clinic-muted hover:bg-clinic-sky hover:text-clinic-blue"
                    aria-label="Clear search"
                    onClick={onClear}>
                    <FiX />
                </button>
            ) : null}
        </div>
    )
}

export default Searchbar
