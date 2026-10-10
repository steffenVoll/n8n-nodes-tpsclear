import type {
	IDataObject,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	isSafeToCall,
	isScreenStatus,
	MAX_SCREEN_NUMBERS,
	STATUS_LABELS,
	type ScreenStatus,
} from './constants';
import { headerValue, parseNumberList } from './numbers';

interface ScreenApiResult {
	phoneNumber?: unknown;
	status?: unknown;
	tpsListed?: unknown;
	ctpsListed?: unknown;
	checkedAt?: unknown;
}

interface ScreenApiBody {
	results?: unknown;
	campaignRef?: unknown;
}

/** One output item per screened number. Every key is present on every run. */
export interface ScreenOutput extends IDataObject {
	phone_number: string;
	status: ScreenStatus;
	status_label: string;
	safe_to_call: boolean;
	tps_listed: boolean;
	ctps_listed: boolean;
	checked_at: string;
	request_id: string;
	campaign_ref: string;
}

/**
 * Build the POST /v1/screen body. Always `phoneNumbers: [...]`, never the
 * `phone` shorthand, and `campaignRef` only when set: the API rejects an
 * empty string for it.
 */
export function buildScreenBody(numbers: string[], campaignRef: string): IDataObject {
	const body: IDataObject = { phoneNumbers: numbers };
	const ref = campaignRef.trim();
	if (ref) body.campaignRef = ref;
	return body;
}

export function shapeScreenResult(
	result: ScreenApiResult,
	requestId: string,
	campaignRef: string,
): ScreenOutput {
	const status: ScreenStatus = isScreenStatus(result.status) ? result.status : 'unknown';
	return {
		phone_number: typeof result.phoneNumber === 'string' ? result.phoneNumber : '',
		status,
		status_label: STATUS_LABELS[status],
		safe_to_call: isSafeToCall(status),
		tps_listed: result.tpsListed === true,
		ctps_listed: result.ctpsListed === true,
		checked_at: typeof result.checkedAt === 'string' ? result.checkedAt : '',
		request_id: requestId,
		campaign_ref: campaignRef,
	};
}

/**
 * Shape a whole POST /v1/screen response into output items. Returns null when
 * the API answered with no results at all, which the caller turns into an
 * error rather than an empty, silently successful run.
 */
export function shapeScreenResponse(
	body: unknown,
	headers: Record<string, unknown> | undefined,
	itemIndex: number,
): INodeExecutionData[] | null {
	const parsed = (body ?? {}) as ScreenApiBody;
	const results = Array.isArray(parsed.results) ? (parsed.results as ScreenApiResult[]) : [];
	if (results.length === 0) return null;
	// The audit record id lives in a response header, not the body. It is the
	// evidence a customer quotes if a call is ever challenged.
	const requestId = headerValue(headers, 'x-request-id');
	const campaignRef = typeof parsed.campaignRef === 'string' ? parsed.campaignRef : '';
	return results.map((result) => ({
		json: shapeScreenResult(result, requestId, campaignRef),
		pairedItem: { item: itemIndex },
	}));
}

function readCampaignRef(context: IExecuteSingleFunctions): string {
	const options = context.getNodeParameter('options', {}) as IDataObject;
	const ref = options.campaignRef;
	return typeof ref === 'string' ? ref : '';
}

/** preSend for "Screen Number": one number, whatever the user typed, as a one-element batch. */
export async function buildSingleScreenRequest(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const raw = this.getNodeParameter('phoneNumber', '');
	const phoneNumber = (typeof raw === 'string' ? raw : String(raw ?? '')).trim();
	if (!phoneNumber) {
		throw new NodeOperationError(this.getNode(), "Enter a number in 'Phone Number'", {
			itemIndex: this.getItemIndex(),
		});
	}
	return { ...requestOptions, body: buildScreenBody([phoneNumber], readCampaignRef(this)) };
}

/** preSend for "Screen Many Numbers": parse the list and enforce the per-call cap. */
export async function buildBulkScreenRequest(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const numbers = parseNumberList(this.getNodeParameter('phoneNumbers', ''));
	if (numbers.length === 0) {
		throw new NodeOperationError(this.getNode(), "Enter at least one number in 'Phone Numbers'", {
			itemIndex: this.getItemIndex(),
		});
	}
	if (numbers.length > MAX_SCREEN_NUMBERS) {
		throw new NodeOperationError(
			this.getNode(),
			`'Phone Numbers' holds ${numbers.length} numbers and this operation screens up to ${MAX_SCREEN_NUMBERS} per run. Split the list with a Loop Over Items node, or a Split Out node with a batch size of ${MAX_SCREEN_NUMBERS}.`,
			{ itemIndex: this.getItemIndex() },
		);
	}
	return { ...requestOptions, body: buildScreenBody(numbers, readCampaignRef(this)) };
}

/** postReceive for both screening operations: one item per number, flat keys. */
export async function screenPostReceive(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const shaped = shapeScreenResponse(
		response.body,
		response.headers as Record<string, unknown>,
		this.getItemIndex(),
	);
	if (shaped === null) {
		throw new NodeOperationError(
			this.getNode(),
			'TPSClear returned no verdict for the number. Nothing was charged. Check the number and run the step again.',
			{ itemIndex: this.getItemIndex() },
		);
	}
	return shaped;
}

/**
 * preSend for "Get Record": the id goes into the path, so a blank one would
 * request GET /v1/screen, which answers 200 with the service description,
 * and a stray space would 404. Trim, refuse blank, encode.
 */
export async function buildGetRecordRequest(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const raw = this.getNodeParameter('recordId', '');
	const recordId = (typeof raw === 'string' ? raw : String(raw ?? '')).trim();
	if (!recordId) {
		throw new NodeOperationError(this.getNode(), "Enter the ID in 'Audit Record ID'", {
			itemIndex: this.getItemIndex(),
		});
	}
	return { ...requestOptions, url: `/screen/${encodeURIComponent(recordId)}` };
}
