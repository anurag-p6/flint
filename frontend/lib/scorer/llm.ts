import type { PRData, ComplexityResult, Complexity } from "./types"

const SYSTEM_PROMPT = `You are a code contribution analyzer for open source projects.
Analyze the following PR metadata and return a JSON assessment.
Focus on the actual complexity of the change, not just the size.
Flag any gaming patterns you detect.

Return JSON only with this exact schema:
{
  "complexity": "trivial|medium|high|critical",
  "complexity_reason": "one sentence explanation",
  "quality_indicators": {
    "has_tests": boolean,
    "has_docs": boolean,
    "is_refactor": boolean,
    "is_security_related": boolean
  },
  "gaming_flags": []
}`

function formatPRForAnalysis(pr: PRData): string {
	return [
		`PR #${pr.number}: ${pr.title}`,
		`Author: ${pr.author} (association: ${pr.authorAssociation})`,
		`Files changed: ${pr.changedFiles}`,
		`Additions: ${pr.additions}, Deletions: ${pr.deletions}`,
		`Reviews received: ${pr.reviewCount}`,
		`Labels: ${pr.labels.join(", ") || "none"}`,
		`Merged: ${pr.merged}`,
	].join("\n")
}

const DEFAULT_RESULT: ComplexityResult = {
	complexity: "medium",
	complexity_reason: "LLM classification unavailable, defaulting to medium",
	quality_indicators: {
		has_tests: false,
		has_docs: false,
		is_refactor: false,
		is_security_related: false,
	},
	gaming_flags: [],
}

const DEFAULT_API_URL = "https://api.groq.com/openai/v1"
const DEFAULT_MODEL = "openai/gpt-oss-120b"

export async function classifyPRComplexity(
	apiKey: string,
	pr: PRData,
	apiUrl?: string,
	model?: string,
): Promise<ComplexityResult> {
	const url = apiUrl || DEFAULT_API_URL
	const m = model || DEFAULT_MODEL

	const body = JSON.stringify({
		model: m,
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: `Analyze this PR:\n${formatPRForAnalysis(pr)}` },
		],
		temperature: 0.1,
		response_format: { type: "json_object" },
	})

	try {
		const res = await fetch(`${url}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body,
		})

		if (!res.ok) {
			console.error(`Groq API failed: ${res.status}`)
			return DEFAULT_RESULT
		}

		const parsed = await res.json()
		const content = parsed.choices?.[0]?.message?.content
		if (!content) return DEFAULT_RESULT

		const result = JSON.parse(content) as ComplexityResult

		const validComplexities: Complexity[] = ["trivial", "medium", "high", "critical"]
		if (!validComplexities.includes(result.complexity)) {
			result.complexity = "medium"
		}

		return result
	} catch {
		return DEFAULT_RESULT
	}
}

export function heuristicComplexity(pr: PRData): Complexity {
	const labels = pr.labels.map((l) => l.toLowerCase())
	if (labels.some((l) => l.includes("security") || l.includes("critical"))) return "critical"
	const size = pr.additions + pr.deletions
	if (size > 800 || pr.changedFiles > 25) return "high"
	if (size < 20 && pr.changedFiles <= 2) return "trivial"
	return "medium"
}

export async function classifyAllPRs(
	apiKey: string,
	prs: PRData[],
	apiUrl?: string,
	model?: string,
): Promise<Map<number, ComplexityResult>> {
	const results = new Map<number, ComplexityResult>()
	if (prs.length === 0) return results

	const classified = await Promise.all(
		prs.map(async (pr) => {
			const fallback: ComplexityResult = {
				...DEFAULT_RESULT,
				complexity: heuristicComplexity(pr),
				complexity_reason: "Timed out — used size heuristic",
			}
			const timed = new Promise<ComplexityResult>((resolve) => {
				setTimeout(() => resolve(fallback), 2500)
			})
			const result = await Promise.race([
				classifyPRComplexity(apiKey, pr, apiUrl, model),
				timed,
			])
			return [pr.number, result] as const
		}),
	)

	for (const [number, result] of classified) {
		results.set(number, result)
	}
	return results
}
