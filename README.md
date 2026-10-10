# n8n-nodes-tpsclear

An [n8n](https://n8n.io/) community node for [TPSClear](https://tpsclear.co.uk). It screens UK phone numbers against the TPS and CTPS registers from inside a workflow, keeps your suppression and consent lists in step with your CRM, and reads your API usage.

TPSClear is a UK phone-number screening service. Register data is supplied through our licensed data partners, and every verdict is logged with an audit record you can quote if a call is ever questioned.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Credentials](#credentials)
[Operations](#operations)
[Output](#output)
[Errors and retries](#errors-and-retries)
[Limits](#limits)
[Compatibility](#compatibility)
[Resources](#resources)
[Version history](#version-history)

## Installation

In n8n, open **Settings**, then **Community Nodes**, then **Install**. Enter `n8n-nodes-tpsclear`, tick the risk acknowledgement and install. The node appears in the nodes panel as **TPSClear**.

For a self-hosted instance you can also run `npm install n8n-nodes-tpsclear` in your n8n user folder (`~/.n8n/nodes`) and restart n8n. Full instructions are in the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

The node authenticates with a TPSClear API key sent as a bearer token.

1. Sign in at [tpsclear.co.uk/account](https://tpsclear.co.uk/account). Sign-in is a link emailed to your work address.
2. Create a key. A **test key** (`tpsc_test_...`) screens against built-in fixtures, costs nothing and is the one to build with. A **live key** (`tpsc_live_...`) checks the TPS and CTPS registers and spends one credit, or one check of your plan allowance, per number.
3. In n8n, create a **TPSClear API** credential and paste the key. n8n tests it against `GET /v1/usage`, which is read-only and uses none of your allowance.

If you already run TPSClear inside HubSpot, the key from the app's settings page works here too and draws on that portal's plan.

With a test key, `+447403297721` comes back TPS-listed, `+442079460018` comes back CTPS-listed, and any other valid UK number comes back clean. Test keys can read the suppression and consent lists but cannot change them.

## Operations

| Resource | Operation | What it does |
| --- | --- | --- |
| Screening | Screen Number | Screens one UK number. One output item. Chargeable on a live key. |
| Screening | Screen Many Numbers | Screens up to 200 numbers in one call. One output item per number. Chargeable on a live key. |
| Screening | Get Record | Fetches a stored screening record by its audit record ID. Free. |
| Suppression List | Get Many | Lists the 100 most recent numbers on your suppression list, with the full count. Free. |
| Suppression List | Add | Adds up to 10,000 numbers, with an optional reason and date. Live key only. |
| Suppression List | Remove | Takes one number off the list, with an optional note. Live key only. |
| Consent List | Get Many | Lists the 100 most recent numbers on your consent list, with the full count. Free. |
| Consent List | Add | Adds up to 10,000 numbers, with an optional reason and date. Live key only. |
| Consent List | Remove | Takes one number off the list, with an optional note. Live key only. |
| Usage | Get | Current-window usage for the key and rolling 30-day totals for the account. Free. |

A number on your suppression list comes back from a screening operation with status `suppressed`, is not checked against the registers and is not charged. A number on your consent list comes back as `consented` on the same terms. A number on both is suppressed.

Both lists belong to your TPSClear account, so a change made from n8n applies to every key and every connected CRM on the account.

## Output

Screening operations return flat, single-underscore keys, and every key is present on every run (empty rather than absent), so downstream field mappings never break.

| Key | Meaning |
| --- | --- |
| `phone_number` | The number in E.164 form, as the API normalised it |
| `status` | `clean`, `tps-listed`, `ctps-listed`, `unknown`, `suppressed` or `consented` |
| `status_label` | The status in plain English, for writing to a CRM field |
| `safe_to_call` | `true` only for `clean`. Filter on this, not on the status text. |
| `tps_listed`, `ctps_listed` | The register flags behind the status |
| `checked_at` | When the registers were checked, ISO 8601 |
| `request_id` | The audit record ID. Pass it to Get Record, or quote it if a call is questioned. |
| `campaign_ref` | The campaign reference you sent, if any |

`unknown` covers both a register check that failed and a number that is not a valid UK line. It is never safe to call. A verdict is a snapshot: screen again before calling if it is 27 or more days old.

`safe_to_call` is `false` for `consented` as well, because the node reports register status; whether your own consent record overrides it is your decision, and the `status` field is there to make it.

Get Record returns the stored record as the API sends it: `id`, `createdAt`, `environment`, `lookups`, `campaignRef`, `summary`, `providerFailures` and `results`.

List operations return `phone_number`, `note`, `created_at`, `occurred_at` and `total_on_list` per row from Get Many; `added`, `already_listed`, `invalid_count`, `total_on_list` and `invalid` from Add; and `phone_number` and `deleted` from Remove.

Usage returns `key_name`, `key_last4`, `environment`, `plan`, `window_limit`, `window_used`, `window_remaining`, `window_seconds`, `window_reset`, `last30d_calls`, `last30d_lookups` and `last30d_approximate`.

## Errors and retries

The API's own message for a refused request appears in the node's error details. The codes worth knowing:

| Code | HTTP | Clears on retry? |
| --- | --- | --- |
| `rate_limited` | 429 | Yes, after the `Retry-After` interval. Turn on **Retry On Fail** in the node settings with a wait of a minute or more. |
| `allowance_reached` | 429 | No. The plan allowance for the period is spent and overage is off. Raise it in the TPSClear settings. |
| `daily_cap_reached` | 429 | No, until 00:00 UTC. |
| `insufficient_credits` | 402 | No. Buy a credit pack at tpsclear.co.uk/account. |
| `subscription_required` | 402 | No. The account or its HubSpot subscription is not active. |
| `test_key_read_only` | 403 | No. Use a live key to change a list. |
| `screening_switched_off` | 403 | No. Screening is switched off in the connected HubSpot account's TPSClear settings. |
| `invalid_api_key` | 401 | No. Reconnect the credential with a current key. |
| `not_found` | 404 | No. No screening record with that ID on this account. |
| `service_unavailable` | 503 | Yes. A temporary fault on the TPSClear side; run the step again shortly. |

The error headline is the API's own message, and the description names the code and says whether a retry can help. Only `rate_limited` and `service_unavailable` are worth a retry.

Nothing is charged for a request the API refuses, and a number whose register check failed (`unknown` with a provider failure) is refunded on prepaid accounts.

## Limits

- Screen Many Numbers takes up to 200 numbers per run. The API accepts 1,000, but a full batch can outlast a long step while the API still completes and charges, and a retry would then pay twice. For more, split the input with a Loop Over Items node.
- Add takes up to 10,000 numbers per run. A list holds up to 100,000.
- Get Many returns the 100 most recent entries; `total_on_list` carries the full count.
- Each key has a fair-use lookup budget per window (see Usage) and the account has a daily screening cap.

## Compatibility

Built with `@n8n/node-cli` 0.51.4 against `n8n-workflow` 2.x, with lint and unit tests green. The node uses the declarative routing style with no runtime dependencies, so it is eligible for n8n Cloud once verified. Version 0.1.0 has not yet been exercised inside an n8n instance; that run is the next step before submission.

## Resources

- [TPSClear API documentation](https://tpsclear.co.uk/developers)
- [Get an API key](https://tpsclear.co.uk/account)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Version history

- 0.1.0: first release. Screening (single, bulk, record), suppression list, consent list, usage.
