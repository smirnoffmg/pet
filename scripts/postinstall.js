import { execSync } from "node:child_process";

if (process.env["PET_SKIP_POSTINSTALL"] === "1") {
  process.exit(0);
}

execSync("npm run build", { stdio: "inherit" });
