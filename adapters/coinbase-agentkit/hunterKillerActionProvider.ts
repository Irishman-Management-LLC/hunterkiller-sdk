import { ActionProvider, CreateAction, Network } from "@coinbase/agentkit";
import { deskRead } from "hunterkiller-sdk";
import { z } from "zod";

const DeskReadSchema = z.object({
  symbol: z.string().describe("Perp pair, e.g. BTCUSDT"),
  side: z.enum(["long", "short"]).optional().describe("Your position side"),
  entry: z.number().optional().describe("Your entry price"),
  leverage: z.number().optional().describe("Your leverage, e.g. 20"),
});

export class HunterKillerActionProvider extends ActionProvider {
  constructor(private key = process.env.HK_API_KEY) {
    super("hunterkiller", []);
  }

  @CreateAction({
    name: "deskRead",
    description: "Call before a leveraged perp order. Returns where liquidation money is stacked and a verdict (proceed, reduce, skip).",
    schema: DeskReadSchema,
  })
  async deskRead(args: z.infer<typeof DeskReadSchema>): Promise<string> {
    const { symbol, ...position } = args;
    const r = await deskRead(symbol, position, { key: this.key });
    return `verdict: ${r.verdict}\n${r.text}`;
  }

  supportsNetwork = (_n: Network) => true;
}

export const hunterKillerActionProvider = (key?: string) => new HunterKillerActionProvider(key);
