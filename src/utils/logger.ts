import { Axiom } from "@axiomhq/js";
import { AxiomJSTransport, ConsoleTransport, Logger, type Transport } from "@axiomhq/logging";
import { config } from "./config";

const axiom = new Axiom({
  token: config.axiom.token,
});

const transports: [Transport, ...Transport[]] = [
  new ConsoleTransport({
    prettyPrint: true,
    logLevel: "debug",
  }),
];

if (Bun.env.NODE_ENV === "production") {
  console.log("Logging to Axiom dataset", config.axiom.dataset);
  transports.push(
    new AxiomJSTransport({
      axiom,
      dataset: config.axiom.dataset,
    }),
  );
}

export const logger = new Logger({
  transports,
});
