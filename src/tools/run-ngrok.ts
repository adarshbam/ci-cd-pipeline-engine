import { spawn } from "child_process";
import { PORT } from "../config/config.js";

let ngrokProcess: ReturnType<typeof spawn> | null = null;

export function runGrok() {
  console.log(`Server running on port ${PORT}`);

  const ngrokProcess = spawn("ngrok", ["http", String(PORT)], {
    stdio: "inherit",
  });

  ngrokProcess.on("error", (error) => {
    console.error("Failed to start ngrok:", error);
  });

  ngrokProcess.on("close", (code) => {
    console.log(`ngrok exited with code ${code}`);
  });

  function shutdown() {
    console.log("Shutting down ngrok...");

    ngrokProcess.kill();
  }

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
}
runGrok();
