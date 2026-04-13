import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

export const getAgents = () => api.get('/agents').then(r => r.data)
export const createAgent = (data) => api.post('/agents', data).then(r => r.data)
export const updateAgent = (id, data) => api.put(`/agents/${id}`, data).then(r => r.data)
export const deleteAgent = (id) => api.delete(`/agents/${id}`).then(r => r.data)
export const setDefaultAgent = (id) => api.post(`/agents/${id}/set-default`).then(r => r.data)
export const syncAgent = (id) => api.post(`/agents/${id}/sync`).then(r => r.data)

export const getCampaigns = () => api.get('/campaigns').then(r => r.data)
export const createCampaign = (data) => api.post('/campaigns', data).then(r => r.data)
export const startCampaign = (id) => api.post(`/campaigns/${id}/start`).then(r => r.data)
export const pauseCampaign = (id) => api.post(`/campaigns/${id}/pause`).then(r => r.data)
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`).then(r => r.data)

export const getProspects = (params) => api.get('/prospects', { params }).then(r => r.data)
export const createProspect = (data) => api.post('/prospects', data).then(r => r.data)
export const importProspects = (campaignId, file) => {
  const form = new FormData()
  form.append('campaign_id', campaignId)
  form.append('file', file)
  return api.post('/prospects/import', form).then(r => r.data)
}
export const updateProspect = (id, data) => api.put(`/prospects/${id}`, data).then(r => r.data)
export const deleteProspect = (id) => api.delete(`/prospects/${id}`).then(r => r.data)
export const callProspect = (id) => api.post(`/prospects/${id}/call`).then(r => r.data)

export const getCalls = (params) => api.get('/calls', { params }).then(r => r.data)
export const getCallDetail = (id) => api.get(`/calls/${id}`).then(r => r.data)
export const makeDemoCall = (phone, agentId) =>
  api.post('/calls/demo', { phone, agent_id: agentId }).then(r => r.data)

export const getStats = () => api.get('/stats').then(r => r.data)
export const getCampaignStats = (id) => api.get(`/stats/${id}`).then(r => r.data)

export const getSettings = () => api.get('/settings').then(r => r.data)
export const saveSettings = (data) => api.post('/settings', data).then(r => r.data)

export default api
