import app from "./app.js";
import { getEnv } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const env = getEnv();

async function main() {
  await prisma.$connect();
  console.log("Database connected");

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
