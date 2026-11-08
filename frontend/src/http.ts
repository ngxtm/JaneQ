import axios from 'axios'

// A relative base URL keeps requests and the session cookie on the same origin.
export const http = axios.create({ baseURL: '/api' })

export function httpStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

export function isUnauthorized(error: unknown): boolean {
  return httpStatus(error) === 401
}

export function httpErrorMessage(error: unknown, fallback: string): string {
  const data: unknown = axios.isAxiosError(error) ? error.response?.data : null
  if (typeof data !== 'object' || data === null || !('detail' in data)) return fallback
  if (typeof data.detail === 'string') return data.detail
  const issue: unknown = Array.isArray(data.detail) ? data.detail[0] : null
  if (typeof issue === 'object' && issue !== null && 'msg' in issue && typeof issue.msg === 'string') {
    return issue.msg
  }
  return fallback
}
