import { BNET, BUNGIE, BETA_STATE_PREFIX } from "./config";

// Same storage key and shape as the classic app, so a sign-in on either works on both.
const TOKEN_KEY = "hle-token";
const STATE_KEY = "steeped-state";

export interface Token {
  access: string;
  exp: number; // ms epoch, already 60 s early
  mid: string; // Bungie membership id
  refresh: string | null;
  rexp: number;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getToken(): Token | null {
  const raw = read(TOKEN_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Token;
    return t && t.access && t.exp > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export function minutesLeft(): number {
  const t = getToken();
  return t ? Math.max(0, Math.floor((t.exp - Date.now()) / 60000)) : 0;
}

export function saveToken(j: {
  access_token: string; expires_in?: number; membership_id?: string; refresh_token?: string; refresh_expires_in?: number;
}) {
  const t: Token = {
    access: j.access_token,
    exp: Date.now() + (j.expires_in ?? 3600) * 1000 - 60000,
    mid: String(j.membership_id ?? ""),
    refresh: j.refresh_token ?? null,
    rexp: j.refresh_token ? Date.now() + (j.refresh_expires_in ?? 7776000) * 1000 - 60000 : 0,
  };
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  } catch {
    /* storage blocked: sign-in lasts for this page only */
  }
}

export function signOut() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// Sends you to Bungie. Bungie returns to the main site, which forwards beta sign-ins back here.
export function startSignIn() {
  const state = BETA_STATE_PREFIX + Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* ignore */
  }
  location.href = `${BNET}/en/OAuth/Authorize?client_id=${encodeURIComponent(BUNGIE.clientId)}&response_type=code&state=${state}`;
}

// Runs on page load: if Bungie (via the main site) handed us a code, trade it for a token.
export async function finishSignIn(): Promise<boolean> {
  const p = new URLSearchParams(location.search);
  const code = p.get("code"), err = p.get("error");
  if (!code && !err) return false;
  history.replaceState(null, "", location.pathname);
  if (err) throw new Error(`Bungie sign-in was cancelled or refused (${err}).`);
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(STATE_KEY);
  } catch {
    /* ignore */
  }
  if (expected && p.get("state") !== expected) throw new Error("Sign-in check failed. Tap Sign in with Bungie again.");
  const r = await fetch(`${BNET}/platform/app/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: code!, client_id: BUNGIE.clientId }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Bungie didn't accept the sign-in (${j.error_description || j.error || "HTTP " + r.status}).`);
  saveToken(j);
  return true;
}
