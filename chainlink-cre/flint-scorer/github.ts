import { cre, ok, text, type TeeRuntime } from '@chainlink/cre-sdk'
import type { PRData, ReviewData, IssueData, AuthorAssociation, ReviewState } from './types'

const GITHUB_API = 'https://api.github.com'
const PAGE_SIZE = 10
const MAX_PAGES = 1

function githubGet(runtime: TeeRuntime<any>, token: string, path: string): any {
	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, {
			url: `${GITHUB_API}${path}`,
			method: 'GET',
			multiHeaders: {
				Authorization: { values: [`Bearer ${token}`] },
				Accept: { values: ['application/vnd.github.v3+json'] },
				'User-Agent': { values: ['flint-scorer'] },
			},
		})
		.result()

	if (!ok(response)) {
		throw new Error(`GitHub API ${path} failed: ${response.statusCode}`)
	}

	return JSON.parse(text(response))
}

function githubGetPaginated(runtime: TeeRuntime<any>, token: string, basePath: string): any[] {
	const all: any[] = []
	const separator = basePath.includes('?') ? '&' : '?'

	for (let page = 1; page <= MAX_PAGES; page++) {
		const path = `${basePath}${separator}per_page=${PAGE_SIZE}&page=${page}`
		const results = githubGet(runtime, token, path) as any[]

		if (!results || results.length === 0) break
		all.push(...results)

		if (results.length < PAGE_SIZE) break
	}

	return all
}

export function fetchMergedPRs(
	runtime: TeeRuntime<any>,
	token: string,
	owner: string,
	repo: string,
	since: string,
): PRData[] {
	const raw = githubGetPaginated(
		runtime,
		token,
		`/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc`,
	)

	const MAX_DETAILED_PRS = 4
	const prs: PRData[] = []

	const mergedCandidates: any[] = []
	for (const pr of raw) {
		if (!pr.merged_at) continue
		const mergedDate = new Date(pr.merged_at)
		if (mergedDate < new Date(since)) continue
		mergedCandidates.push(pr)
	}

	for (const pr of mergedCandidates) {
		if (prs.length >= MAX_DETAILED_PRS) break

		const detail = githubGet(
			runtime,
			token,
			`/repos/${owner}/${repo}/pulls/${pr.number}`,
		)

		const reviewsRaw = githubGet(
			runtime,
			token,
			`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`,
		) as any[]

		const reviews: ReviewData[] = reviewsRaw.map((r: any) => ({
			author: r.user?.login ?? '',
			authorAssociation: (r.author_association ?? 'NONE') as AuthorAssociation,
			state: (r.state ?? 'COMMENTED') as ReviewState,
			body: r.body ?? '',
			prAuthor: pr.user?.login ?? '',
			inlineComments: 0,
		}))

		prs.push({
			number: pr.number,
			title: pr.title ?? '',
			author: pr.user?.login ?? '',
			authorAssociation: (pr.author_association ?? 'NONE') as AuthorAssociation,
			merged: true,
			mergedAt: pr.merged_at,
			additions: detail.additions ?? 0,
			deletions: detail.deletions ?? 0,
			changedFiles: detail.changed_files ?? 0,
			reviewCount: reviewsRaw.length,
			labels: (pr.labels ?? []).map((l: any) => l.name ?? ''),
			reviews,
		})
	}

	// Also include remaining merged PRs (without detail/reviews) so reviewers
	// who only appear on the lightweight list still show up as PR authors.
	// Their PR scores use conservative defaults.
	for (const pr of mergedCandidates) {
		if (prs.find((p) => p.number === pr.number)) continue
		prs.push({
			number: pr.number,
			title: pr.title ?? '',
			author: pr.user?.login ?? '',
			authorAssociation: (pr.author_association ?? 'NONE') as AuthorAssociation,
			merged: true,
			mergedAt: pr.merged_at,
			additions: 0,
			deletions: 0,
			changedFiles: 1,
			reviewCount: 0,
			labels: (pr.labels ?? []).map((l: any) => l.name ?? ''),
			reviews: [],
		})
	}

	return prs
}

export function fetchIssues(
	runtime: TeeRuntime<any>,
	token: string,
	owner: string,
	repo: string,
	since: string,
): IssueData[] {
	const raw = githubGetPaginated(
		runtime,
		token,
		`/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&since=${since}`,
	)

	const issues: IssueData[] = []

	for (const issue of raw) {
		if (issue.pull_request) continue

		issues.push({
			number: issue.number,
			title: issue.title ?? '',
			author: issue.user?.login ?? '',
			state: issue.state ?? 'open',
			stateReason: issue.state_reason ?? null,
			labels: (issue.labels ?? []).map((l: any) => l.name ?? ''),
			commentsCount: issue.comments ?? 0,
			createdAt: issue.created_at ?? '',
			closedAt: issue.closed_at ?? null,
		})
	}

	return issues
}

export function groupPRsByAuthor(
	prs: PRData[],
): Map<string, PRData[]> {
	const map = new Map<string, PRData[]>()
	for (const pr of prs) {
		const existing = map.get(pr.author) ?? []
		existing.push(pr)
		map.set(pr.author, existing)
	}
	return map
}

export function groupReviewsByAuthor(
	prs: PRData[],
): Map<string, ReviewData[]> {
	const map = new Map<string, ReviewData[]>()
	for (const pr of prs) {
		for (const review of pr.reviews) {
			if (review.author === pr.author) continue
			const existing = map.get(review.author) ?? []
			existing.push(review)
			map.set(review.author, existing)
		}
	}
	return map
}

export function groupIssuesByAuthor(
	issues: IssueData[],
): Map<string, IssueData[]> {
	const map = new Map<string, IssueData[]>()
	for (const issue of issues) {
		const existing = map.get(issue.author) ?? []
		existing.push(issue)
		map.set(issue.author, existing)
	}
	return map
}

export function buildCommunityStats(
	prs: PRData[],
	issues: IssueData[],
): Map<string, { docPRsMerged: number; issuesTriaged: number; firstContributorHelps: number }> {
	const map = new Map<string, { docPRsMerged: number; issuesTriaged: number; firstContributorHelps: number }>()

	const getOrCreate = (author: string) => {
		if (!map.has(author)) {
			map.set(author, { docPRsMerged: 0, issuesTriaged: 0, firstContributorHelps: 0 })
		}
		return map.get(author)!
	}

	for (const pr of prs) {
		if (!pr.merged) continue
		const hasDocLabel = pr.labels.some(
			(l) => l.toLowerCase().includes('doc') || l.toLowerCase().includes('documentation'),
		)
		if (hasDocLabel) {
			getOrCreate(pr.author).docPRsMerged += 1
		}
	}

	for (const issue of issues) {
		if (issue.state === 'closed' && issue.stateReason === 'completed') {
			getOrCreate(issue.author).issuesTriaged += 1
		}
	}

	for (const pr of prs) {
		if (!pr.merged) continue
		if (pr.authorAssociation === 'FIRST_TIME_CONTRIBUTOR') {
			for (const review of pr.reviews) {
				if (review.author !== pr.author) {
					getOrCreate(review.author).firstContributorHelps += 1
				}
			}
		}
	}

	return map
}
