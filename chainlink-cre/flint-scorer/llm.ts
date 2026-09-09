import { cre, ok, text, type TeeRuntime } from '@chainlink/cre-sdk'
import type { PRData, ComplexityResult, Complexity } from './types'

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
	const lines = [
		`PR #${pr.number}: ${pr.title}`,
		`Author: ${pr.author} (association: ${pr.authorAssociation})`,
		`Files changed: ${pr.changedFiles}`,
		`Additions: ${pr.additions}, Deletions: ${pr.deletions}`,
		`Reviews received: ${pr.reviewCount}`,
		`Labels: ${pr.labels.join(', ') || 'none'}`,
		`Merged: ${pr.merged}`,
	]
	return lines.join('\n')
}

const DEFAULT_RESULT: ComplexityResult = {
	complexity: 'medium',
	complexity_reason: 'LLM classification unavailable, defaulting to medium',
	quality_indicators: {
		has_tests: false,
		has_docs: false,
		is_refactor: false,
		is_security_related: false,
	},
	gaming_flags: [],
}

export function classifyPRComplexity(
	runtime: TeeRuntime<any>,
	apiKey: string,
	apiUrl: string,
	model: string,
	pr: PRData,
): ComplexityResult {
	const body = JSON.stringify({
		contents: [
			{
				parts: [
					{ text: SYSTEM_PROMPT },
					{ text: `\n\nAnalyze this PR:\n${formatPRForAnalysis(pr)}` },
				],
			},
		],
		generationConfig: {
			responseMimeType: 'application/json',
			temperature: 0.1,
		},
	})

	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, {
			url: `${apiUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`,
			method: 'POST',
			multiHeaders: {
				'Content-Type': { values: ['application/json'] },
			},
			body: new TextEncoder().encode(body),
		})
		.result()

	if (!ok(response)) {
		runtime.log(`Gemini API failed: ${response.statusCode}, using default complexity`)
		return DEFAULT_RESULT
	}

	try {
		const parsed = JSON.parse(text(response))
		const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text
		if (!content) return DEFAULT_RESULT

		const result = JSON.parse(content) as ComplexityResult

		const validComplexities: Complexity[] = ['trivial', 'medium', 'high', 'critical']
		if (!validComplexities.includes(result.complexity)) {
			result.complexity = 'medium'
		}

		return result
	} catch {
		return DEFAULT_RESULT
	}
}

export function classifyAllPRs(
	runtime: TeeRuntime<any>,
	apiKey: string,
	apiUrl: string,
	model: string,
	prs: PRData[],
): Map<number, ComplexityResult> {
	const results = new Map<number, ComplexityResult>()

	for (const pr of prs) {
		const result = classifyPRComplexity(runtime, apiKey, apiUrl, model, pr)
		results.set(pr.number, result)
	}

	return results
}
