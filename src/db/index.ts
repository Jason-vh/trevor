import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { config } from "@/utils/config";
import * as schema from "./schema";

const client = postgres(config.databaseUrl, {
  connect_timeout: 30,
  max: 1,
});
export const db = drizzle(client, { schema });
