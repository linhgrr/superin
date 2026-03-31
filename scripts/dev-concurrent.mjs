import { spawn } from "node:child_process";

const children = [];

function spawnScript(label, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      for (const otherChild of children) {
        if (otherChild.pid && otherChild !== child) {
          otherChild.kill("SIGTERM");
        }
      }
      process.exit(code);
    }
  });

  return child;
}

function shutdown(signal) {
  for (const child of children) {
    if (child.pid) {
      child.kill(signal);
    }
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("starting backend...");
spawnScript("backend", "npm", ["run", "dev:backend"]);

setTimeout(() => {
  console.log("starting frontend...");
  spawnScript("frontend", "npm", ["run", "dev:frontend"]);
}, 1500);
