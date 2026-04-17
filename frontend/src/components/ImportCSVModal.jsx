import { useState, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { XMarkIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline'
import { importProspects } from '../api/client'

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zyra-card rounded-2xl border border-zyra-border w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b border-zyra-border">
          <h2 className="text-lg font-bold text-zyra-text">Importar prospectos</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-zyra-muted" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Campaña destino</label>
            <select
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"
              value={campaignId} onChange={e => setCampaignId(e.target.value)}>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => inputRef.current.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-zyra-blue bg-zyra-blue/5' : 'border-zyra-border hover:border-zyra-blue hover:bg-zyra-blue/5'
            }`}
          >
            <CloudArrowUpIcon className="w-10 h-10 mx-auto text-zyra-muted mb-2" />
            <p className="text-sm text-zyra-text">{file ? file.name : 'Arrastra tu archivo aquí o haz clic'}</p>
            <p className="text-xs text-zyra-muted mt-1">Soporta Excel (.xlsx) y CSV — columnas: name, phone, company</p>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs text-zyra-muted mb-2">Vista previa ({preview.length} filas):</p>
              <table className="w-full text-xs border border-zyra-border rounded-lg overflow-hidden">
                <thead className="bg-[#0F172A]">
                  <tr>{Object.keys(preview[0]).map(k => <th key={k} className="px-3 py-2 text-left font-medium text-zyra-muted">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-zyra-border">
                      {Object.values(row).map((v, j) => <td key={j} className="px-3 py-2 text-zyra-text">{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-zyra-muted hover:text-zyra-text">Cancelar</button>
            <button onClick={submit} disabled={!file || !campaignId || loading}
              className="px-6 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Importando...' : 'Confirmar importación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
