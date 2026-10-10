import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';

import { numberListDescription } from './resources/numberList';
import { screeningDescription } from './resources/screening';
import { usageDescription } from './resources/usage';
import { API_BASE_URL } from './shared/constants';

/**
 * Thin client over the public TPSClear API. Verdict resolution, retries,
 * provider fallback, caching and every allowance live server side, so nothing
 * in this node decides anything and a change of business rule never needs a
 * new package version.
 */
export class TpsClear implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TPSClear',
		name: 'tpsClear',
		icon: { light: 'file:../../icons/tpsclear.svg', dark: 'file:../../icons/tpsclear.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description:
			'Screen UK phone numbers against the TPS and CTPS registers and manage your suppression and consent lists',
		defaults: {
			name: 'TPSClear',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'tpsClearApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: API_BASE_URL,
			// HTTP errors reach apiErrorPostReceive, which keeps the API's own
			// error code and message instead of n8n's generic 429 text.
			ignoreHttpStatusErrors: true,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Consent List',
						value: 'consent',
					},
					{
						name: 'Screening',
						value: 'screening',
					},
					{
						name: 'Suppression List',
						value: 'suppression',
					},
					{
						name: 'Usage',
						value: 'usage',
					},
				],
				default: 'screening',
			},
			...screeningDescription,
			...numberListDescription('suppression', 'suppression list'),
			...numberListDescription('consent', 'consent list'),
			...usageDescription,
		],
	};
}
