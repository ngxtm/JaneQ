import { useCallback, useEffect, useState } from 'react'
import type { StudySet } from './api'

const recentLimit = 16

export function studySetHref(id: string) {
  return `#set/${encodeURIComponent(id)}`
}

export function learnHref(id: string) {
  return `${studySetHref(id)}/learn`
}

export function testHref(id: string) {
  return `${studySetHref(id)}/test`
}

function setFromHash(sets: StudySet[], hash: string) {
  // Old answer-key bookmarks now open the set overview.
  const overviewHash = hash.endsWith('/editor') ? hash.slice(0, -'/editor'.length) : hash
  return sets.find((set) => studySetHref(set.id) === overviewHash || learnHref(set.id) === hash || testHref(set.id) === hash)
}

function readRecent(key: string): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    if (Array.isArray(stored)) {
      return [...new Set(stored.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
        .slice(0, recentLimit)
    }
  } catch {
    // Browsing still works if local storage is blocked or its data is invalid.
  }
  return []
}

export function useLibraryNavigation(username: string, sets: StudySet[]) {
  const storageKey = `janeq:recent:v1:${username}`
  const [hash, setHash] = useState(() => window.location.hash)
  const [recentIds, setRecentIds] = useState(() => readRecent(storageKey))
  const selectedSet = setFromHash(sets, hash)

  const rememberCurrentSet = useCallback((availableSets: StudySet[]) => {
    const id = setFromHash(availableSets, window.location.hash)?.id
    if (id) {
      setRecentIds((ids) => ids[0] === id ? ids : [id, ...ids.filter((item) => item !== id)].slice(0, recentLimit))
    }
  }, [])

  const removeUnavailableRecentSets = useCallback((availableSets: StudySet[]) => {
    const availableIds = new Set(availableSets.map((set) => set.id))
    setRecentIds((ids) => {
      const availableRecentIds = ids.filter((id) => availableIds.has(id))
      return availableRecentIds.length === ids.length ? ids : availableRecentIds
    })
  }, [])

  useEffect(() => {
    const updateLocation = () => {
      const nextHash = window.location.hash
      setHash(nextHash)
      rememberCurrentSet(sets)
      if (nextHash.startsWith('#set/') || nextHash === '#home') window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', updateLocation)
    return () => window.removeEventListener('hashchange', updateLocation)
  }, [sets, rememberCurrentSet])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(recentIds))
    } catch {
      // Keep the current session's recent sets in memory.
    }
  }, [recentIds, storageKey])

  const byId = new Map(sets.map((set) => [set.id, set]))
  const recent = recentIds.flatMap((id) => {
    const set = byId.get(id)
    return set ? [set] : []
  })

  const viewingSet = hash.startsWith('#set/')
  return {
    selectedSet, recent, recentCount: recentIds.length,
    viewingSet, viewingLearn: viewingSet && hash.endsWith('/learn'), viewingTest: viewingSet && hash.endsWith('/test'),
    rememberCurrentSet, removeUnavailableRecentSets,
  }
}
