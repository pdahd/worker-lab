// worker.js — v1.1
// Cloudflare Worker: z-image-turbo text-to-image demo (no SDK, fetch-only)

const SIZE_PRESETS = [
  { label: "1:1（2048×2048）", value: "2048x2048" },
  { label: "4:3（2048×1536）", value: "2048x1536" },
  { label: "3:4（1536×2048）", value: "1536x2048" },
  { label: "16:9（2048×1152）", value: "2048x1152" },
  { label: "9:16（1152×2048）", value: "1152x2048" },
  { label: "3:2（2048×1360）", value: "2048x1360" },
  { label: "2:3（1360×2048）", value: "1360x2048" },
];

function htmlPage() {
  const options = SIZE_PRESETS.map((s) => {
    const selected = s.value === "1152x2048" ? "selected" : "";
    return `<option value="${s.value}" ${selected}>${s.label}</option>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>z-image-turbo（Cloudflare Worker）</title>
  <style>
    body { 
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; 
      margin: 0; 
      padding: 16px; 
      background: #f2f2f2;
    }

    main { 
      max-width: 920px; 
      margin: 0 auto; 
      background: #ffffff;
      border-radius: 14px;
      padding: 24px; 
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }

    textarea { 
      width: 100%; 
      padding: 12px; 
      font-size: 14px; 
      box-sizing: border-box;
      border-radius: 10px;
      border: 1px solid #ccc;
      outline: none;
      transition: border-color .2s;
    }
    textarea:focus {
      border-color: #0078ff;
    }

    .row { 
      display:flex; 
      gap:12px; 
      flex-wrap:wrap; 
      align-items:center; 
      margin-top:12px; 
    }

    select, input { 
      padding: 8px 10px; 
      border-radius: 8px;
      border: 1px solid #ccc;
      outline: none;
      transition: border-color .2s;
    }
    select:focus, input:focus {
      border-color: #0078ff;
    }

    button { 
      padding: 10px 18px;
      border-radius: 8px;
      border: none;
      background: #0078ff;
      color: white;
      font-size: 14px;
      cursor: pointer;
      transition: background .2s, transform .1s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.12);
    }
    button:hover {
      background: #0063d6;
    }
    button:active {
      transform: scale(0.97);
    }
    button:disabled {
      background: #999;
      cursor: not-allowed;
    }

    img { 
      max-width: 100%; 
      border-radius: 10px; 
      margin-top: 16px; 
      display:none; 
    }

    .err { color: crimson; margin-top: 12px; white-space: pre-wrap; }
    .hint { color: #666; margin-top: 8px; }
    .small { font-size: 12px; color: #777; margin-top: 8px; }
  </style>
</head>
<body>
<main>
  <h1>z-image-turbo 文生图（Cloudflare Worker）</h1>
  <div class="small">提示：2048 档可能更慢；生成期间请保持页面在前台。</div>

  <textarea id="prompt" rows="6" placeholder="输入提示词...">一只戴墨镜的橘猫，赛博朋克霓虹灯，写实</textarea>

  <div class="row">
    <label>
      size：
      <select id="size">${options}</select>
    </label>

    <label>
      steps：
      <input id="steps" type="number" min="1" max="20" value="9" style="width:90px" />
    </label>

    <button id="gen">生成</button>
    <button id="dl" disabled>下载图片</button>
  </div>

  <div id="status" class="hint"></div>
  <div id="err" class="err"></div>

  <img id="img" alt="generated image" />
</main>

<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const promptEl = $("prompt");
  const sizeEl = $("size");
  const stepsEl = $("steps");
  const genBtn = $("gen");
  const dlBtn = $("dl");
  const imgEl = $("img");
  const errEl = $("err");
  const statusEl = $("status");

  let lastObjectUrl = null;
  let lastBlob = null;

  function setError(msg) { errEl.textContent = msg || ""; }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function cleanupObjectUrl() {
    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = null;
    }
  }

  async function generate() {
    setError("");
    setStatus("生成中...（如果长时间没反应，可能是排队或网络慢）");
    dlBtn.disabled = true;
    imgEl.style.display = "none";
    lastBlob = null;
    cleanupObjectUrl();

    const prompt = (promptEl.value || "").trim();
    const size = sizeEl.value;
    let steps = parseInt(stepsEl.value || "9", 10);
    if (!Number.isFinite(steps)) steps = 9;
    steps = Math.max(1, Math.min(20, steps));

    if (!prompt) {
      setStatus("");
      setError("Prompt 不能为空。");
      return;
    }

    genBtn.disabled = true;

    const controller = new AbortController();
    const timeoutMs = 180000;
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size, steps }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error("生成失败（HTTP " + res.status + "）\\n" + t);
      }

      const blob = await res.blob();
      lastBlob = blob;
      lastObjectUrl = URL.createObjectURL(blob);

      imgEl.src = lastObjectUrl;
      imgEl.style.display = "block";
      dlBtn.disabled = false;
      setStatus("完成");
    } catch (e) {
      setStatus("");
      if (e && e.name === "AbortError") {
        setError("请求超时（超过 " + (timeoutMs/1000) + " 秒）。可重试或降低尺寸/steps。");
      } else {
        setError(e && e.message ? e.message : String(e));
      }
    } finally {
      clearTimeout(t);
      genBtn.disabled = false;
    }
  }

  function download() {
    if (!lastBlob) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const a = document.createElement("a");
    const url = lastObjectUrl || URL.createObjectURL(lastBlob);
    a.href = url;
    a.download = "z-image-turbo-" + sizeEl.value + "-" + ts + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  genBtn.addEventListener("click", generate);
  dlBtn.addEventListener("click", download);
})();
</script>
</body>
</html>`;
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function detectMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }
  return "image/png";
}

function isAllowedSize(size) {
  return SIZE_PRESETS.some((s) => s.value === size);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(htmlPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, hasKey: Boolean(env.GITEE_AI_API_KEY) });
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      if (!env.GITEE_AI_API_KEY) {
        return textResponse("Missing secret env: GITEE_AI_API_KEY", 500);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return textResponse("Invalid JSON body", 400);
      }

      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      const size = typeof body.size === "string" ? body.size : "1152x2048";
      const stepsRaw = Number(body.steps ?? 9);
      const steps = Math.max(1, Math.min(20, Number.isFinite(stepsRaw) ? stepsRaw : 9));

      if (!prompt) return textResponse("prompt is required", 400);
      if (!isAllowedSize(size)) return textResponse("size not allowed", 400);

      let upstreamResp;
      try {
        upstreamResp = await fetch("https://ai.gitee.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GITEE_AI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "z-image-turbo",
            prompt,
            size,
            extra_body: { num_inference_steps: steps },
          }),
        });
      } catch (e) {
        return textResponse("Upstream fetch failed: " + (e?.message || String(e)), 502);
      }

      const upstreamText = await upstreamResp.text();
      if (!upstreamResp.ok) {
        return textResponse(upstreamText || `Upstream error: ${upstreamResp.status}`, 502);
      }

      let data;
      try {
        data = JSON.parse(upstreamText);
      } catch {
        return textResponse("Upstream returned non-JSON", 502);
      }

      const first = data?.data?.[0];
      if (!first) return textResponse("No image returned", 502);

      if (first.url) {
        const imgResp = await fetch(first.url);
        if (!imgResp.ok) return textResponse("Failed to fetch image URL", 502);

        const ct = imgResp.headers.get("content-type") || "image/png";
        return new Response(imgResp.body, {
          headers: {
            "Content-Type": ct,
            "Cache-Control": "no-store",
          },
        });
      }

      if (first.b64_json) {
        const bytes = b64ToBytes(first.b64_json);
        const mime = detectMime(bytes);
        return new Response(bytes, {
          headers: {
            "Content-Type": mime,
            "Cache-Control": "no-store",
          },
        });
      }

      return textResponse("No url/b64_json in upstream response", 502);
    }

    return textResponse("Not Found", 404);
  },
};
