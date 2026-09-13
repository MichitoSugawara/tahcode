// Generates Convex Auth keys for the LOCAL backend and installs them via
// the backend admin API (works in anonymous/agent mode without `convex login`).
//
// Usage:
//   1. Start the backend once: CONVEX_AGENT_MODE=anonymous npx convex dev
//   2. Run: npm run setup:local-auth
//
// Keys are stored in .tahcode/ (gitignored). The backend persists env
// vars in its local sqlite, so this is only needed once per fresh .convex/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const DIR = ".tahcode";
const PK_PATH = `${DIR}/jwt_private.key`;
const JWKS_PATH = `${DIR}/jwks.json`;
const BACKEND_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";

mkdirSync(DIR, { recursive: true });

let privateKey;
let jwks;
if (existsSync(PK_PATH) && existsSync(JWKS_PATH)) {
  privateKey = readFileSync(PK_PATH, "utf8").trim();
  jwks = readFileSync(JWKS_PATH, "utf8").trim();
  console.log("Reusing existing keys in .tahcode/");
} else {
  const keys = await generateKeyPair("RS256");
  privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
  const publicKey = await exportJWK(keys.publicKey);
  jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });
  writeFileSync(PK_PATH, `${privateKey}\n`);
  writeFileSync(JWKS_PATH, `${jwks}\n`);
  console.log("Generated new RS256 keypair in .tahcode/");
}

const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
const response = await fetch(`${BACKEND_URL}/api/update_environment_variables`, {
  method: "POST",
  headers: {
    Authorization: `Convex ${config.adminKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    changes: [
      { name: "JWT_PRIVATE_KEY", value: privateKey },
      { name: "JWKS", value: jwks },
    ],
  }),
});

if (!response.ok) {
  console.error(`Failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  console.error("Is the local backend running? Start it with: npx convex dev");
  process.exit(1);
}
console.log("Local Convex Auth keys installed. Sign-up should now work.");
