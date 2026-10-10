import type {
	IDataObject,
	IExecuteSingleFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
} from 'n8n-workflow';

export interface UsageOutput extends IDataObject {
	key_name: string;
	key_last4: string;
	environment: string;
	plan: string;
	window_limit: number;
	window_used: number;
	window_remaining: number;
	window_seconds: number;
	window_reset: number;
	last30d_calls: number;
	last30d_lookups: number;
	last30d_approximate: boolean;
}

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0) || 0);
const str = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/** Flatten GET /v1/usage so every field maps as a top-level key. */
export function shapeUsage(body: unknown): UsageOutput {
	const parsed = (body ?? {}) as IDataObject;
	const key = (parsed.key ?? {}) as IDataObject;
	const window = (parsed.window ?? {}) as IDataObject;
	const last30d = (parsed.last30d ?? {}) as IDataObject;
	return {
		key_name: str(key.name),
		key_last4: str(key.last4),
		environment: str(parsed.environment),
		plan: str(parsed.plan),
		window_limit: num(window.limit),
		window_used: num(window.used),
		window_remaining: num(window.remaining),
		window_seconds: num(window.windowSecs),
		window_reset: num(window.reset),
		last30d_calls: num(last30d.calls),
		last30d_lookups: num(last30d.lookups),
		last30d_approximate: last30d.approximate === true,
	};
}

export async function usagePostReceive(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	return [{ json: shapeUsage(response.body), pairedItem: { item: this.getItemIndex() } }];
}
