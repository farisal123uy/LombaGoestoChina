# Third-party components and services

Guardian Wallet's original source remains the team's work under the project license
declaration. Third-party dependencies retain their own licenses and notices. Pinning
versions or using a hosted service does not transfer those components' rights to the team.

Source review packages include `package-lock.json`, direct-dependency
`THIRD-PARTY-INVENTORY.json` and `THIRD-PARTY-LOCKFILE-INVENTORY.json` for the complete
locked dependency metadata, including optional/other-platform packages. Installed
top-level LICENSE/NOTICE/COPYRIGHT files are copied into `THIRD-PARTY-LICENSES/` with
their hashes in the inventory. Dependency binaries/source are not bundled. Other-platform
optional packages rely on lockfile license metadata and their upstream notices when
installed. This inventory is not a legal assessment or a model-weight distribution.

Key components and upstream sources:

- Next.js / React: https://github.com/vercel/next.js and https://github.com/facebook/react
- Fastify / CORS / Zod: https://github.com/fastify/fastify,
  https://github.com/fastify/fastify-cors, https://github.com/colinhacks/zod
- viem: https://github.com/wevm/viem
- ZeroDev SDK / permissions / ECDSA validator: https://github.com/zerodevapp/sdk
- OpenZeppelin Contracts: https://github.com/OpenZeppelin/openzeppelin-contracts
- Drizzle ORM / postgres.js: https://github.com/drizzle-team/drizzle-orm,
  https://github.com/porsager/postgres
- PGlite / PostgreSQL: https://github.com/electric-sql/pglite and https://www.postgresql.org/about/licence/
- Hardhat / Solidity: https://github.com/NomicFoundation/hardhat and https://github.com/ethereum/solidity
- TypeScript / tsx / Vitest / Playwright: https://github.com/microsoft/TypeScript,
  https://github.com/privatenumber/tsx, https://github.com/vitest-dev/vitest,
  https://github.com/microsoft/playwright

## Hosted models and networks

Groq is an external API service subject to its own terms and Free-account limits.
The project does not distribute Groq infrastructure or model weights. Candidate model
identifiers and evidence include the exact selected model, provider and configuration.

- GPT-OSS model card: https://openai.com/index/gpt-oss-model-card/
- Qwen model reference: https://huggingface.co/Qwen/Qwen3.8-27B
- Groq legal/service references: https://console.groq.com/docs/legal
- Base Sepolia and explorer: https://docs.base.org and https://sepolia.basescan.org

The development MockUSD token and isolated fork assets are test fixtures. The public
transaction evidence does not establish mainnet pricing, a commercial database purchase,
or a financial recommendation. Remote service/model/network availability is not owned
or guaranteed by the team.
