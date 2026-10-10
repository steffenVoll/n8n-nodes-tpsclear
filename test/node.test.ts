import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { TpsClearApi } from '../credentials/TpsClearApi.credentials';
import { TpsClear } from '../nodes/TpsClear/TpsClear.node';
import { API_BASE_URL } from '../nodes/TpsClear/shared/constants';
import { shapeUsage, usagePostReceive } from '../nodes/TpsClear/shared/usage';
import { mockContext, mockResponse } from './helpers';

const node = new TpsClear();
const properties = node.description.properties;

const operationsFor = (resource: string): INodePropertyOptions[] => {
	const prop = properties.find(
		(p: INodeProperties) =>
			p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
	);
	return (prop?.options ?? []) as INodePropertyOptions[];
};

const route = (resource: string, operation: string) => {
	const option = operationsFor(resource).find((o) => o.value === operation);
	expect(option, `${resource}.${operation} exists`).toBeDefined();
	return option!.routing!;
};

describe('TpsClear node description', () => {
	it('points every request at the public API with JSON headers', () => {
		expect(node.description.requestDefaults?.baseURL).toBe(API_BASE_URL);
		expect(API_BASE_URL).toBe('https://api.tpsclear.co.uk/v1');
		expect(node.description.credentials).toEqual([{ name: 'tpsClearApi', required: true }]);
		expect(node.description.usableAsTool).toBe(true);
	});

	it('exposes the four resources', () => {
		const resource = properties.find((p) => p.name === 'resource')!;
		expect((resource.options as INodePropertyOptions[]).map((o) => o.value).sort()).toEqual([
			'consent',
			'screening',
			'suppression',
			'usage',
		]);
	});

	it.each([
		['screening', 'screen', 'POST', '/screen', true, true],
		['screening', 'screenMany', 'POST', '/screen', true, true],
		['screening', 'getRecord', 'GET', '/screen', true, true],
		['suppression', 'getAll', 'GET', '/suppressions', false, true],
		['suppression', 'add', 'POST', '/suppressions', true, true],
		['suppression', 'remove', 'DELETE', '/suppressions', true, true],
		['consent', 'getAll', 'GET', '/consents', false, true],
		['consent', 'add', 'POST', '/consents', true, true],
		['consent', 'remove', 'DELETE', '/consents', true, true],
		['usage', 'get', 'GET', '/usage', false, true],
	])('%s.%s routes %s %s', (resource, operation, method, url, hasPreSend, hasPostReceive) => {
		const routing = route(resource, operation);
		expect(routing.request?.method).toBe(method);
		expect(routing.request?.url).toBe(url);
		expect(Boolean(routing.send?.preSend?.length)).toBe(hasPreSend);
		expect(Boolean(routing.output?.postReceive?.length)).toBe(hasPostReceive);
	});

	it('gives every operation an action and a description in sentence case', () => {
		for (const resource of ['screening', 'suppression', 'consent', 'usage']) {
			for (const option of operationsFor(resource)) {
				expect(option.action, `${resource}.${option.value} action`).toBeTruthy();
				expect(option.description, `${resource}.${option.value} description`).toBeTruthy();
				expect(option.action![0]).toBe(option.action![0].toUpperCase());
			}
		}
	});

	it('never names a register data partner or implies real-time call blocking', () => {
		const text = JSON.stringify(node.description).toLowerCase();
		for (const banned of ['data8', 'selectabase', 't2a', 'simunix', 'block the call', 'blocks the call', 'real time', 'real-time']) {
			expect(text, banned).not.toContain(banned);
		}
	});
});

describe('TpsClearApi credential', () => {
	const credential = new TpsClearApi();

	it('sends the key as a bearer token and tests against the free usage endpoint', () => {
		expect(credential.authenticate.properties.headers?.Authorization).toBe(
			'=Bearer {{$credentials.apiKey}}',
		);
		expect(credential.test.request.baseURL).toBe(API_BASE_URL);
		expect(credential.test.request.url).toBe('/usage');
		expect(credential.test.request.method).toBe('GET');
	});

	it('stores the key as a password field', () => {
		const field = credential.properties.find((p) => p.name === 'apiKey')!;
		expect(field.typeOptions?.password).toBe(true);
	});
});

describe('usage output', () => {
	const body = {
		key: { last4: 'a1B2', name: 'Acme production' },
		environment: 'live',
		plan: 'monthly',
		window: { limit: 5000, windowSecs: 86400, used: 12, remaining: 4988, reset: 1790035200 },
		last30d: { calls: 318, lookups: 21044, approximate: true },
	};

	it('flattens every field to a top-level key', () => {
		expect(shapeUsage(body)).toEqual({
			key_name: 'Acme production',
			key_last4: 'a1B2',
			environment: 'live',
			plan: 'monthly',
			window_limit: 5000,
			window_used: 12,
			window_remaining: 4988,
			window_seconds: 86400,
			window_reset: 1790035200,
			last30d_calls: 318,
			last30d_lookups: 21044,
			last30d_approximate: true,
		});
	});

	it('emits every key with a zero or empty value when the API omits fields', () => {
		const out = shapeUsage({});
		expect(Object.keys(out)).toHaveLength(12);
		expect(out.last30d_approximate).toBe(false);
		expect(out.window_remaining).toBe(0);
		expect(out.key_name).toBe('');
	});

	it('is returned by usagePostReceive as one item', async () => {
		const items = await usagePostReceive.call(mockContext({}, 1), [], mockResponse(body));
		expect(items).toHaveLength(1);
		expect(items[0].json.plan).toBe('monthly');
		expect(items[0].pairedItem).toEqual({ item: 1 });
	});
});
