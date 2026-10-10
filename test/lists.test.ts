import { NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { MAX_LIST_NUMBERS } from '../nodes/TpsClear/shared/constants';
import {
	buildListAddBody,
	buildListAddRequest,
	buildListRemoveRequest,
	listAddPostReceive,
	listRemovePostReceive,
	listRowsPostReceive,
	shapeListAddResponse,
	shapeListRemoveResponse,
	shapeListRows,
} from '../nodes/TpsClear/shared/lists';
import { baseRequest, mockContext, mockResponse } from './helpers';

const A = '+442079460001';
const B = '+442079460002';

describe('buildListAddBody', () => {
	it('uses the plain numbers form when there is no reason or date', () => {
		expect(buildListAddBody([A, B], '', '')).toEqual({ numbers: [A, B] });
	});

	it('uses the entries form carrying reason and datetime when either is set', () => {
		expect(buildListAddBody([A], 'Asked not to be called', '')).toEqual({
			entries: [{ number: A, reason: 'Asked not to be called' }],
		});
		expect(buildListAddBody([A, B], '', '2026-10-10T09:00:00.000Z')).toEqual({
			entries: [
				{ number: A, datetime: '2026-10-10T09:00:00.000Z' },
				{ number: B, datetime: '2026-10-10T09:00:00.000Z' },
			],
		});
	});
});

describe('buildListAddRequest (preSend)', () => {
	it('parses the list and reads reason and date from options', async () => {
		const context = mockContext({
			phoneNumbers: `${A}\n${B}`,
			options: { reason: 'Opted out', occurredAt: '2026-10-01T00:00:00.000Z' },
		});
		const request = await buildListAddRequest.call(context, { ...baseRequest(), url: '/suppressions' });
		expect(request.url).toBe('/suppressions');
		expect(request.body).toEqual({
			entries: [
				{ number: A, reason: 'Opted out', datetime: '2026-10-01T00:00:00.000Z' },
				{ number: B, reason: 'Opted out', datetime: '2026-10-01T00:00:00.000Z' },
			],
		});
	});

	it('refuses an empty list and a list over the API ceiling', async () => {
		await expect(
			buildListAddRequest.call(mockContext({ phoneNumbers: '' }), baseRequest()),
		).rejects.toBeInstanceOf(NodeOperationError);
		const tooMany = Array.from({ length: MAX_LIST_NUMBERS + 1 }, () => A);
		await expect(
			buildListAddRequest.call(mockContext({ phoneNumbers: tooMany }), baseRequest()),
		).rejects.toThrow(`${MAX_LIST_NUMBERS + 1} numbers`);
	});
});

describe('buildListRemoveRequest (preSend)', () => {
	it('puts the number and note in the body, never the query string', async () => {
		const context = mockContext({ phoneNumber: ` ${A} `, options: { note: ' Consent given ' } });
		const request = await buildListRemoveRequest.call(context, {
			...baseRequest(),
			method: 'DELETE',
			url: '/consents',
		});
		expect(request.method).toBe('DELETE');
		expect(request.qs).toEqual({});
		expect(request.body).toEqual({ number: A, note: 'Consent given' });
	});

	it('omits the note when blank and refuses a blank number', async () => {
		const request = await buildListRemoveRequest.call(
			mockContext({ phoneNumber: A, options: {} }),
			baseRequest(),
		);
		expect(request.body).toEqual({ number: A });
		await expect(
			buildListRemoveRequest.call(mockContext({ phoneNumber: '' }), baseRequest()),
		).rejects.toBeInstanceOf(NodeOperationError);
	});
});

describe('shapeListRows', () => {
	const body = {
		count: 42,
		suppressions: [
			{ phoneNumber: A, note: 'Asked not to be called', createdAt: '2026-09-18T11:02:00Z', occurredAt: '2026-09-18T11:02:00Z' },
			{ phoneNumber: B, note: null, createdAt: '2026-09-19T11:02:00Z', occurredAt: null },
		],
	};

	it('yields one item per row with the full count on every item', () => {
		const items = shapeListRows(body, 'suppression', 1);
		expect(items).toHaveLength(2);
		expect(items[0].json).toEqual({
			phone_number: A,
			note: 'Asked not to be called',
			created_at: '2026-09-18T11:02:00Z',
			occurred_at: '2026-09-18T11:02:00Z',
			total_on_list: 42,
		});
		expect(items[1].json).toEqual({
			phone_number: B,
			note: '',
			created_at: '2026-09-19T11:02:00Z',
			occurred_at: '',
			total_on_list: 42,
		});
		expect(items[1].pairedItem).toEqual({ item: 1 });
	});

	it('reads the consents key for the consent resource', () => {
		const items = shapeListRows({ count: 1, consents: [{ phoneNumber: A }] }, 'consent', 0);
		expect(items).toHaveLength(1);
		expect(items[0].json.phone_number).toBe(A);
		expect(shapeListRows(body, 'consent', 0)).toEqual([]);
	});
});

describe('listRowsPostReceive', () => {
	it('picks the rows key from the resource parameter', async () => {
		const items = await listRowsPostReceive.call(
			mockContext({ resource: 'consent' }),
			[],
			mockResponse({ count: 1, consents: [{ phoneNumber: B }] }),
		);
		expect(items.map((i) => i.json.phone_number)).toEqual([B]);
	});
});

describe('shapeListAddResponse', () => {
	it('maps the import summary and always carries an invalid array', () => {
		expect(
			shapeListAddResponse({ ok: true, added: 2, alreadyListed: 1, invalidCount: 1, total: 44, invalid: ['nope'] }),
		).toEqual({ added: 2, already_listed: 1, invalid_count: 1, total_on_list: 44, invalid: ['nope'] });
		expect(shapeListAddResponse({})).toEqual({
			added: 0,
			already_listed: 0,
			invalid_count: 0,
			total_on_list: 0,
			invalid: [],
		});
	});

	it('is what listAddPostReceive returns, paired to the input item', async () => {
		const items = await listAddPostReceive.call(
			mockContext({}, 5),
			[],
			mockResponse({ ok: true, added: 1, total: 10, invalid: [] }),
		);
		expect(items).toHaveLength(1);
		expect(items[0].json.added).toBe(1);
		expect(items[0].pairedItem).toEqual({ item: 5 });
	});
});

describe('remove output', () => {
	it('reports deleted from the API removed flag', () => {
		expect(shapeListRemoveResponse({ ok: true, removed: true }, A)).toEqual({ phone_number: A, deleted: true });
		expect(shapeListRemoveResponse({ ok: true, removed: false }, A)).toEqual({ phone_number: A, deleted: false });
		expect(shapeListRemoveResponse(null, A)).toEqual({ phone_number: A, deleted: false });
	});

	it('listRemovePostReceive echoes the number the user gave', async () => {
		const items = await listRemovePostReceive.call(
			mockContext({ phoneNumber: ` ${B} ` }),
			[],
			mockResponse({ ok: true, removed: true }),
		);
		expect(items[0].json).toEqual({ phone_number: B, deleted: true });
	});
});
