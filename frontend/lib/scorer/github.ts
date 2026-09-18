import type { PRData, ReviewData, IssueData, AuthorAssociation, ReviewState, CommunityStats } from "./types"

const GITHUB_API = "https://api.github.com"
const PAGE_SIZE = 10
const MAX_PAGES = 1
const MAX_DETAILED_PRS = 4

async function githubGet(token: string, path: string): Promise<any> {
	const res = await fetch(`${GITHUB_API}${path}`, {
		headers: {
			Authorization: `token ${token}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "flint-scorer",
		},
	})
	if (!res.ok) {
		throw new Error(`GitHub API ${path} failed: ${res.status}`)
	}
	return res.json()
}

async function githubGetPaginated(token: string, basePath: string): Promise<any[]> {
	const all: any[] = []
	const separator = basePath.includes("?") ? "&" : "?"

	for (let page = 1; page <= MAX_PAGES; page++) {
		const path = `${basePath}${separator}per_page=${PAGE_SIZE}&page=${page}`
		const results = (await githubGet(token, path)) as any[]

		if (!results || results.length === 0) break
		all.push(...results)

		if (results.length < PAGE_SIZE) break
	}

	return all
}

export async function fetchMergedPRs(
	token: string,
	owner: string,
	repo: string,
	since: string,
): Promise<PRData[]> {
	const raw = await githubGetPaginated(
		token,
		`/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc`,
	)

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

		const [detail, reviewsRaw] = await Promise.all([
			githubGet(token, `/repos/${owner}/${repo}/pulls/${pr.number}`),
			githubGet(token, `/repos/${owner}/${repo}/pulls/${pr.number}/reviews`) as Promise<any[]>,
		])

		const reviews: ReviewData[] = reviewsRaw.map((r: any) => ({
			author: r.user?.login ?? "",
			authorAssociation: (r.author_association ?? "NONE") as AuthorAssociation,
			state: (r.state ?? "COMMENTED") as ReviewState,
			body: r.body ?? "",
			prAuthor: pr.user?.login ?? "",
			inlineComments: 0,
		}))

		prs.push({
			number: pr.number,
			title: pr.title ?? "",
			author: pr.user?.login ?? "",
			authorAssociation: (pr.author_association ?? "NONE") as AuthorAssociation,
			merged: true,
			mergedAt: pr.merged_at,
			additions: detail.additions ?? 0,
			deletions: detail.deletions ?? 0,
			changedFiles: detail.changed_files ?? 0,
			reviewCount: reviewsRaw.length,
			labels: (pr.labels ?? []).map((l: any) => l.name ?? ""),
			reviews,
		})
	}

	for (const pr of mergedCandidates) {
		if (prs.find((p) => p.number === pr.number)) continue
		prs.push({
			number: pr.number,
			title: pr.title ?? "",
			author: pr.user?.login ?? "",
			authorAssociation: (pr.author_association ?? "NONE") as AuthorAssociation,
			merged: true,
			mergedAt: pr.merged_at,
			additions: 0,
			deletions: 0,
			changedFiles: 1,
			reviewCount: 0,
			labels: (pr.labels ?? []).map((l: any) => l.name ?? ""),
			reviews: [],
		})
	}

	return prs
}

export async function fetchIssues(
	token: string,
	owner: string,
	repo: string,
	since: string,
): Promise<IssueData[]> {
	const raw = await githubGetPaginated(
		token,
		`/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&since=${since}`,
	)

	const issues: IssueData[] = []

	for (const issue of raw) {
		if (issue.pull_request) continue

		issues.push({
			number: issue.number,
			title: issue.title ?? "",
			author: issue.user?.login ?? "",
			state: issue.state ?? "open",
			stateReason: issue.state_reason ?? null,
			labels: (issue.labels ?? []).map((l: any) => l.name ?? ""),
			commentsCount: issue.comments ?? 0,
			createdAt: issue.created_at ?? "",
			closedAt: issue.closed_at ?? null,
		})
	}

	return issues
}

/** All-time commit counts by lowercase login. One GitHub call. */
export async function fetchCommitCounts(
	token: string,
	owner: string,
	repo: string,
): Promise<Map<string, number>> {
	const map = new Map<string, number>()
	try {
		const raw = (await githubGet(
			token,
			`/repos/${owner}/${repo}/contributors?per_page=100`,
		)) as any[]
		for (const c of raw ?? []) {
			if (c?.type !== "User" || !c.login) continue
			map.set(String(c.login).toLowerCase(), Number(c.contributions) || 0)
		}
	} catch (err) {
		console.error("[scorer] commit counts unavailable:", err)
	}
	return map
}

export function groupPRsByAuthor(prs: PRData[]): Map<string, PRData[]> {
	const map = new Map<string, PRData[]>()
	for (const pr of prs) {
		const existing = map.get(pr.author) ?? []
		existing.push(pr)
		map.set(pr.author, existing)
	}
	return map
}

export function groupReviewsByAuthor(prs: PRData[]): Map<string, ReviewData[]> {
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

export function groupIssuesByAuthor(issues: IssueData[]): Map<string, IssueData[]> {
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
): Map<string, CommunityStats> {
	const map = new Map<string, CommunityStats>()

	const getOrCreate = (author: string) => {
		if (!map.has(author)) {
			map.set(author, { docPRsMerged: 0, issuesTriaged: 0, firstContributorHelps: 0, commits: 0 })
		}
		return map.get(author)!
	}

	for (const pr of prs) {
		if (!pr.merged) continue
		const hasDocLabel = pr.labels.some(
			(l) => l.toLowerCase().includes("doc") || l.toLowerCase().includes("documentation"),
		)
		if (hasDocLabel) {
			getOrCreate(pr.author).docPRsMerged += 1
		}
	}

	for (const issue of issues) {
		if (issue.state === "closed" && issue.stateReason === "completed") {
			getOrCreate(issue.author).issuesTriaged += 1
		}
	}

	for (const pr of prs) {
		if (!pr.merged) continue
		if (pr.authorAssociation === "FIRST_TIME_CONTRIBUTOR") {
			for (const review of pr.reviews) {
				if (review.author !== pr.author) {
					getOrCreate(review.author).firstContributorHelps += 1
				}
			}
		}
	}

	return map
}
