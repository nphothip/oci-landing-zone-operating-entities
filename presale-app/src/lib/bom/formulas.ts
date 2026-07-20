// Monthly math helpers. OCI's cost estimator standard is 744 hours/month.
export const HOURS_PER_MONTH = 744;

export const hours = (units: number) => units * HOURS_PER_MONTH;

/** Tokens -> "10,000 transactions" metric used by OCI GenAI on-demand SKUs. */
export const tokensTo10k = (tokens: number) => tokens / 10_000;

/** Requests -> "1,000,000 requests" metric (WAF). */
export const toMillions = (n: number) => n / 1_000_000;
