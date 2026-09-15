import fs from "node:fs";
import path from "node:path";
import type { Config } from "./types/config.js";

const configPath = path.join(process.cwd(), "src", "workflows", "config.json");

const configFile = fs.readFileSync(configPath, "utf-8");

export const config: Config = JSON.parse(configFile);

console.log(config);
