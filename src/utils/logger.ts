import { Axiom } from "@axiomhq/js";
import { AxiomJSTransport, ConsoleTransport, Logger, type Transport } from "@axiomhq/logging";
import { config } from "./config";

const transports: [Transport, ...Transport[]] = [
  new ConsoleTransport({
    prettyPrint: true,
    logLevel: "debug",
  }),
];

if (Bun.env.NODE_ENV === "production" && config.axiom.token && config.axiom.dataset) {
  console.log("Logging to Axiom dataset", config.axiom.dataset);

  const axiom = new Axiom({
    token: config.axiom.token,
  });

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
