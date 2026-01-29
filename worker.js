// worker.js — v2.1
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
/* ======== 页面背景：浅棕色 ======== */
body {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  margin: 0;
  padding: 16px;
  background: #e7d9c4;
  color: #222;
}

/* ======== 金属卡片：立体悬浮 + 拉丝 + 玻璃边框 ======== */
main {
  max-width: 920px;
  margin: 24px auto;
  border-radius: 20px;

  background:
    linear-gradient(90deg, rgba(255,255,255,0.25), rgba(0,0,0,0.05)),
    repeating-linear-gradient(
      90deg,
      rgba(255,255,255,0.18) 0px,
      rgba(255,255,255,0.18) 1px,
      rgba(0,0,0,0.06) 2px,
      rgba(0,0,0,0.06) 3px
    ),
    linear-gradient(135deg, #fafafa, #e6e6e6, #f5f5f5);

  background-size: 100% 100%, 200% 100%, 100% 100%;
  position: relative;
  overflow: hidden;

  padding: 30px;

  /* 悬浮感：双层阴影 */
  box-shadow:
    0 18px 40px rgba(0,0,0,0.35),
    0 4px 10px rgba(0,0,0,0.18),
    inset 0 1px 2px rgba(255,255,255,0.7),
    inset 0 -1px 3px rgba(0,0,0,0.15);

  border: 1px solid rgba(255,255,255,0.65);
  backdrop-filter: blur(6px);
}

/* 顶部轻微高光边缘 */
main::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.35);
  pointer-events: none;
}

/* ======== 镭射扫光（更短间隔） ======== */
main::before {
  content: "";
  position: absolute;
  top: 0;
  left: -120%;
  width: 60%;
  height: 100%;

  /* 镭射渐变：青 → 紫 → 粉 → 黄 */
  background: linear-gradient(
    120deg,
    rgba(0,255,255,0) 0%,
    rgba(0,255,255,0.55) 20%,
    rgba(180,0,255,0.55) 40%,
    rgba(255,0,150,0.55) 60%,
    rgba(255,255,0,0.55) 80%,
    rgba(255,255,0,0) 100%
  );

  transform: skewX(-20deg);
  opacity: 0;
  pointer-events: none;
}

main.sweep-active::before {
  opacity: 1;
  animation: sweep 3.5s ease-in-out infinite;
}

@keyframes sweep {
  0% { left: -120%; }
  45% { left: 140%; }
  100% { left: 140%; }
}

h1 {
  color: #222;
  text-shadow: 0 1px 2px rgba(255,255,255,0.7);
  margin-top: 0;
}

.small {
  color: #555;
}

/* ======== 输入框：双层玻璃（金属 + 磨砂） ======== */
textarea {
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  box-sizing: border-box;
  border-radius: 14px;

  background: radial-gradient(circle at top left, rgba(255,255,255,0.7), rgba(255,245,225,0.4));
  background-color: rgba(255,245,225,0.4);
  backdrop-filter: blur(8px);

  border: 1px solid rgba(255,255,255,0.8);
  box-shadow:
    inset 0 1px 2px rgba(255,255,255,0.9),
    inset 0 -1px 3px rgba(0,0,0,0.18),
    0 2px 6px rgba(0,0,0,0.18);

  color: #333;
  transition: border-color .2s, box-shadow .2s, background .2s;
}

textarea:focus {
  border-color: #5ab0ff;
  box-shadow:
    inset 0 1px 2px rgba(255,255,255,1),
    inset 0 -1px 3px rgba(0,0,0,0.22),
    0 3px 10px rgba(0,0,0,0.25);
  background: radial-gradient(circle at top left, rgba(255,255,255,0.9), rgba(255,245,225,0.55));
}

/* ======== 行布局 ======== */
.row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 12px;
}

select, input {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #bbb;
  background: #ffffffdd;
  color: #222;
  backdrop-filter: blur(4px);
  transition: border-color .2s, box-shadow .2s;
}

select:focus, input:focus {
  border-color: #4da3ff;
  box-shadow: 0 0 0 1px rgba(77,163,255,0.4);
}

/* ======== 按钮：霓虹发光风格 ======== */
button {
  padding: 10px 18px;
  border-radius: 10px;
  border: 1px solid rgba(90,176,255,0.9);
  background: radial-gradient(circle at 20% 0%, #5ab0ff, #0066ff);
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition:
    background .2s,
    transform .1s,
    box-shadow .2s,
    border-color .2s;
  box-shadow:
    0 0 0 1px rgba(90,176,255,0.6),
    0 4px 10px rgba(0,0,0,0.35),
    0 0 12px rgba(90,176,255,0.4);
}

button:hover {
  background: radial-gradient(circle at 20% 0%, #6bc0ff, #1a74ff);
  box-shadow:
    0 0 0 1px rgba(120,196,255,0.9),
    0 6px 16px rgba(0,0,0,0.45),
    0 0 18px rgba(120,196,255,0.7);
  border-color: rgba(120,196,255,1);
}

button:active {
  transform: scale(0.96);
  box-shadow:
    0 0 0 1px rgba(140,210,255,1),
    0 3px 8px rgba(0,0,0,0.4),
    0 0 14px rgba(140,210,255,0.9);
}

button:disabled {
  background: #777;
  border-color: #777;
  cursor: not-allowed;
  box-shadow: none;
}

img {
  max-width: 100%;
  border-radius: 10px;
  margin-top: 16px;
  display: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
}

.err { color: #cc0000; margin-top: 12px; white-space: pre-wrap; }
.hint { color: #444; margin-top: 8px; }
</style>
</head>

<body>
<main id="card">
  <h1>z-image-turbo 文生图（Cloudflare Worker）</h1>
  <div class="small">提示：2048 档可能更慢；生成期间请保持页面在前台。</div>

  <textarea id="prompt" rows="6">一只戴墨镜的橘猫，赛博朋克霓虹灯，写实</textarea>

  <div class="row">
    <label>size：<select id="size">${options}</select></label>
    <label>steps：<input id="steps" type="number" min="1" max="20" value="9" style="width:90px" /></label>
    <button id="gen">生成</button>
    <button id="dl" disabled>下载图片</button>
  </div>

  <div id="status" class="hint"></div>
  <div id="err" class="err"></div>
  <img id="img" />
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
  const cardEl = $("card");

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
    setStatus("生成中...");
    dlBtn.disabled = true;
    imgEl.style.display = "none";
    lastBlob = null;
    cleanupObjectUrl();

    // 启动扫光
    cardEl.classList.add("sweep-active");

    const prompt = promptEl.value.trim();
    const size = sizeEl.value;
    let steps = parseInt(stepsEl.value || "9", 10);
    steps = Math.max(1, Math.min(20, steps));

    if (!prompt) {
      setStatus("");
      setError("Prompt 不能为空。");
      cardEl.classList.remove("sweep-active");
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
        throw new Error("生成失败（HTTP " + res.status + "）\n" + t);
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
      if (e.name === "AbortError") {
        setError("请求超时，可重试或降低尺寸/steps。");
      } else {
        setError(e.message || String(e));
      }
    } finally {
      clearTimeout(t);
      genBtn.disabled = false;
      // 停止扫光
      cardEl.classList.remove("sweep-active");
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
