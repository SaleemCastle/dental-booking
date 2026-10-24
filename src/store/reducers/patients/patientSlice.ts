import { createSlice } from '@reduxjs/toolkit'
import { HYDRATE } from 'next-redux-wrapper'

const initialState = {
    patients: {
        status: 0,
        patients: []
    }
}

const patientSlice = createSlice({
    name: 'patients',
    initialState,
    reducers: {
        clearPatients: () => initialState,
        setPatients: (state, action) => {
            state.patients = action.payload
        }
    },
     // Special reducer for hydrating the state. Special case for next-redux-wrapper
    extraReducers: {
        [HYDRATE]: (state, action) => {
            return {
                ...state,
                ...action.payload.patients,
            }
        },
    },
})

export const { setPatients, clearPatients } = patientSlice.actions

export default patientSlice.reducer
