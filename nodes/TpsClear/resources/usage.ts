import type { INodeProperties } from 'n8n-workflow';

import { apiErrorPostReceive } from '../shared/errors';
import { usagePostReceive } from '../shared/usage';

export const usageDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['usage'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get API usage',
				description:
					'Get the current-window usage for this key and the rolling 30-day totals for the account. Reading usage never consumes any of it.',
				routing: {
					request: { method: 'GET', url: '/usage' },
					output: { postReceive: [apiErrorPostReceive, usagePostReceive] },
				},
			},
		],
		default: 'get',
	},
];
