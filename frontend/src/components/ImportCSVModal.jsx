import { useState, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { XMarkIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline'
import { importProspects } from '../api/client'

const COUNTRIES = [
  { code: '+1',   flag: '🇺🇸', label: 'Estados Unidos / Canadá (+1)' },
  { code: '+52',  flag: '🇲🇽', label: 'México (+52)' },
  { code: '+57',  flag: '🇨🇴', label: 'Colombia (+57)' },
  { code: '+54',  flag: '🇦🇷', label: 'Argentina (+54)' },
  { code: '+56',  flag: '🇨🇱', label: 'Chile (+56)' },
  { code: '+51',  flag: '🇵🇪', label: 'Perú (+51)' },
  { code: '+34',  flag: '🇪🇸', label: 'España (+34)' },
  { code: '+55',  flag: '🇧🇷', label: 'Brasil (+55)' },
  { code: '+58',  flag: '🇻🇪', label: 'Venezuela (+58)' },
  { code: '+593', flag: '🇪🇨', label: 'Ecuador (+593)' },
  { code: '+502', flag: '🇬🇹', label: 'Guatemala (+502)' },
  { code: '+503', flag: '🇸🇻', label: 'El Salvador (+503)' },
  { code: '+504', flag: '🇭🇳', label: 'Honduras (+504)' },
  { code: '+505', flag: '🇳🇮', label: 'Nicaragua (+505)' },
  { code: '+506', flag: '🇨🇷', label: 'Costa Rica (+506)' },
  { code: '+507', flag: '🇵🇦', label: 'Panamá (+507)' },
  { code: '+53',  flag: '🇨🇺', label: 'Cuba (+53)' },
  { code: '+1809',flag: '🇩🇴', label: 'Rep. Dominicana (+1809)' },
  { code: '+598', flag: '🇺🇾', label: 'Uruguay (+598)' },
  { code: '+595', flag: '🇵🇾', label: 'Paraguay (+595)' },
  { code: '+591', flag: '🇧🇴', label: 'Bolivia (+591)' },
]

function parseExcelPreview(file, onDone) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const wb = XLSX.read(e.target.result, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
    onDone(data.slice(0, 5))
  }
  reader.readAsArrayBuffer(file)
}

export default function ImportCSVModal({ campaigns, onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || '')
  const [countryCode, setCountryCode] = useState('+1')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleFile = (f) => {
    setFile(f)
    const name = f.name.toLowerCase()
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      parseExcelPreview(f, setPreview)
    } else {
      Papa.parse(f, { header: true, preview: 5, skipEmptyLines: true, complete: ({ data }) => setPreview(data) })
    }
  }

  const submit = async () => {
    if (!file || !campaignId) return
    setLoading(true)
    try {
      const result = await importProspects(campaignId, file, countryCode)
      alert(`${result.imported} prospectos importados`)
      onImported()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  const selectedCountry = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">Importar prospectos</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Campaña destino</label>
              <select className="z-input" value={campaignId} onChange={e => setCampaignId(e.target.value)}>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">País de los números</label>
              <select className="z-input" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Se añadirá <span className="font-mono text-z-blue">{countryCode}</span> a números sin código de país
              </p>
            </div>
          </div>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => inputRef.current.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-z-blue bg-z-blue/10' : 'border-z-border hover:border-z-blue/50'
            }`}
          >
            <CloudArrowUpIcon className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-300">{file ? file.name : 'Arrastra tu archivo aquí o haz clic'}</p>
            <p className="text-xs text-slate-500 mt-1">Columnas: <span className="font-mono">name, phone, company</span> — o — <span className="font-mono">Contact, Phone Number, Name</span></p>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs text-slate-500 mb-2">Vista previa ({preview.length} filas) — los teléfonos sin <span className="font-mono">{countryCode}</span> lo recibirán automáticamente:</p>
              <table className="w-full text-xs border border-z-border rounded-lg overflow-hidden">
                <thead className="bg-black/20">
                  <tr>{Object.keys(preview[0]).map(k => <th key={k} className="px-3 py-2 text-left font-medium text-slate-400">{k}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-z-border">
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => <td key={j} className="px-3 py-2 text-slate-300">{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="z-btn-ghost">Cancelar</button>
            <button onClick={submit} disabled={!file || !campaignId || loading} className="z-btn-primary disabled:opacity-50">
              {loading ? 'Importando...' : 'Confirmar importación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
