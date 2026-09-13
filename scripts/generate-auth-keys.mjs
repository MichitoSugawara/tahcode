// Prints a fresh Convex Auth RS256 keypair as dotenv lines ready to paste into
// .env.<preview|staging|production> (then `npm run env:enc -- <name>`).
//
// The private key is emitted on one line with spaces instead of newlines
// (Convex Auth / jose accept this), and the JWKS is emitted in single quotes so
// dotenv keeps the JSON quotes intact. Never wrap the JWKS in double quotes with
// escaped \" — dotenv preserves the backslashes and the deployment serves an
// invalid JWKS (see scripts/sync-convex-auth-env.mjs).
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey))
  .trimEnd()
  .replaceAll("\n", " ");
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

process.stdout.write(`JWT_PRIVATE_KEY="${privateKey}"\nJWKS='${jwks}'\n`);
