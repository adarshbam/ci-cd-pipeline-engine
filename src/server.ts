import express from "express";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { exec } from "child_process";

const app = express();

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Hello from TypeScript + Express!",
  });
});

app.get("/run", (req: Request, res: Response) => {
  console.log(config.deployment.runScript);

  exec(`bash ${config.deployment.runScript}`, (error, stdout, stderr) => {
    if (error) {
      console.error("Deployment failed:", error.message);
      return;
    }

    console.log("Deployment output:");
    console.log(stdout);
  });

  res.json({ runScript: config.deployment.runScript });
});

app.get("/config", (req: Request, res: Response) => {
  res.json({
    config,
  });
});

app.get("/users/:id", (req: Request<{ id: string }>, res: Response) => {
  let id = req.params.id;

  res.json({
    userId: id,
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
