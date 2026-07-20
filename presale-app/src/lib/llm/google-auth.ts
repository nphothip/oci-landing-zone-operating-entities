import { createSign } from "crypto";
import { readFileSync } from "fs";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

export function loadServiceAccount(): ServiceAccount {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");
  return JSON.parse(readFileSync(credPath, "utf8")) as ServiceAccount;
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const sa = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/cloud-platform",
    }),
  );
  const signInput = `${header}.${claim}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${signInput}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed: HTTP ${res.status} ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}
