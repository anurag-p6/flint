import { keccak256, encodePacked, type Hex } from "viem"
import type { ContributorMapping, ContributorScore, Complexity, ReviewData, IssueData, CommunityStats } from "./types"
import { fetchMergedPRs, fetchIssues, fetchCommitCounts, groupReviewsByAuthor, groupIssuesByAuthor, buildCommunityStats } from "./github"
import { classifyAllPRs } from "./llm"
import { scoreAllContributors } from "./scoring"

export interface ScorerResult {
	repoId: Hex
	contributors: Hex[]
	scores: bigint[]
	details: ContributorScore[]
}

export async function runScorer(params: {
	owner: string
	repo: string
	cycleDays?: number
	githubToken: string
	llmApiKey: string
	llmApiUrl?: string
	llmModel?: string
	contributorMapping: ContributorMapping
}): Promise<ScorerResult> {
	const {
		owner,
		repo,
		cycleDays = 30,
		githubToken,
		llmApiKey,
		contributorMapping,
	} = params

	const now = new Date()
	const sinceDate = new Date(now.getTime() - cycleDays * 24 * 60 * 60 * 1000)
	const since = sinceDate.toISOString()

	console.log(`[scorer] Scoring ${owner}/${repo} for last ${cycleDays} days`)

	const [prs, issues, commitCounts] = await Promise.all([
		fetchMergedPRs(githubToken, owner, repo, since),
		fetchIssues(githubToken, owner, repo, since),
		fetchCommitCounts(githubToken, owner, repo),
	])
	console.log(
		`[scorer] Fetched ${prs.length} merged PRs, ${issues.length} issues, ${commitCounts.size} committers`,
	)

	let complexityResults: Map<number, { complexity: Complexity }>

	if (llmApiKey) {
		complexityResults = await classifyAllPRs(
			llmApiKey,
			prs,
			params.llmApiUrl,
			params.llmModel,
		)
		console.log(`[scorer] Classified ${complexityResults.size} PRs via LLM`)
	} else {
		complexityResults = new Map()
		for (const pr of prs) {
			complexityResults.set(pr.number, { complexity: "medium" })
		}
		console.log(`[scorer] No LLM key — using default complexity for ${prs.length} PRs`)
	}

	const prsByAuthor = new Map<string, { pr: (typeof prs)[0]; complexity: Complexity }[]>()
	for (const pr of prs) {
		const complexity = complexityResults.get(pr.number)?.complexity ?? "medium"
		const author = pr.author.toLowerCase()
		const existing = prsByAuthor.get(author) ?? []
		existing.push({ pr, complexity })
		prsByAuthor.set(author, existing)
	}

	const reviewsByAuthor = groupReviewsByAuthor(prs)
	const issuesByAuthor = groupIssuesByAuthor(issues)
	const communityStats = buildCommunityStats(prs, issues)

	const reviewsLower = new Map<string, ReviewData[]>()
	for (const [author, reviews] of reviewsByAuthor) {
		reviewsLower.set(author.toLowerCase(), reviews)
	}
	const issuesLower = new Map<string, IssueData[]>()
	for (const [author, list] of issuesByAuthor) {
		issuesLower.set(author.toLowerCase(), list)
	}
	const communityLower = new Map<string, CommunityStats>()
	for (const [author, stats] of communityStats) {
		const key = author.toLowerCase()
		communityLower.set(key, { ...stats, commits: commitCounts.get(key) ?? stats.commits ?? 0 })
	}

	const contributorScores = scoreAllContributors(
		prsByAuthor,
		reviewsLower,
		issuesLower,
		communityLower,
		contributorMapping,
		now,
		commitCounts,
	)

	console.log(`[scorer] Scored ${contributorScores.length} contributors`)
	for (const cs of contributorScores) {
		console.log(
			`[scorer]   ${cs.githubUsername}: composite=${cs.compositeScore.toFixed(4)} | PR=${cs.prScore.toFixed(3)} Review=${cs.reviewScore.toFixed(3)} Issue=${cs.issueScore.toFixed(3)} Community=${cs.communityScore.toFixed(3)}`,
		)
	}

	const repoId = keccak256(encodePacked(["string"], [`${owner}/${repo}`]))
	const contributors = contributorScores.map((cs) => cs.address as Hex)
	const scores = contributorScores.map((cs) => cs.scaledScore)

	return { repoId, contributors, scores, details: contributorScores }
}
