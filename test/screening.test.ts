import { NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { MAX_SCREEN_NUMBERS, STATUS_LABELS, type ScreenStatus } from '../nodes/TpsClear/shared/constants';
import { headerValue, parseNumberList } from '../nodes/TpsClear/shared/numbers';
import {
	buildBulkScreenRequest,
	buildScreenBody,
	buildSingleScreenRequest,
	screenPostReceive,
	shapeScreenResponse,
	shapeScreenResult,
} from '../nodes/TpsClear/shared/screening';
import { baseRequest, mockContext, mockResponse } from './helpers';

const TPS_FIXTURE = '+447403297721';
const CTPS_FIXTURE = '+442079460018';
const CLEAN = '+442079460001';

const EXPECTED_KEYS = [
	'phone_number',
	'status',
	'status_label',
	'safe_to_call',
	'tps_listed',
	'ctps_listed',
	'checked_at',
	'request_id',
	'campaign_ref',
].sort();

describe('parseNumberList', () => {
	it('splits a string on commas, semicolons and new lines and trims', () => {
		expect(parseNumberList(` ${TPS_FIXTURE}, ${CTPS_FIXTURE};\n${CLEAN}\r\n\n`)).toEqual([
			TPS_FIXTURE,
			CTPS_FIXTURE,
			CLEAN,
		]);
	});

	it('accepts an array from an expression, including nested and numeric entries', () => {
		expect(parseNumberList([TPS_FIXTURE, [CTPS_FIXTURE], 2079460001, '', null])).toEqual([
			TPS_FIXTURE,
			CTPS_FIXTURE,
			'2079460001',
		]);
	});

	it('does not de-duplicate, because the API dedupes and the count must stay honest', () => {
		expect(parseNumberList(`${CLEAN}, ${CLEAN}`)).toEqual([CLEAN, CLEAN]);
	});

	it('returns an empty list for blank input', () => {
		expect(parseNumberList('')).toEqual([]);
		expect(parseNumberList('  \n , ')).toEqual([]);
		expect(parseNumberList(null)).toEqual([]);
		expect(parseNumberList(undefined)).toEqual([]);
	});
});

describe('headerValue', () => {
	it('reads a header regardless of case and handles array values', () => {
		expect(headerValue({ 'X-Request-Id': 'abc' }, 'x-request-id')).toBe('abc');
		expect(headerValue({ 'x-request-id': ['first', 'second'] }, 'X-Request-Id')).toBe('first');
	});

	it('returns an empty string when the header is absent', () => {
		expect(headerValue({}, 'x-request-id')).toBe('');
		expect(headerValue(undefined, 'x-request-id')).toBe('');
		expect(headerValue({ 'x-request-id': null }, 'x-request-id')).toBe('');
	});
});

describe('buildScreenBody', () => {
	it('always sends phoneNumbers as an array and omits campaignRef when blank', () => {
		expect(buildScreenBody([CLEAN], '')).toEqual({ phoneNumbers: [CLEAN] });
		expect(buildScreenBody([CLEAN], '   ')).toEqual({ phoneNumbers: [CLEAN] });
	});

	it('sends a trimmed campaignRef when set', () => {
		expect(buildScreenBody([CLEAN], '  Autumn outbound ')).toEqual({
			phoneNumbers: [CLEAN],
			campaignRef: 'Autumn outbound',
		});
	});
});

describe('buildSingleScreenRequest (preSend)', () => {
	it('wraps the one number into a phoneNumbers batch and keeps the request options', async () => {
		const context = mockContext({ phoneNumber: ` ${TPS_FIXTURE} `, options: {} });
		const request = await buildSingleScreenRequest.call(context, baseRequest());
		expect(request.url).toBe('/screen');
		expect(request.method).toBe('POST');
		expect(request.body).toEqual({ phoneNumbers: [TPS_FIXTURE] });
	});

	it('carries the campaign reference from the options collection', async () => {
		const context = mockContext({ phoneNumber: CLEAN, options: { campaignRef: 'Q4' } });
		const request = await buildSingleScreenRequest.call(context, baseRequest());
		expect(request.body).toEqual({ phoneNumbers: [CLEAN], campaignRef: 'Q4' });
	});

	it('refuses a blank number with a NodeOperationError naming the field', async () => {
		const context = mockContext({ phoneNumber: '   ' }, 3);
		await expect(buildSingleScreenRequest.call(context, baseRequest())).rejects.toBeInstanceOf(
			NodeOperationError,
		);
		await expect(buildSingleScreenRequest.call(context, baseRequest())).rejects.toThrow(
			"'Phone Number'",
		);
	});
});

describe('buildBulkScreenRequest (preSend)', () => {
	it('parses a comma and newline separated string', async () => {
		const context = mockContext({ phoneNumbers: `${TPS_FIXTURE},\n${CTPS_FIXTURE}` });
		const request = await buildBulkScreenRequest.call(context, baseRequest());
		expect(request.body).toEqual({ phoneNumbers: [TPS_FIXTURE, CTPS_FIXTURE] });
	});

	it('accepts an array from an expression', async () => {
		const context = mockContext({ phoneNumbers: [TPS_FIXTURE, CTPS_FIXTURE, CLEAN] });
		const request = await buildBulkScreenRequest.call(context, baseRequest());
		expect(request.body).toEqual({ phoneNumbers: [TPS_FIXTURE, CTPS_FIXTURE, CLEAN] });
	});

	it(`allows exactly ${MAX_SCREEN_NUMBERS} numbers`, async () => {
		const numbers = Array.from({ length: MAX_SCREEN_NUMBERS }, (_, i) => `+4420794600${String(i).padStart(2, '0')}`);
		const context = mockContext({ phoneNumbers: numbers });
		const request = await buildBulkScreenRequest.call(context, baseRequest());
		expect((request.body as { phoneNumbers: string[] }).phoneNumbers).toHaveLength(MAX_SCREEN_NUMBERS);
	});

	it(`refuses ${MAX_SCREEN_NUMBERS + 1} numbers before any request is made`, async () => {
		const numbers = Array.from({ length: MAX_SCREEN_NUMBERS + 1 }, () => CLEAN);
		const context = mockContext({ phoneNumbers: numbers });
		await expect(buildBulkScreenRequest.call(context, baseRequest())).rejects.toThrow(
			`${MAX_SCREEN_NUMBERS + 1} numbers`,
		);
	});

	it('refuses an empty list', async () => {
		const context = mockContext({ phoneNumbers: ' , \n' });
		await expect(buildBulkScreenRequest.call(context, baseRequest())).rejects.toBeInstanceOf(
			NodeOperationError,
		);
	});
});

describe('shapeScreenResult', () => {
	const statuses: ScreenStatus[] = [
		'clean',
		'tps-listed',
		'ctps-listed',
		'unknown',
		'suppressed',
		'consented',
	];

	it.each(statuses)('status %s: safe_to_call is true only for clean', (status) => {
		const out = shapeScreenResult({ phoneNumber: CLEAN, status }, 'req', '');
		expect(out.safe_to_call).toBe(status === 'clean');
		expect(out.status).toBe(status);
		expect(out.status_label).toBe(STATUS_LABELS[status]);
	});

	it('treats an unrecognised status as unknown, never as callable', () => {
		const out = shapeScreenResult({ phoneNumber: CLEAN, status: 'something-new' }, 'req', '');
		expect(out.status).toBe('unknown');
		expect(out.safe_to_call).toBe(false);
	});

	it('emits every output key even when the API omits fields', () => {
		const out = shapeScreenResult({}, '', '');
		expect(Object.keys(out).sort()).toEqual(EXPECTED_KEYS);
		expect(out).toEqual({
			phone_number: '',
			status: 'unknown',
			status_label: STATUS_LABELS.unknown,
			safe_to_call: false,
			tps_listed: false,
			ctps_listed: false,
			checked_at: '',
			request_id: '',
			campaign_ref: '',
		});
	});
});

describe('shapeScreenResponse', () => {
	const body = {
		results: [
			{ phoneNumber: TPS_FIXTURE, tpsListed: true, ctpsListed: false, status: 'tps-listed', checkedAt: '2026-10-10T09:00:00.000Z' },
			{ phoneNumber: CTPS_FIXTURE, tpsListed: false, ctpsListed: true, status: 'ctps-listed', checkedAt: '2026-10-10T09:00:00.000Z' },
			{ phoneNumber: CLEAN, tpsListed: false, ctpsListed: false, status: 'clean', checkedAt: '2026-10-10T09:00:00.000Z' },
		],
		campaignRef: 'Autumn outbound',
	};

	it('returns one item per result with the audit record id from the header', () => {
		const items = shapeScreenResponse(body, { 'x-request-id': 'rec-123' }, 4);
		expect(items).not.toBeNull();
		expect(items).toHaveLength(3);
		for (const item of items!) {
			expect(Object.keys(item.json).sort()).toEqual(EXPECTED_KEYS);
			expect(item.json.request_id).toBe('rec-123');
			expect(item.json.campaign_ref).toBe('Autumn outbound');
			expect(item.pairedItem).toEqual({ item: 4 });
		}
		expect(items!.map((i) => i.json.safe_to_call)).toEqual([false, false, true]);
		expect(items!.map((i) => i.json.tps_listed)).toEqual([true, false, false]);
		expect(items!.map((i) => i.json.ctps_listed)).toEqual([false, true, false]);
	});

	it('leaves request_id and campaign_ref empty rather than absent when the API sends neither', () => {
		const items = shapeScreenResponse({ results: [{ phoneNumber: CLEAN, status: 'clean' }] }, {}, 0);
		expect(items![0].json.request_id).toBe('');
		expect(items![0].json.campaign_ref).toBe('');
	});

	it('returns null for a body with no results', () => {
		expect(shapeScreenResponse({ results: [] }, {}, 0)).toBeNull();
		expect(shapeScreenResponse({}, {}, 0)).toBeNull();
		expect(shapeScreenResponse(null, {}, 0)).toBeNull();
	});
});

describe('screenPostReceive', () => {
	it('shapes the response using the item index from the context', async () => {
		const context = mockContext({}, 2);
		const items = await screenPostReceive.call(
			context,
			[],
			mockResponse({ results: [{ phoneNumber: CLEAN, status: 'clean' }] }, { 'x-request-id': 'r1' }),
		);
		expect(items).toHaveLength(1);
		expect(items[0].json.request_id).toBe('r1');
		expect(items[0].pairedItem).toEqual({ item: 2 });
	});

	it('throws a NodeOperationError instead of returning an empty run when there is no verdict', async () => {
		const context = mockContext({}, 0);
		await expect(screenPostReceive.call(context, [], mockResponse({ results: [] }))).rejects.toBeInstanceOf(
			NodeOperationError,
		);
	});
});
