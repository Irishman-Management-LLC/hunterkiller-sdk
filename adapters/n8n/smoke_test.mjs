import { readFileSync } from "node:fs";
const wf = JSON.parse(readFileSync(new URL("./desk_read.workflow.json", import.meta.url)));
const http = wf.nodes.find((n) => n.type === "n8n-nodes-base.httpRequest").parameters;
const q = new URLSearchParams(Object.fromEntries(http.queryParameters.parameters.map((p) => [p.name, p.value])));
const r = await (await fetch(`${http.url}?${q}`)).json();
if (!r.verdict) throw new Error("no verdict");
console.log("workflow ok;", r.verdict, "|", r.text.slice(0, 100));
