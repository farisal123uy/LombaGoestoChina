import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const url = new URL((await readFile(new URL("../../.local/linux-review/reviewer-link.private.txt", import.meta.url), "utf8")).trim());
if (url.protocol !== "https:" || !url.hostname.endsWith(".up.railway.app") || url.pathname !== "/review" || !new URLSearchParams(url.hash.slice(1)).get("access")) throw new Error("INVALID_PRIVATE_REVIEW_LINK");
if (process.platform !== "win32") throw new Error("OPEN_PRIVATE_LINK_MANUALLY");
const child = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url.toString()], { detached: true, stdio: "ignore", windowsHide: true }); child.unref();
console.log("Reviewer publik dibuka dengan kode akses privat. Kode tidak dicetak ke terminal atau dicantumkan dalam source.");
