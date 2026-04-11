import axios from 'axios'

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api/admin`,
})

api.interceptors.request.use((config) => {
  const key = localStorage.getItem('adminKey')
  if (key) {
    config.headers['X-Admin-Key'] = key
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminKey')
      window.location.href = '/login?error=1'
    }
    return Promise.reject(error)
  }
)

export default api
