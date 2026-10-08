import React from 'react'
import { AiOutlinePlus } from 'react-icons/ai'

const ActionButton = ({
    action,
    onClick,
    containerStyles,
}: {
    action: 'add' | 'like'
    onClick: () => void
    containerStyles?: string
}) => {
    return (
        <button
            className={`outline-0 bg-clinic-blue hover:bg-blue-700 flex rounded-md h-9 w-9 items-center justify-center shadow-row transition-colors ${
                containerStyles ? containerStyles : ''
            }`}
            onClick={onClick}>
            {action === 'add' ? (
                <AiOutlinePlus className="text-white font-bold" />
            ) : null}
        </button>
    )
}

export default ActionButton
