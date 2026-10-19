import plugin from "./dist/index.js";
const action = plugin.actions[0];
let said = "";
const res = await action.handler({}, { content: { text: "Desk Read for a 20x long BTC at 82000" } }, null, null, (r) => (said = r.text));
if (!res.success || !said.includes("Desk Read BTCUSDT")) throw new Error("bad output: " + said);
console.log(said.slice(0, 160));
