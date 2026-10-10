/** The public TPSClear API. Which register data a key sees is decided server side by the key. */
export const API_BASE_URL = 'https://api.tpsclear.co.uk/v1';

/**
 * Numbers per bulk screening call. The API accepts 1,000, but a full batch can
 * outlast an automation platform's step timeout while the API still completes
 * and charges, and a retry would then pay twice. 200 matches the Make app.
 */
export const MAX_SCREEN_NUMBERS = 200;

/** Numbers per suppression or consent list import, the API's own ceiling. */
export const MAX_LIST_NUMBERS = 10_000;

export type ScreenStatus =
	| 'clean'
	| 'tps-listed'
	| 'ctps-listed'
	| 'unknown'
	| 'suppressed'
	| 'consented';

const SCREEN_STATUSES: readonly ScreenStatus[] = [
	'clean',
	'tps-listed',
	'ctps-listed',
	'unknown',
	'suppressed',
	'consented',
];

export const isScreenStatus = (value: unknown): value is ScreenStatus =>
	typeof value === 'string' && (SCREEN_STATUSES as readonly string[]).includes(value);

/**
 * Plain-English rendering of each verdict, for writing back to a CRM field.
 * "unknown" covers both a register check that failed and a number that is not
 * a valid UK line, so it must never read as callable.
 */
export const STATUS_LABELS: Record<ScreenStatus, string> = {
	clean: 'Not on the TPS or CTPS register',
	'tps-listed': 'On the TPS register',
	'ctps-listed': 'On the CTPS register',
	unknown: 'Could not be checked',
	suppressed: 'On your suppression list',
	consented: 'On your consent list',
};

/**
 * True only for a clean verdict. A user filtering on the status text alone
 * writes "does not contain listed", which lets unknown through and calls a
 * number nobody screened. The boolean collapses the correct filter to one
 * click with no negation to get wrong. Same rule as the Zapier and Make apps.
 */
export const isSafeToCall = (status: ScreenStatus): boolean => status === 'clean';
