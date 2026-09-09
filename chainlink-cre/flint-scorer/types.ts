export interface PRData {
	number: number
	title: string
	author: string
	authorAssociation: AuthorAssociation
	merged: boolean
	mergedAt: string | null
	additions: number
	deletions: number
	changedFiles: number
	reviewCount: number
	labels: string[]
	reviews: ReviewData[]
}

export interface ReviewData {
	author: string
	authorAssociation: AuthorAssociation
	state: ReviewState
	body: string
	prAuthor: string
	inlineComments: number
}

export interface IssueData {
	number: number
	title: string
	author: string
	state: string
	stateReason: string | null
	labels: string[]
	commentsCount: number
	createdAt: string
	closedAt: string | null
}

export type AuthorAssociation =
	| 'MEMBER'
	| 'COLLABORATOR'
	| 'CONTRIBUTOR'
	| 'FIRST_TIME_CONTRIBUTOR'
	| 'NONE'

export type ReviewState =
	| 'APPROVED'
	| 'CHANGES_REQUESTED'
	| 'COMMENTED'
	| 'DISMISSED'

export type Complexity = 'trivial' | 'medium' | 'high' | 'critical'

export interface ComplexityResult {
	complexity: Complexity
	complexity_reason: string
	quality_indicators: {
		has_tests: boolean
		has_docs: boolean
		is_refactor: boolean
		is_security_related: boolean
	}
	gaming_flags: string[]
}

export interface ContributorScore {
	githubUsername: string
	address: string
	prScore: number
	reviewScore: number
	issueScore: number
	communityScore: number
	compositeScore: number
	scaledScore: bigint
}

export interface CommunityStats {
	docPRsMerged: number
	issuesTriaged: number
	firstContributorHelps: number
}

export interface ContributorMapping {
	[githubUsername: string]: string
}
