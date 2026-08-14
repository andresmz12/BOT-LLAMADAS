import { useNavigate } from 'react-router-dom'
import { BuildingOffice2Icon } from '@heroicons/react/24/outline'

export default function OrgScopeBanner({ orgId, orgName }) {
  const navigate = useNavigate()
  if (!orgId) return null
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-sm">
      <span className="flex items-center gap-2 text-amber-300">
        <BuildingOffice2Icon className="w-4 h-4 flex-shrink-0" />
        <span><strong className="font-semibold">Viendo datos de:</strong> {orgName || `Organización #${orgId}`}</span>
      </span>
      <button
        onClick={() => navigate('/admin')}
        className="text-amber-300 hover:text-amber-100 font-medium underline underline-offset-2 flex-shrink-0"
      >
        Volver a Admin Panel
      </button>
    </div>
  )
}
