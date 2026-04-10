import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { XMarkIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline'
import { importProspects } from '../api/client'

export default function ImportCSVModal({ campaigns, onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || '')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleFile = (f) => {
    setFile(f)
    Papa.parse(f, { header: true, preview: 5, skipEmptyLines: true, complete: ({ data }) => setPreview(data) })
  }

  const submit = async () => {
    if (!file || !campaignId) return
    setLoading(true)
    try {
      const result = await importProspects(campaignId, file)
      alert(`${result.imported} prospectos importados`)
      onImported()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">Importar CSV</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaña destino</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
              value={campaignId} onChange={e => setCampaignId(e.target.value)}>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => inputRef.current.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${dragging ? 'border-gold bg-gold/5' : 'border-gray-200 hover:border-gold'}`}
          >
            <CloudArrowUpIcon className="w-10 h-10 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">{file ? file.name : 'Arrastra tu CSV aquí o haz clic'}</p>
            <p className="text-xs text-gray-400 mt-1">Columnas: name, phone, company</p>
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs text-gray-500 mb-2">Vista previa ({preview.length} filas):</p>
              <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>{Object.keys(preview[0]).map(k => <th key={k} className="px-3 py-2 text-left font-medium text-gray-600">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {Object.values(row).map((v, j) => <td key={j} className="px-3 py-2 text-gray-700">{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
            <button onClick={submit} disabled={!file || !campaignId || loading}
              className="px-6 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Importando...' : 'Confirmar importación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
