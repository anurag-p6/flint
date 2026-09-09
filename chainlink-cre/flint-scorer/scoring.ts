import type {
	PRData,
	ReviewData,
	IssueData,
	Complexity,
	CommunityStats,
	ContributorScore,
	ContributorMapping,
} from './types'

const SCORE_SCALE = 1_000_000n

const WEIGHTS = {
	PR: 0.45,
	REVIEW: 0.30,
	ISSUE: 0.15,
	COMMUNITY: 0.10,
} as const

const COMPLEXITY_BASE_POINTS: Record<Complexity, number> = {
	trivial: 1.0,
	medium: 1.5,
	high: 2.0,
	critical: 3.0,
}

const REVIEW_TYPE_WEIGHT: Record<string, number> = {
	CHANGES_REQUESTED: 1.0,
	COMMENTED: 0.7,
	APPROVED: 0.5,
	DISMISSED: 0.3,
}

const LABEL_WEIGHT: Record<string, number> = {
	security: 1.5,
	critical: 1.5,
	bug: 1.0,
	enhancement: 0.8,
	question: 0.5,
}

const DEFAULT_LABEL_WEIGHT = 0.7

function weeksBetween(dateStr: string, now: Date): number {
	const d = new Date(dateStr)
	return Math.max(0, (now.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

export function calculatePRScore(
	pr: PRData,
	complexity: Complexity,
	now: Date,
): number {
	if (!pr.merged || !pr.mergedAt) return 0
	if (pr.reviewCount < 1) return 0

	const basePoints = COMPLEXITY_BASE_POINTS[complexity]
	const reviewRounds = Math.min(pr.reviewCount, 5)
	const reviewDepthMultiplier = 1 + 0.15 * reviewRounds

	const sizeInput = pr.changedFiles + pr.additions / 100 + 1
	const logSizeFactor = Math.log2(sizeInput) / Math.log2(10)

	const weeksSinceMerge = weeksBetween(pr.mergedAt, now)
	const recencyDecay = Math.exp(-0.05 * weeksSinceMerge)

	return basePoints * reviewDepthMultiplier * logSizeFactor * recencyDecay
}

export function calculateReviewScore(review: ReviewData): number {
	if (review.author === review.prAuthor) return 0

	const typeWeight = REVIEW_TYPE_WEIGHT[review.state] ?? 0.3
	const inlineComments = Math.min(review.inlineComments, 10)
	const depthBonus = 1 + 0.1 * inlineComments

	const isInternal =
		review.authorAssociation === 'MEMBER' ||
		review.authorAssociation === 'COLLABORATOR'
	const authorityFactor = isInternal ? 1.0 : 0.7

	return typeWeight * depthBonus * authorityFactor
}

export function calculateIssueScore(issue: IssueData): number {
	const basePoints = 1.0

	let resolutionBonus = 1.0
	if (issue.stateReason === 'completed') resolutionBonus = 1.5
	else if (issue.stateReason === 'not_planned') resolutionBonus = 0.5
	else if (issue.stateReason === 'duplicate') resolutionBonus = 0.2

	let labelWeight = DEFAULT_LABEL_WEIGHT
	for (const label of issue.labels) {
		const l = label.toLowerCase()
		for (const [key, weight] of Object.entries(LABEL_WEIGHT)) {
			if (l.includes(key)) {
				labelWeight = Math.max(labelWeight, weight)
			}
		}
	}

	const otherComments = Math.min(issue.commentsCount, 20)
	const engagementFactor = 1 + 0.05 * otherComments

	return basePoints * resolutionBonus * labelWeight * engagementFactor
}

export function calculateCommunityScore(stats: CommunityStats): number {
	return (
		0.5 * stats.docPRsMerged +
		0.3 * stats.issuesTriaged +
		0.2 * stats.firstContributorHelps
	)
}

export function calculateCompositeScore(
	prScore: number,
	reviewScore: number,
	issueScore: number,
	communityScore: number,
): number {
	return (
		WEIGHTS.PR * prScore +
		WEIGHTS.REVIEW * reviewScore +
		WEIGHTS.ISSUE * issueScore +
		WEIGHTS.COMMUNITY * communityScore
	)
}

export function scaleForContract(score: number): bigint {
	return BigInt(Math.round(score * Number(SCORE_SCALE)))
}

export function scoreAllContributors(
	prsByAuthor: Map<string, { pr: PRData; complexity: Complexity }[]>,
	reviewsByAuthor: Map<string, ReviewData[]>,
	issuesByAuthor: Map<string, IssueData[]>,
	communityByAuthor: Map<string, CommunityStats>,
	contributorMapping: ContributorMapping,
	now: Date,
): ContributorScore[] {
	const allAuthors = new Set<string>([
		...prsByAuthor.keys(),
		...reviewsByAuthor.keys(),
		...issuesByAuthor.keys(),
	])

	const results: ContributorScore[] = []

	for (const username of allAuthors) {
		const address = contributorMapping[username]
		if (!address) continue

		const prs = prsByAuthor.get(username) ?? []
		const reviews = reviewsByAuthor.get(username) ?? []
		const issues = issuesByAuthor.get(username) ?? []
		const community = communityByAuthor.get(username) ?? {
			docPRsMerged: 0,
			issuesTriaged: 0,
			firstContributorHelps: 0,
		}

		let prScore = 0
		for (const { pr, complexity } of prs) {
			prScore += calculatePRScore(pr, complexity, now)
		}

		let reviewScore = 0
		for (const review of reviews) {
			reviewScore += calculateReviewScore(review)
		}

		let issueScore = 0
		for (const issue of issues) {
			issueScore += calculateIssueScore(issue)
		}

		const communityScore = calculateCommunityScore(community)
		const compositeScore = calculateCompositeScore(
			prScore,
			reviewScore,
			issueScore,
			communityScore,
		)

		results.push({
			githubUsername: username,
			address,
			prScore,
			reviewScore,
			issueScore,
			communityScore,
			compositeScore,
			scaledScore: scaleForContract(compositeScore),
		})
	}

	return results.sort((a, b) => b.compositeScore - a.compositeScore)
}
