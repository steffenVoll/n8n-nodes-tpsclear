import type { INodeProperties } from 'n8n-workflow';

import { apiErrorPostReceive } from '../shared/errors';
import { MAX_LIST_NUMBERS } from '../shared/constants';
import {
	buildListAddRequest,
	buildListRemoveRequest,
	LIST_PATHS,
	listAddPostReceive,
	listRemovePostReceive,
	listRowsPostReceive,
	type ListResource,
} from '../shared/lists';

/** The API returns at most this many rows from a list; the count field carries the full size. */
const LIST_ROW_CAP = 100;

/**
 * The suppression and consent lists share one API shape, so one factory
 * produces both resources. Only the wording and the path differ.
 */
export function numberListDescription(resource: ListResource, label: string): INodeProperties[] {
	const show = { resource: [resource] };
	const path = LIST_PATHS[resource];
	const capText = MAX_LIST_NUMBERS.toLocaleString('en-GB');

	return [
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show },
			options: [
				{
					name: 'Add',
					value: 'add',
					action: `Add numbers to the ${label}`,
					description: `Add one or more UK numbers to your ${label}. A number already on the list is left as it is.`,
					routing: {
						request: { method: 'POST', url: path },
						send: { preSend: [buildListAddRequest] },
						output: { postReceive: [apiErrorPostReceive, listAddPostReceive] },
					},
				},
				{
					name: 'Get Many',
					value: 'getAll',
					action: `Get numbers on the ${label}`,
					description: `Get the ${LIST_ROW_CAP} most recent entries on your ${label}, one item per number. 'Total on List' carries the full count.`,
					routing: {
						request: { method: 'GET', url: path },
						output: { postReceive: [apiErrorPostReceive, listRowsPostReceive] },
					},
				},
				{
					name: 'Remove',
					value: 'remove',
					action: `Remove a number from the ${label}`,
					description: `Take one UK number off your ${label}`,
					routing: {
						request: { method: 'DELETE', url: path },
						send: { preSend: [buildListRemoveRequest] },
						output: { postReceive: [apiErrorPostReceive, listRemovePostReceive] },
					},
				},
			],
			default: 'add',
		},
		{
			displayName: 'Phone Numbers',
			name: 'phoneNumbers',
			type: 'string',
			default: '',
			required: true,
			typeOptions: { rows: 4 },
			placeholder: 'e.g. +442079460018, +441134960002',
			description: `Up to ${capText} UK numbers separated by commas or new lines, or an expression that returns an array`,
			displayOptions: { show: { ...show, operation: ['add'] } },
		},
		{
			displayName: 'Phone Number',
			name: 'phoneNumber',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. +44 20 7946 0018',
			description: `The UK number to take off your ${label}`,
			displayOptions: { show: { ...show, operation: ['remove'] } },
		},
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: { ...show, operation: ['getAll'] } },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1, maxValue: LIST_ROW_CAP },
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, operation: ['getAll'], returnAll: [false] } },
			routing: { output: { maxResults: '={{$value}}' } },
		},
		{
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			placeholder: 'Add option',
			default: {},
			displayOptions: { show: { ...show, operation: ['add'] } },
			options: [
				{
					displayName: 'Reason',
					name: 'reason',
					type: 'string',
					default: '',
					placeholder: 'e.g. Asked not to be called',
					description: 'Why each number is being added, stored against every number in this run',
				},
				{
					displayName: 'Occurred At',
					name: 'occurredAt',
					type: 'dateTime',
					default: '',
					description:
						'When the opt-out or consent happened, stored against every number in this run. Defaults to now.',
				},
			],
		},
		{
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			placeholder: 'Add option',
			default: {},
			displayOptions: { show: { ...show, operation: ['remove'] } },
			options: [
				{
					displayName: 'Note',
					name: 'note',
					type: 'string',
					default: '',
					placeholder: 'e.g. Consent given on the phone',
					description: 'Why the number is coming off the list, kept in the audit trail',
				},
			],
		},
		{
			displayName:
				'The list belongs to your TPSClear account, so a change here applies to every key and every connected CRM on the account. Only a live key (tpsc_live_) can change a list; a test key can read it.',
			name: 'listNotice',
			type: 'notice',
			default: '',
			displayOptions: { show: { ...show, operation: ['add', 'remove'] } },
		},
	];
}
