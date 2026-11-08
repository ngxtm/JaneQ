import { http } from '../../http'

export type User = { username: string }

function readUser(value: unknown): User {
  if (typeof value !== 'object' || value === null || !('username' in value)
      || typeof value.username !== 'string') {
    throw new Error('Unexpected session response.')
  }
  return { username: value.username }
}

export async function getUser(signal: AbortSignal): Promise<User> {
  const { data } = await http.get<unknown>('/auth/me', { signal })
  return readUser(data)
}

export async function signIn(username: string, password: string): Promise<User> {
  const { data } = await http.post<unknown>('/auth/login', { username, password })
  return readUser(data)
}

export async function signOut(): Promise<void> {
  await http.post('/auth/logout')
}
