import type {
	IDataObject,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { MAX_LIST_NUMBERS } from './constants';
import { parseNumberList } from './numbers';

/** Which API resource backs each list resource in the node. */
export const LIST_PATHS = {
	suppression: '/suppressions',
	consent: '/consents',
} as const;

export type ListResource = keyof typeof LIST_PATHS;

const ROWS_KEY: Record<ListResource, 'suppressions' | 'consents'> = {
	suppression: 'suppressions',
	consent: 'consents',
};

interface ListRow {
	phoneNumber?: unknown;
	note?: unknown;
	createdAt?: unknown;
	occurredAt?: unknown;
}

export interface ListRowOutput extends IDataObject {
	phone_number: string;
	note: string;
	created_at: string;
	occurred_at: string;
	total_on_list: number;
}

export interface ListAddOutput extends IDataObject {
	added: number;
	already_listed: number;
	invalid_count: number;
	total_on_list: number;
	invalid: string[];
}

export interface ListRemoveOutput extends IDataObject {
	phone_number: string;
	deleted: boolean;
}

const asNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0) || 0);
const asString = (value: unknown): string =>
	value === null || value === undefined ? '' : String(value);

/**
 * Build the POST body for a list import. The plain `numbers` form when there
 * is nothing else to say; the `entries` form when a reason or a date applies,
 * since the API stores both against each number.
 */
export function buildListAddBody(numbers: string[], reason: string, occurredAt: string): IDataObject {
	const trimmedReason = reason.trim();
	const trimmedDate = occurredAt.trim();
	if (!trimmedReason && !trimmedDate) return { numbers };
	return {
		entries: numbers.map((number) => {
			const entry: IDataObject = { number };
			if (trimmedReason) entry.reason = trimmedReason;
			if (trimmedDate) entry.datetime = trimmedDate;
			return entry;
		}),
	};
}

export function shapeListRows(body: unknown, resource: ListResource, itemIndex: number): INodeExecutionData[] {
	const parsed = (body ?? {}) as IDataObject;
	const rows = parsed[ROWS_KEY[resource]];
	const total = asNumber(parsed.count);
	if (!Array.isArray(rows)) return [];
	return (rows as ListRow[]).map((row) => {
		const json: ListRowOutput = {
			phone_number: asString(row.phoneNumber),
			note: asString(row.note),
			created_at: asString(row.createdAt),
			occurred_at: asString(row.occurredAt),
			total_on_list: total,
		};
		return { json, pairedItem: { item: itemIndex } };
	});
}

export function shapeListAddResponse(body: unknown): ListAddOutput {
	const parsed = (body ?? {}) as IDataObject;
	const invalid = Array.isArray(parsed.invalid) ? parsed.invalid.map(asString) : [];
	return {
		added: asNumber(parsed.added),
		already_listed: asNumber(parsed.alreadyListed),
		invalid_count: asNumber(parsed.invalidCount ?? invalid.length),
		total_on_list: asNumber(parsed.total),
		invalid,
	};
}

export function shapeListRemoveResponse(body: unknown, phoneNumber: string): ListRemoveOutput {
	const parsed = (body ?? {}) as IDataObject;
	return { phone_number: phoneNumber, deleted: parsed.removed === true };
}

function readResource(context: IExecuteSingleFunctions): ListResource {
	const resource = context.getNodeParameter('resource', 'suppression');
	return resource === 'consent' ? 'consent' : 'suppression';
}

/** preSend for Add: parse the list, cap it, carry reason and date if given. */
export async function buildListAddRequest(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const numbers = parseNumberList(this.getNodeParameter('phoneNumbers', ''));
	if (numbers.length === 0) {
		throw new NodeOperationError(this.getNode(), "Enter at least one number in 'Phone Numbers'", {
			itemIndex: this.getItemIndex(),
		});
	}
	if (numbers.length > MAX_LIST_NUMBERS) {
		throw new NodeOperationError(
			this.getNode(),
			`'Phone Numbers' holds ${numbers.length} numbers and one run adds up to ${MAX_LIST_NUMBERS.toLocaleString('en-GB')}. Split the list first.`,
			{ itemIndex: this.getItemIndex() },
		);
	}
	const options = this.getNodeParameter('options', {}) as IDataObject;
	return {
		...requestOptions,
		body: buildListAddBody(numbers, asString(options.reason), asString(options.occurredAt)),
	};
}

/** preSend for Remove: the number in the body, never the query string, so it stays out of access logs. */
export async function buildListRemoveRequest(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const phoneNumber = asString(this.getNodeParameter('phoneNumber', '')).trim();
	if (!phoneNumber) {
		throw new NodeOperationError(this.getNode(), "Enter a number in 'Phone Number'", {
			itemIndex: this.getItemIndex(),
		});
	}
	const options = this.getNodeParameter('options', {}) as IDataObject;
	const note = asString(options.note).trim();
	const body: IDataObject = { number: phoneNumber };
	if (note) body.note = note;
	return { ...requestOptions, body };
}

export async function listRowsPostReceive(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	return shapeListRows(response.body, readResource(this), this.getItemIndex());
}

export async function listAddPostReceive(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	return [{ json: shapeListAddResponse(response.body), pairedItem: { item: this.getItemIndex() } }];
}

export async function listRemovePostReceive(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const phoneNumber = asString(this.getNodeParameter('phoneNumber', '')).trim();
	return [
		{
			json: shapeListRemoveResponse(response.body, phoneNumber),
			pairedItem: { item: this.getItemIndex() },
		},
	];
}
