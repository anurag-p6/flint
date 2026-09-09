import {
	cre,
	hexToBase64,
	type TeeRuntime,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters, keccak256, toHex } from 'viem'
import { z } from 'zod'
import type { ContributorMapping, Complexity } from './types'
import {
	fetchMergedPRs,
	fetchIssues,
	groupReviewsByAuthor,
	groupIssuesByAuthor,
	buildCommunityStats,
} from './github'
import { classifyAllPRs } from './llm'
import { scoreAllContributors } from './scoring'

// ─── Config Schema ──────────────────────────────────────────
export const configSchema = z.object({
	schedule: z.string(),

	repoOwner: z.string(),
	repoName: z.string(),
	cycleDays: z.number(),

	geminiApiUrl: z.string(),
	geminiModel: z.string(),

	contributorMapping: z.record(z.string(), z.string()),
})
export type Config = z.infer<typeof configSchema>

// ─── TEE Cron Callback ──────────────────────────────────────
// Everything here runs inside the enclave until we explicitly cross back
// with `usingTheDons()`. Secrets, HTTP payloads, and intermediate values
// remain confidential — only final scores leave the enclave.
export const onCronTrigger = (runtime: TeeRuntime<Config>): string => {
	const config = runtime.config

	// ── Step 1: Fetch secrets inside the enclave ──
	// Vault DON releases these only into an attested enclave.
	const githubToken = runtime.getSecret({ id: 'GITHUB_TOKEN' }).result().value
	const geminiKey = runtime.getSecret({ id: 'GEMINI_API_KEY' }).result().value

	// ── Step 2: Calculate scoring window ──
	const now = new Date()
	const sinceDate = new Date(now.getTime() - config.cycleDays * 24 * 60 * 60 * 1000)
	const since = sinceDate.toISOString()

	runtime.log(`Scoring ${config.repoOwner}/${config.repoName} for last ${config.cycleDays} days`)

	// ── Step 3: Fetch GitHub data (confidential HTTP inside TEE) ──
	const prs = fetchMergedPRs(
		runtime,
		githubToken,
		config.repoOwner,
		config.repoName,
		since,
	)
	runtime.log(`Fetched ${prs.length} merged PRs`)

	const issues = fetchIssues(
		runtime,
		githubToken,
		config.repoOwner,
		config.repoName,
		since,
	)
	runtime.log(`Fetched ${issues.length} issues`)

	if (prs.length === 0) {
		runtime.log('No merged PRs found in scoring window, skipping')
		const donRuntime = runtime.usingTheDons()
		const emptyPayload = encodeAbiParameters(
			parseAbiParameters('bytes32 repoId, address[] contributors, uint256[] scores'),
			[keccak256(toHex(`${config.repoOwner}/${config.repoName}`)), [], []],
		)
		donRuntime
			.report({
				encodedPayload: hexToBase64(emptyPayload),
				encoderName: 'evm',
				signingAlgo: 'ecdsa',
				hashingAlgo: 'keccak256',
			})
			.result()
		return 'No PRs to score'
	}

	// ── Step 4: Classify PR complexity via Gemini (confidential HTTP inside TEE) ──
	// API key never leaves the enclave. LLM responses stay confidential.
	const complexityResults = classifyAllPRs(
		runtime,
		geminiKey,
		config.geminiApiUrl,
		config.geminiModel,
		prs,
	)
	runtime.log(`Classified ${complexityResults.size} PRs`)

	// ── Step 5: Build scoring data structures ──
	const prsByAuthor = new Map<string, { pr: typeof prs[0]; complexity: Complexity }[]>()
	for (const pr of prs) {
		const complexity = complexityResults.get(pr.number)?.complexity ?? 'medium'
		const existing = prsByAuthor.get(pr.author) ?? []
		existing.push({ pr, complexity })
		prsByAuthor.set(pr.author, existing)
	}

	const reviewsByAuthor = groupReviewsByAuthor(prs)
	const issuesByAuthor = groupIssuesByAuthor(issues)
	const communityStats = buildCommunityStats(prs, issues)

	// ── Step 6: Calculate composite scores ──
	const contributorScores = scoreAllContributors(
		prsByAuthor,
		reviewsByAuthor,
		issuesByAuthor,
		communityStats,
		config.contributorMapping as ContributorMapping,
		now,
	)

	runtime.log(`Scored ${contributorScores.length} contributors`)
	for (const cs of contributorScores) {
		runtime.log(`  ${cs.githubUsername}: composite=${cs.compositeScore.toFixed(4)} | PR=${cs.prScore.toFixed(3)} Review=${cs.reviewScore.toFixed(3)} Issue=${cs.issueScore.toFixed(3)} Community=${cs.communityScore.toFixed(3)}`)
	}

	// ── Step 7: Cross back to DON — only scores leave the enclave ──
	// Everything before this point was confidential. After usingTheDons(),
	// the data is no longer confidential — only pass the final scores.
	const donRuntime = runtime.usingTheDons()

	const repoId = keccak256(toHex(`${config.repoOwner}/${config.repoName}`))
	const contributors = contributorScores.map((cs) => cs.address as `0x${string}`)
	const scores = contributorScores.map((cs) => cs.scaledScore)

	const encodedPayload = encodeAbiParameters(
		parseAbiParameters('bytes32 repoId, address[] contributors, uint256[] scores'),
		[repoId, contributors, scores],
	)

	donRuntime
		.report({
			encodedPayload: hexToBase64(encodedPayload),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	const summary = contributorScores
		.map((cs) => `${cs.githubUsername}=${cs.compositeScore.toFixed(2)}`)
		.join(', ')

	return `Scored ${contributorScores.length} contributors: ${summary}`
}

// ─── Workflow Init ──────────────────────────────────────────
export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()

	return [
		cre.handlerInTee(cronTrigger.trigger({ schedule: config.schedule }), onCronTrigger, [
			{ tee: 'nitro', regions: ['us-west-2'] },
		]),
	]
}
