import axios from 'axios'

// A relative base URL keeps requests and the session cookie on the same origin.
export const http = axios.create({ baseURL: '/api' })

export function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}
