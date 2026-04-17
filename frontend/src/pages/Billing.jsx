import { CreditCardIcon } from '@heroicons/react/24/outline'

export default function Billing() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-zyra-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <CreditCardIcon className="w-8 h-8 text-zyra-blue" />
        </div>
        <h1 className="text-2xl font-bold text-zyra-text mb-2">Facturación</h1>
        <p className="text-zyra-muted text-sm">Próximamente — gestión de planes y pagos estará disponible aquí.</p>
      </div>
    </div>
  )
}
