import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data)
export const logout = () => {
  api.post('/auth/logout').catch(() => {})
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.location.href = '/login'
}
export const getMe = () => api.get('/auth/me').then(r => r.data)

// Admin
export const getOrganizations = () => api.get('/admin/organizations').then(r => r.data)
export const createOrganization = (data) => api.post('/admin/organizations', data).then(r => r.data)
export const updateOrganization = (id, data) => api.put(`/admin/organizations/${id}`, data).then(r => r.data)
export const getUsers = () => api.get('/admin/users').then(r => r.data)
export const createUser = (data) => api.post('/admin/users', data).then(r => r.data)
export const updateUser = (id, data) => api.put(`/admin/users/${id}`, data).then(r => r.data)
export const deleteUser = (id) => api.delete(`/admin/users/${id}`).then(r => r.data)

// Agents
export const getAgents = () => api.get('/agents').then(r => r.data)
export const createAgent = (data) => api.post('/agents', data).then(r => r.data)
export const updateAgent = (id, data) => api.put(`/agents/${id}`, data).then(r => r.data)
export const deleteAgent = (id) => api.delete(`/agents/${id}`).then(r => r.data)
export const setDefaultAgent = (id) => api.post(`/agents/${id}/set-default`).then(r => r.data)
export const syncAgent = (id) => api.post(`/agents/${id}/sync`).then(r => r.data)

// Campaigns
export const getCampaigns = () => api.get('/campaigns').then(r => r.data)
export const createCampaign = (data) => api.post('/campaigns', data).then(r => r.data)
export const startCampaign = (id) => api.post(`/campaigns/${id}/start`).then(r => r.data)
export const pauseCampaign = (id) => api.post(`/campaigns/${id}/pause`).then(r => r.data)
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`).then(r => r.data)

// Prospects
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

// Calls
export const getCalls = (params) => api.get('/calls', { params }).then(r => r.data)
export const getCallDetail = (id) => api.get(`/calls/${id}`).then(r => r.data)
export const makeDemoCall = (phone, agentId) =>
  api.post('/calls/demo', { phone, agent_id: agentId }).then(r => r.data)

// Org Users
export const getOrgUsers = () => api.get('/users').then(r => r.data)
export const createOrgUser = (data) => api.post('/users', data).then(r => r.data)
export const updateOrgUser = (id, data) => api.put(`/users/${id}`, data).then(r => r.data)
export const deactivateOrgUser = (id) => api.delete(`/users/${id}`).then(r => r.data)

// Stats
export const getStats = () => api.get('/stats').then(r => r.data)
export const getCampaignStats = (id) => api.get(`/stats/${id}`).then(r => r.data)

// Settings
export const getSettings = () => api.get('/settings').then(r => r.data)
export const saveSettings = (data) => api.post('/settings', data).then(r => r.data)

export default api
