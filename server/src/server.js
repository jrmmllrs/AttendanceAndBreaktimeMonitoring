import app from "./app.js";
import { env } from "./config/env.js";

const server = app.listen(env.port, () => {
  console.log("--------------------------------------");
  console.log(" Warehouse RCS - RR API");
  console.log("--------------------------------------");
  console.log(` Environment: ${env.nodeEnv}`);
  console.log(` Port:        ${env.port}`);
  console.log(` API:         http://localhost:${env.port}/api`);
  console.log("--------------------------------------");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  server.close(() => process.exit(1));
});
