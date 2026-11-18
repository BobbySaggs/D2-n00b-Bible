import { BNET, BUNGIE } from "./config";
import { getToken, signOut } from "./auth";

export class BungieError extends Error {
  status: string;
  signedOut: boolean;
  constructor(msg: string, status = "", signedOut = false) {
    super(msg);
    this.status = status;
    this.signedOut = signedOut;
  }
}

// One Bungie Platform call. Throws BungieError with a plain-words message.
export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "X-API-Key": BUNGIE.apiKey };
  const t = getToken();
  if (t) headers.Authorization = "Bearer " + t.access;
  const init: RequestInit = body
    ? { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { headers };
  let r: Response;
  try {
    r = await fetch(BNET + "/Platform" + path, init);
  } catch {
    throw new BungieError(`Couldn't reach Bungie. Check your connection, or that the Bungie app's Origin Header is ${location.origin}.`);
  }
  let j: { ErrorCode?: number; ErrorStatus?: string; Message?: string; Response?: T };
  try {
    j = await r.json();
  } catch {
    throw new BungieError(`Bungie returned HTTP ${r.status}.`);
  }
  if (j.ErrorCode !== 1) {
    if (r.status === 401 || j.ErrorCode === 99 || j.ErrorCode === 2111) {
      signOut();
      throw new BungieError("Your Bungie sign-in ran out. Sign in again (it takes a few seconds).", j.ErrorStatus, true);
    }
    if (j.ErrorCode === 5) throw new BungieError("Bungie is down for maintenance. Try again later.", j.ErrorStatus);
    throw new BungieError(`${j.ErrorStatus || "Error"}: ${j.Message || "unknown"}`, j.ErrorStatus);
  }
  return j.Response as T;
}
