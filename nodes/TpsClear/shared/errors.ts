import type {
	IDataObject,
	IExecuteSingleFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { headerValue } from './numbers';

/**
 * Every API error is a JSON envelope `{ error, message?, ...extra }`. n8n's
 * routing node rewrites the message of any 429 to "Try spacing your requests
 * out", which is right for `rate_limited` and wrong for `allowance_reached`
 * and `daily_cap_reached`, where waiting a few seconds changes nothing. So
 * HTTP errors are let through (`ignoreHttpStatusErrors` in requestDefaults)
 * and turned into an error here that keeps the API's own code and message.
 */
const RETRYABLE = new Set(['rate_limited', 'service_unavailable']);

export interface ApiErrorDetail {
	code: string;
	message: string;
	description: string;
	retryable: boolean;
}

export function describeApiError(
	statusCode: number,
	body: unknown,
	headers: Record<string, unknown> | undefined,
): ApiErrorDetail {
	const parsed: IDataObject =
		body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as IDataObject) : {};
	const code = typeof parsed.error === 'string' && parsed.error ? parsed.error : `http_${statusCode}`;
	const apiMessage = typeof parsed.message === 'string' ? parsed.message.trim() : '';
	const retryable = RETRYABLE.has(code) || statusCode >= 500;

	const retryAfterRaw =
		typeof parsed.retryAfter === 'number' ? String(parsed.retryAfter) : headerValue(headers, 'retry-after');
	const retryAfter = Number(retryAfterRaw);

	const parts = [`TPSClear error code: ${code} (HTTP ${statusCode}).`];
	if (retryable) {
		parts.push(
			Number.isFinite(retryAfter) && retryAfter > 0
				? `Temporary. Retry after ${retryAfter} seconds, for example with Retry On Fail in the node settings.`
				: 'Temporary. Run the step again shortly, for example with Retry On Fail in the node settings.',
		);
	} else if (statusCode !== 404) {
		parts.push('Retrying will not help until the cause is fixed.');
	}

	return {
		code,
		message: apiMessage || `TPSClear refused the request: ${code}`,
		description: parts.join(' '),
		retryable,
	};
}

/**
 * First postReceive on every operation: pass a 2xx through untouched, throw
 * a NodeApiError for anything else. The thrown error carries no
 * `statusCode` property, so the routing node's 429 rewrite does not fire.
 */
export async function apiErrorPostReceive(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const statusCode = Number(response.statusCode);
	if (!Number.isFinite(statusCode) || statusCode < 400) return items;
	const detail = describeApiError(
		statusCode,
		response.body,
		response.headers as Record<string, unknown>,
	);
	const errorBody: JsonObject =
		response.body !== null && typeof response.body === 'object' && !Array.isArray(response.body)
			? (response.body as JsonObject)
			: { error: detail.code };
	throw new NodeApiError(this.getNode(), errorBody, {
		message: detail.message,
		description: detail.description,
		httpCode: String(statusCode),
		itemIndex: this.getItemIndex(),
	});
}
