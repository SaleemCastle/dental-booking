import PaymentReturnPage from '../../components/PaymentReturnPage'

export default function PaymentCancelPage() {
    return (
        <PaymentReturnPage
            title="Checkout Closed"
            message="You have returned from the payment provider after leaving checkout."
        />
    )
}
