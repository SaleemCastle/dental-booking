import PaymentReturnPage from '../../components/PaymentReturnPage'

export default function PaymentCompletePage() {
    return (
        <PaymentReturnPage
            title="Payment Verification"
            message="You have returned from the payment provider. Your payment is awaiting confirmation."
        />
    )
}
