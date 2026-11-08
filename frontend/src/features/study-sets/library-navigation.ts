import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { replaceStudySetAlias, studySetHref, type LibraryRoute } from '../navigation/app-location'
import type { StudySet } from './api'

const recentLimit = 16

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

export function useLibraryNavigation(username: string, sets: StudySet[], route: LibraryRoute) {
  const storageKey = `janeq:recent:v1:${username}`
  const [recentIds, setRecentIds] = useState(() => readRecent(storageKey))
  const selectedSet = route.kind === 'set'
    ? sets.find((set) => set.id === route.id) ?? sets.find((set) => set.legacy_id === route.id)
    : undefined
  const selectedId = selectedSet?.id

  if (selectedId && recentIds[0] !== selectedId) {
    setRecentIds([selectedId, ...recentIds.filter((id) => id !== selectedId)].slice(0, recentLimit))
  }

  const removeUnavailableRecentSets = useCallback((availableSets: StudySet[]) => {
    const idsByKey = new Map(availableSets.map((set) => [set.id, set.id]))
    for (const set of availableSets) {
      if (set.legacy_id && !idsByKey.has(set.legacy_id)) idsByKey.set(set.legacy_id, set.id)
    }
    setRecentIds((ids) => {
      const availableRecentIds = [...new Set(ids.flatMap((id) => idsByKey.get(id) ?? []))]
      return availableRecentIds.length === ids.length && availableRecentIds.every((id, index) => id === ids[index])
        ? ids : availableRecentIds
    })
  }, [])

  useLayoutEffect(() => {
    // Scroll after the destination commits so the outgoing view cannot jump first.
    if (route.kind === 'set' || !window.location.hash) window.scrollTo(0, 0)
  }, [route])

  useEffect(() => {
    if (route.kind === 'set' && selectedId && route.id !== selectedId) {
      replaceStudySetAlias(studySetHref(selectedId, route.mode === 'overview' ? undefined : route.mode))
    }
  }, [route, selectedId])

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

  const viewingSet = route.kind === 'set'
  return {
    selectedSet, recent, recentCount: recentIds.length,
    viewingSet, viewingLearn: viewingSet && route.mode === 'learn', viewingTest: viewingSet && route.mode === 'test',
    removeUnavailableRecentSets,
  }
}
