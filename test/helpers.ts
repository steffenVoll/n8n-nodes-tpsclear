import type { IExecuteSingleFunctions, IHttpRequestOptions, INode } from 'n8n-workflow';

/**
 * The slice of IExecuteSingleFunctions the preSend and postReceive helpers
 * touch. Parameters are served from a plain object, exactly as n8n would
 * resolve them for one item.
 */
export function mockContext(
	parameters: Record<string, unknown>,
	itemIndex = 0,
): IExecuteSingleFunctions {
	const node: INode = {
		id: 'test-node',
		name: 'TPSClear',
		type: 'n8n-nodes-tpsclear.tpsClear',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	const context = {
		getNode: () => node,
		getItemIndex: () => itemIndex,
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in parameters ? parameters[name] : fallback,
	};
	return context as unknown as IExecuteSingleFunctions;
}

export const baseRequest = (): IHttpRequestOptions => ({
	url: '/screen',
	method: 'POST',
	baseURL: 'https://api.tpsclear.co.uk/v1',
	headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
	qs: {},
	body: {},
});

/** A response as the routing node hands it to postReceive: body, headers, status. */
export const mockResponse = (body: unknown, headers: Record<string, unknown> = {}, statusCode = 200) => ({
	body: body as never,
	headers,
	statusCode,
});
