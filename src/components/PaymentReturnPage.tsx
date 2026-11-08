import Head from 'next/head'
import Link from 'next/link'

interface PaymentReturnPageProps {
    title: string
    message: string
}

export default function PaymentReturnPage({
    title,
    message,
}: PaymentReturnPageProps) {
    return (
        <>
            <Head>
                <title>{title}</title>
                <meta name="robots" content="noindex, nofollow" />
                <meta name="referrer" content="no-referrer" />
            </Head>
            <main className="flex min-h-screen items-center justify-center bg-clinic-canvas px-4 py-8">
                <section
                    aria-labelledby="payment-return-title"
                    className="w-full max-w-lg rounded-xl border border-clinic-line bg-white p-8 text-center shadow-clinic">
                    <h1
                        id="payment-return-title"
                        className="text-2xl font-semibold text-clinic-ink">
                        {title}
                    </h1>
                    <p className="mt-4 text-clinic-muted">{message}</p>
                    <p className="mt-3 text-sm text-clinic-muted">
                        Returning from checkout does not confirm payment or
                        cancellation. Your payment status may still be pending.
                        Please contact your clinic to confirm the transaction
                        status before making another payment.
                    </p>
                    <Link
                        href="/"
                        className="mt-6 inline-block rounded-lg bg-clinic-blue px-5 py-3 font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-blue">
                        Return to Home
                    </Link>
                </section>
            </main>
        </>
    )
}
