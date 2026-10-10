import type { INodeProperties } from 'n8n-workflow';

import { MAX_SCREEN_NUMBERS } from '../shared/constants';
import { apiErrorPostReceive } from '../shared/errors';
import {
	buildBulkScreenRequest,
	buildGetRecordRequest,
	buildSingleScreenRequest,
	screenPostReceive,
} from '../shared/screening';

const showOnlyForScreening = { resource: ['screening'] };

export const screeningDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForScreening },
		options: [
			{
				name: 'Get Record',
				value: 'getRecord',
				action: 'Get a screening record',
				description:
					'Fetch a stored screening record by the audit record ID a screening operation returned',
				routing: {
					request: { method: 'GET', url: '/screen' },
					send: { preSend: [buildGetRecordRequest] },
					output: { postReceive: [apiErrorPostReceive] },
				},
			},
			{
				name: 'Screen Many Numbers',
				value: 'screenMany',
				action: `Screen up to ${MAX_SCREEN_NUMBERS} phone numbers`,
				description: `Screen up to ${MAX_SCREEN_NUMBERS} UK phone numbers against the TPS and CTPS registers in one call, one output item per number`,
				routing: {
					request: { method: 'POST', url: '/screen' },
					send: { preSend: [buildBulkScreenRequest] },
					output: { postReceive: [apiErrorPostReceive, screenPostReceive] },
				},
			},
			{
				name: 'Screen Number',
				value: 'screen',
				action: 'Screen a phone number',
				description:
					'Screen one UK phone number against the TPS and CTPS registers and return whether it is safe to call',
				routing: {
					request: { method: 'POST', url: '/screen' },
					send: { preSend: [buildSingleScreenRequest] },
					output: { postReceive: [apiErrorPostReceive, screenPostReceive] },
				},
			},
		],
		default: 'screen',
	},
	{
		displayName: 'Phone Number',
		name: 'phoneNumber',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. +44 20 7946 0018',
		description:
			'The UK number to screen, in any common format. Spaces, dashes and brackets are ignored. A number outside the UK comes back as unknown.',
		displayOptions: { show: { ...showOnlyForScreening, operation: ['screen'] } },
	},
	{
		displayName: 'Phone Numbers',
		name: 'phoneNumbers',
		type: 'string',
		default: '',
		required: true,
		typeOptions: { rows: 4 },
		placeholder: 'e.g. +442079460018, +441134960002',
		description: `Up to ${MAX_SCREEN_NUMBERS} UK numbers separated by commas or new lines, or an expression that returns an array. Each distinct valid UK number is one chargeable check; duplicates and invalid entries are not charged.`,
		displayOptions: { show: { ...showOnlyForScreening, operation: ['screenMany'] } },
	},
	{
		displayName: 'Audit Record ID',
		name: 'recordId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 6f1d2c9a-4b3e-4f2a-9c1d-8e7b6a5f4d3c',
		description:
			"The 'Request ID' a Screen Number or Screen Many Numbers step returned. The record holds every verdict from that call.",
		displayOptions: { show: { ...showOnlyForScreening, operation: ['getRecord'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { ...showOnlyForScreening, operation: ['screen', 'screenMany'] } },
		options: [
			{
				displayName: 'Campaign Reference',
				name: 'campaignRef',
				type: 'string',
				default: '',
				placeholder: 'e.g. Autumn outbound',
				description:
					'Tag stored on the audit record, so a later compliance question can be answered per campaign. Letters, digits, spaces and . , : / # _ - only, up to 120 characters.',
			},
		],
	},
	{
		displayName:
			'Each number screened with a live key is one chargeable check against your TPSClear allowance, including test runs in this editor. A test key (tpsc_test_) screens built-in fixtures and is free. A verdict is a snapshot: screen again before calling if it is 27 or more days old.',
		name: 'screeningNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { ...showOnlyForScreening, operation: ['screen', 'screenMany'] } },
	},
];
