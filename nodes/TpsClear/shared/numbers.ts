/**
 * Turn whatever a user put in a "Phone Numbers" field into a list of strings.
 *
 * Accepts a comma, semicolon or newline separated string, an array (from an
 * expression such as {{ $json.phones }}), or a single number. Entries are
 * trimmed and blanks dropped. Nothing else is done to them: the API
 * normalises, de-duplicates and decides validity itself, so a number that
 * looks odd here is still sent and comes back as unknown rather than being
 * silently dropped on this side.
 */
export function parseNumberList(raw: unknown): string[] {
	if (raw === null || raw === undefined) return [];
	const values: unknown[] = Array.isArray(raw) ? raw : [raw];
	const out: string[] = [];
	for (const value of values) {
		if (value === null || value === undefined) continue;
		if (Array.isArray(value)) {
			out.push(...parseNumberList(value));
			continue;
		}
		const text = typeof value === 'string' ? value : String(value);
		for (const part of text.split(/[,;\r\n]+/)) {
			const trimmed = part.trim();
			if (trimmed) out.push(trimmed);
		}
	}
	return out;
}

/** Read a response header case-insensitively; axios lowercases them, other clients may not. */
export function headerValue(headers: Record<string, unknown> | undefined, name: string): string {
	if (!headers) return '';
	const wanted = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === wanted) {
			if (Array.isArray(value)) return value.length ? String(value[0]) : '';
			return value === null || value === undefined ? '' : String(value);
		}
	}
	return '';
}
