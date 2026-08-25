export const bad = (error: string, status = 400): Response =>
  Response.json({ ok: false, error }, { status });

export const enc = new TextEncoder();

const dec = new TextDecoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function b64urlDecodeUtf8(str: string): string {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return dec.decode(bytes);
}

export async function sha256Short(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));

  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function hmac(text: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

// 「今日活動したか」の連続日数ストリーク。JSTで日付を区切る(主要ユーザー層に合わせる)。
const JST_OFFSET_SEC = 9 * 3600;
function jstDayNumber(unixSec: number): number {
  return Math.floor((unixSec + JST_OFFSET_SEC) / 86400);
}
export function nextStreakCount(
  prevCount: number,
  prevAt: number | null,
  now: number,
): number {
  if (prevAt === null) return 1;
  const prevDay = jstDayNumber(prevAt);
  const today = jstDayNumber(now);
  if (today === prevDay) return prevCount; // 同日の2件目以降はそのまま
  if (today === prevDay + 1) return prevCount + 1; // 連続
  return 1; // 途切れたのでリセット
}

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") || "";

  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");

    if (k === name) {
      return v.join("=");
    }
  }

  return null;
}
