export interface CachedScoreRow {
	username: string
	wallet: string
	composite: number
	scaled: string
	breakdown: {
		pr: number
		review: number
		issue: number
		community: number
	}
}

export interface CachedScorerResult {
	repo: string
	at: number
	txHash: string | null
	details: CachedScoreRow[]
}

interface CacheState {
	byRepo: Map<string, CachedScorerResult>
}

function state(): CacheState {
	const g = globalThis as unknown as { __flintScorerCache?: CacheState }
	if (!g.__flintScorerCache) g.__flintScorerCache = { byRepo: new Map() }
	return g.__flintScorerCache
}

function key(repo: string): string {
	return repo.trim().toLowerCase()
}

export function setCachedScores(result: CachedScorerResult): void {
	state().byRepo.set(key(result.repo), result)
}

export function getCachedScores(repo: string): CachedScorerResult | null {
	return state().byRepo.get(key(repo)) ?? null
}
