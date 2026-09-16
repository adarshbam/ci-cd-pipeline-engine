import { spawn } from "child_process";
import { PORT } from "../config/config.js";

let ngrokProcess: ReturnType<typeof spawn> | null = null;

export function runGrok() {
  console.log(`Server running on port ${PORT}`);

  const ngrokProcess = spawn("ngrok", ["http", String(PORT)]);

  ngrokProcess.stdout.on("data", (data) => {
    console.log(`[ngrok] ${data}`);
  });

  ngrokProcess.stderr.on("data", (data) => {
    console.error(`[ngrok] ${data}`);
  });

  process.on("SIGINT", () => {
    ngrokProcess?.kill();
    process.exit();
  });
}
