export type User = { username: string }

export type StudySet = {
  id: string
  title: string
  description: string
  source_kind: 'builtin' | 'custom'
  question_count: number
  configured_count: number
  status: 'draft' | 'ready'
}

class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Request failed with status ${status}.`)
    this.status = status
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) throw new ApiError(response.status)
  return response
}

async function readUser(response: Response): Promise<User> {
  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null || !('username' in value)
      || typeof value.username !== 'string') {
    throw new Error('Unexpected session response.')
  }
  return { username: value.username }
}

function isStudySet(value: unknown): value is StudySet {
  if (typeof value !== 'object' || value === null) return false
  const set = value as Partial<StudySet>
  return typeof set.id === 'string'
    && typeof set.title === 'string'
    && typeof set.description === 'string'
    && (set.source_kind === 'builtin' || set.source_kind === 'custom')
    && typeof set.question_count === 'number'
    && typeof set.configured_count === 'number'
    && (set.status === 'draft' || set.status === 'ready')
}

export async function getUser(signal: AbortSignal): Promise<User> {
  return readUser(await request('/auth/me', { signal }))
}

export async function signIn(username: string, password: string): Promise<User> {
  return readUser(await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }))
}

export async function signOut(): Promise<void> {
  await request('/auth/logout', { method: 'POST' })
}

export async function getStudySets(signal: AbortSignal): Promise<StudySet[]> {
  const response = await request('/study-sets', { signal })
  const value: unknown = await response.json()
  if (!Array.isArray(value) || !value.every(isStudySet)) {
    throw new Error('Unexpected study sets response.')
  }
  return value
}
