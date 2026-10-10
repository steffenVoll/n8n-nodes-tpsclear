import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TpsClearApi implements ICredentialType {
	name = 'tpsClearApi';

	displayName = 'TPSClear API';

	icon: Icon = { light: 'file:../icons/tpsclear.svg', dark: 'file:../icons/tpsclear.dark.svg' };

	documentationUrl = 'https://tpsclear.co.uk/developers';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create a key at tpsclear.co.uk/account. Keys start with tpsc_test_ (screens built-in fixtures, free) or tpsc_live_ (checks the TPS and CTPS registers, one credit per number). A key from the TPSClear settings page inside HubSpot works here too.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// GET /v1/usage is authenticated, read-only and never consumes screening
	// budget, so testing a credential costs the customer nothing.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.tpsclear.co.uk/v1',
			url: '/usage',
			method: 'GET',
		},
	};
}
