import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { root } from "../services/config.mjs";

const out = join(root, "submission/generated"), data = JSON.parse(await readFile(join(out, "deck-data.json"), "utf8"));
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function markdown(text) {
  let code = false, table = false;
  const lines = text.split(/\r?\n/).map((line) => {
    if (!code && line.startsWith("|")) {
      if (/^\|[\s:|-]+$/.test(line)) return "";
      const prefix = table ? "" : "<table>"; table = true;
      return prefix + `<tr>${line.split("|").slice(1, -1).map((cell) => `<td>${escape(cell.trim())}</td>`).join("")}</tr>`;
    }
    const prefix = table ? "</table>" : ""; table = false;
    if (line.startsWith("```")) { code = !code; return code ? "<pre>" : "</pre>"; }
    if (code) return escape(line) + "\n";
    const heading = line.match(/^(#{1,4}) (.*)$/);
    if (heading) return prefix + `<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>`;
    if (!line.trim()) return prefix;
    return prefix + `<p>${escape(line).replaceAll(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replaceAll(/`([^`]+)`/g, "<code>$1</code>")}</p>`;
  });
  return lines.join("\n") + (table ? "</table>" : "");
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(pathToFileURL(join(out, "presentation.html")).href);
  await page.pdf({ path: join(out, "Guardian-Wallet-presentation.pdf"), printBackground: true, preferCSSPageSize: true });
  await page.locator(".slide").first().screenshot({ path: join(out, "presentation-preview.png") });
  for (const [source, name] of [["submission/technical-documentation.md", "technical-documentation"], ["docs/security-assessment.md", "security-self-assessment"]]) {
    await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><style>@page{size:A4;margin:17mm}body{font:11pt/1.45 Arial;color:#172b3a}h1{font-size:24pt;color:#0c4a5e}h2{font-size:15pt;margin-top:22pt}pre,code{font:9pt Consolas,monospace;overflow-wrap:anywhere;white-space:pre-wrap}p{margin:5pt 0;overflow-wrap:anywhere}h1,h2{break-after:avoid}table{border-collapse:collapse;font-size:9pt;width:100%}td{border:1px solid #bbc8ce;padding:5pt;vertical-align:top}tr{break-inside:avoid}</style><article>${markdown(await readFile(join(root, source), "utf8"))}</article></html>`);
    await page.pdf({ path: join(out, `Guardian-Wallet-${name}.pdf`), printBackground: true, preferCSSPageSize: true });
  }
  let video;
  if (process.argv.includes("--video")) {
    const audio = await Promise.all(data.slides.map(async (_slide, index) => (await readFile(join(out, `narration/slide-${String(index + 1).padStart(2, "0")}.wav`))).toString("base64")));
    const chunks = [];
    await page.exposeFunction("acceptVideoChunk", (index, value) => { chunks[index] = Buffer.from(value, "base64"); });
    await page.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><body style="margin:0;background:#071523"><canvas id="review" width="1280" height="720"></canvas></body></html>');
    video = await page.evaluate(async ({ slides, audio }) => {
      const canvas = document.getElementById("review"), ctx = canvas.getContext("2d"), sound = new AudioContext(), destination = sound.createMediaStreamDestination();
      const buffers = await Promise.all(audio.map(async (base64) => sound.decodeAudioData(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer)));
      const totalAudio = buffers.reduce((sum, buffer) => sum + buffer.duration, 0);
      if (totalAudio + slides.length * .8 + 2 > 295) throw new Error("NARRATION_EXCEEDS_FIVE_MINUTE_LIMIT");
      const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...destination.stream.getAudioTracks()]);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm;codecs=vp8,opus";
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1000000, audioBitsPerSecond: 64000 }), pending = [];
      let part = 0;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        const sequence = part++;
        pending.push((async () => {
          const bytes = new Uint8Array(await event.data.arrayBuffer()); let value = "";
          for (let i = 0; i < bytes.length; i += 4096) value += String.fromCharCode(...bytes.subarray(i, i + 4096));
          await window.acceptVideoChunk(sequence, btoa(value));
        })());
      };
      let index = 0, slideStart = performance.now(), running = true;
      function wrap(text, x, y, maxWidth, lineHeight) {
        let line = "";
        for (const word of text.split(/\s+/)) {
          if (ctx.measureText(line + word).width > maxWidth && line) { ctx.fillText(line, x, y); y += lineHeight; line = ""; }
          line += word + " ";
        }
        ctx.fillText(line, x, y); return y + lineHeight;
      }
      function draw() {
        const slide = slides[index]; ctx.fillStyle = "#071523"; ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = "#65e0ca"; ctx.font = "16px Arial"; ctx.fillText("RECORDED EVIDENCE REVIEW · PUBLIC TESTNET + LOCAL EVALUATION", 64, 45);
        ctx.font = "15px Arial"; ctx.fillStyle = "#a6c7d5"; ctx.fillText(slide.eyebrow, 64, 91);
        ctx.fillStyle = "#edf5fb"; ctx.font = "bold 44px Arial"; let y = wrap(slide.title, 64, 155, 1150, 49) + 24;
        ctx.font = "25px Arial";
        for (const bullet of slide.bullets) { y = wrap("• " + bullet, 72, y, 1125, 35) + 18; }
        ctx.fillStyle = "#a6c7d5"; ctx.font = "15px Arial"; wrap(slide.evidence, 64, 650, 1120, 20);
        ctx.fillStyle = "#65e0ca"; ctx.fillRect(0, 711, 1280 * Math.min(1, (performance.now() - slideStart) / (buffers[index].duration * 1000 + 800)), 9);
        ctx.fillStyle = "#b9d1de"; ctx.fillText(`${index + 1} / ${slides.length} · English synthesized narration · no new payment`, 64, 698);
        if (running) requestAnimationFrame(draw);
      }
      await sound.resume(); draw(); recorder.start(1000); const started = performance.now();
      for (index = 0; index < slides.length; index++) {
        slideStart = performance.now(); await new Promise((resolve) => setTimeout(resolve, 800));
        const source = sound.createBufferSource(); source.buffer = buffers[index]; source.connect(destination);
        await new Promise((resolve) => { source.onended = resolve; source.start(); });
      }
      index = slides.length - 1; await new Promise((resolve) => setTimeout(resolve, 1000));
      await new Promise((resolve) => { recorder.onstop = resolve; recorder.stop(); });
      running = false; await Promise.all(pending); await sound.close();
      return { durationSeconds: Math.round((performance.now() - started) / 100) / 10, mimeType, audioSeconds: Math.round(totalAudio * 10) / 10, slides: slides.length, source: "captured-evidence-not-live-execution", narration: "Microsoft David Desktop / local System.Speech" };
    }, { slides: data.slides, audio });
    const bytes = Buffer.concat(chunks); await writeFile(join(out, "Guardian-Wallet-evidence-walkthrough.webm"), bytes);
    await writeFile(join(out, "video-metadata.json"), `${JSON.stringify({ ...video, bytes: bytes.length }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ pdfExports: 3, video: video || "not requested" }));
} finally { await browser.close(); }
