// 빼빼로 상자: 바꾼 문구를 KV에 저장하고 12자 번호로 다시 꺼내 준다.
// 정적 파일(public/)에 없는 주소만 이 Worker로 들어온다.
const TTL_SECONDS = 365 * 24 * 60 * 60;        // 1년 뒤 자동 삭제
const MAX_BODY = 20000;                        // 저장 요청 본문 최대 글자 수
const MAX_FIELDS = 40;
const MAX_VALUE = 3000;
const ABC = "abcdefghijklmnopqrstuvwxyz0123456789";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function newId() {
  const rnd = crypto.getRandomValues(new Uint8Array(12));
  let id = "";
  for (let i = 0; i < 12; i++) id += ABC[rnd[i] % ABC.length];
  return id;
}

function clean(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.length > MAX_FIELDS) return null;
  const out = {};
  for (const k of keys) {
    const v = input[k];
    if (!/^f-[a-z0-9-]{1,24}$/.test(k) || typeof v !== "string" || v.length > MAX_VALUE) return null;
    out[k] = v;
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/save") {
      if (request.method !== "POST") return json({ error: "method" }, 405);
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "origin" }, 403);
      const body = await request.text();
      if (body.length > MAX_BODY) return json({ error: "too_long" }, 413);
      let data;
      try { data = clean(JSON.parse(body)); } catch (e) { data = null; }
      if (!data) return json({ error: "invalid" }, 400);
      try {
        let id = newId();
        if (await env.LINKS.get(id)) id = newId();
        await env.LINKS.put(id, JSON.stringify(data), { expirationTtl: TTL_SECONDS });
        return json({ id });
      } catch (e) {
        return json({ error: "storage" }, 503);   // 하루 저장 한도를 넘겼을 때 등
      }
    }

    if (url.pathname === "/api/get") {
      const id = url.searchParams.get("id") || "";
      if (!/^[a-z0-9]{12}$/.test(id)) return json({ error: "invalid" }, 400);
      try {
        const value = await env.LINKS.get(id);
        if (!value) return json({ error: "not_found" }, 404);
        return new Response(value, {
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
        });
      } catch (e) {
        return json({ error: "storage" }, 503);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
