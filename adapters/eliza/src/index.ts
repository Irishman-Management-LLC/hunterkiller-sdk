import { deskRead } from "hunterkiller-sdk";

// Structural types so the plugin builds without pinning an Eliza version.
type Runtime = { getSetting?: (k: string) => string | undefined };
type Message = { content?: { text?: string } };
type Callback = (r: { text: string }) => unknown;

const SYMBOL = /\b([A-Z]{2,10})(USDT)?\b/;

export const deskReadAction = {
  name: "DESK_READ",
  similes: ["LIQUIDATION_CHECK", "PRETRADE_CHECK", "CHECK_LIQUIDATION_WALLS"],
  description: "Hunter Killer Desk Read: where liquidation money is stacked before a leveraged perp order, with a verdict (proceed, reduce, skip).",
  validate: async (_rt: Runtime, m: Message) => /desk read|liquidat|leverag|long|short/i.test(m.content?.text ?? ""),
  handler: async (rt: Runtime, m: Message, _s: unknown, _o: unknown, cb?: Callback) => {
    const t = m.content?.text ?? "";
    const sym = (t.match(SYMBOL)?.[1] ?? "BTC").replace(/USDT$/, "") + "USDT";
    const side = /short/i.test(t) ? "short" : /long/i.test(t) ? "long" : undefined;
    const entry = Number(t.match(/(?:entry|at|from)\s*\$?([\d.]+)/i)?.[1]) || undefined;
    const leverage = Number(t.match(/(\d+)\s*x/i)?.[1]) || undefined;
    const r = await deskRead(sym, { side, entry, leverage }, { key: rt.getSetting?.("HK_API_KEY") });
    const text = `Desk Read ${sym}${r.verdict ? " (" + r.verdict + ")" : ""}: ${r.text}`;
    await cb?.({ text });
    return { success: true, text };
  },
  examples: [[
    { user: "{{user1}}", content: { text: "Desk Read before I go 20x long BTC at 82000" } },
    { user: "{{agent}}", content: { text: "Running the Desk Read.", action: "DESK_READ" } },
  ]],
};

export const hunterKillerPlugin = {
  name: "@hunterkiller/plugin-eliza",
  description: "Hunter Killer Desk Read for ElizaOS agents",
  actions: [deskReadAction],
};
export default hunterKillerPlugin;
