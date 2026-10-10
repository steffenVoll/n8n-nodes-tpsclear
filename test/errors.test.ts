import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { TpsClear } from '../nodes/TpsClear/TpsClear.node';
import { apiErrorPostReceive, describeApiError } from '../nodes/TpsClear/shared/errors';
import { buildGetRecordRequest } from '../nodes/TpsClear/shared/screening';
import { baseRequest, mockContext, mockResponse } from './helpers';

const node = new TpsClear();

const allOperations = (): Array<{ resource: string; option: INodePropertyOptions }> =>
	node.description.properties
		.filter((p: INodeProperties) => p.name === 'operation')
		.flatMap((p) =>
			((p.options ?? []) as INodePropertyOptions[]).map((option) => ({
				resource: String(p.displayOptions?.show?.resource?.[0]),
				option,
			})),
		);

describe('HTTP error handling wiring', () => {
	it('lets HTTP errors through to the node so the API code survives', () => {
		expect(node.description.requestDefaults?.ignoreHttpStatusErrors).toBe(true);
	});

	it('runs apiErrorPostReceive first on every operation', () => {
		const ops = allOperations();
		expect(ops.length).toBe(10);
		for (const { resource, option } of ops) {
			const postReceive = option.routing?.output?.postReceive ?? [];
			expect(postReceive[0], `${resource}.${option.value}`).toBe(apiErrorPostReceive);
		}
	});
});

describe('describeApiError', () => {
	it('marks rate_limited as temporary and carries the retry delay', () => {
		const d = describeApiError(
			429,
			{ error: 'rate_limited', message: 'Fair-use lookup limit reached for the current window.', retryAfter: 12 },
			{},
		);
		expect(d.code).toBe('rate_limited');
		expect(d.retryable).toBe(true);
		expect(d.message).toBe('Fair-use lookup limit reached for the current window.');
		expect(d.description).toContain('Retry after 12 seconds');
	});

	it('reads Retry-After from the header when the body has none', () => {
		const d = describeApiError(429, { error: 'rate_limited' }, { 'Retry-After': '30' });
		expect(d.description).toContain('Retry after 30 seconds');
	});

	it('marks allowance_reached, daily_cap_reached and insufficient_credits as terminal', () => {
		for (const [status, code] of [
			[429, 'allowance_reached'],
			[429, 'daily_cap_reached'],
			[402, 'insufficient_credits'],
			[403, 'test_key_read_only'],
		] as const) {
			const d = describeApiError(status, { error: code, message: 'x' }, {});
			expect(d.retryable, code).toBe(false);
			expect(d.description).toContain(code);
			expect(d.description).not.toContain('Retry after');
		}
	});

	it('treats 5xx and a non-JSON body as temporary with a synthetic code', () => {
		const d = describeApiError(502, '<html>Bad gateway</html>', {});
		expect(d.code).toBe('http_502');
		expect(d.retryable).toBe(true);
	});
});

describe('apiErrorPostReceive', () => {
	it('passes a 2xx response through untouched', async () => {
		const items = [{ json: { ok: true } }];
		const out = await apiErrorPostReceive.call(mockContext({}), items, mockResponse({ ok: true }));
		expect(out).toBe(items);
	});

	it('throws a NodeApiError with the API message, not the generic 429 text, for allowance_reached', async () => {
		const body = { error: 'allowance_reached', message: 'This account has used its plan allowance.' };
		const error = await apiErrorPostReceive
			.call(mockContext({}, 3), [{ json: body }], mockResponse(body, {}, 429))
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		const apiError = error as NodeApiError & { statusCode?: unknown };
		expect(apiError.message).toBe('This account has used its plan allowance.');
		expect(apiError.description).toContain('allowance_reached');
		expect(apiError.httpCode).toBe('429');
		expect(apiError.context.itemIndex).toBe(3);
		// The routing node rewrites any rejection whose statusCode is 429.
		expect(apiError.statusCode).toBeUndefined();
	});

	it('falls back to the error code when the API sends no message', async () => {
		const body = { error: 'not_found' };
		await expect(
			apiErrorPostReceive.call(mockContext({}), [{ json: body }], mockResponse(body, {}, 404)),
		).rejects.toThrow('not_found');
	});
});

describe('buildGetRecordRequest (preSend)', () => {
	it('trims the id and puts it in the path, encoded', async () => {
		const request = await buildGetRecordRequest.call(
			mockContext({ recordId: ' 6f1d2c9a-4b3e-4f2a-9c1d-8e7b6a5f4d3c ' }),
			{ ...baseRequest(), method: 'GET' },
		);
		expect(request.url).toBe('/screen/6f1d2c9a-4b3e-4f2a-9c1d-8e7b6a5f4d3c');
		expect(request.method).toBe('GET');
		const odd = await buildGetRecordRequest.call(mockContext({ recordId: 'a/b c' }), baseRequest());
		expect(odd.url).toBe('/screen/a%2Fb%20c');
	});

	it('refuses a blank id instead of requesting the service description', async () => {
		await expect(
			buildGetRecordRequest.call(mockContext({ recordId: '   ' }), baseRequest()),
		).rejects.toBeInstanceOf(NodeOperationError);
	});
});
