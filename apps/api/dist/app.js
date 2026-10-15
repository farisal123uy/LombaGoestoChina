import Fastify from "fastify";
import cors from "@fastify/cors";
import { developmentChain, scaffoldCapabilities } from "@guardian-wallet/shared";
export async function buildApp(webOrigin = "http://localhost:3000") {
    const app = Fastify({ logger: true });
    await app.register(cors, { origin: webOrigin });
    app.get("/health", async () => ({
        status: "ok",
        service: "guardian-wallet-api",
        stage: "scaffold",
    }));
    app.get("/v1/status", async () => ({
        stage: "scaffold",
        executionEnabled: false,
        chain: developmentChain,
        capabilities: scaffoldCapabilities,
    }));
    return app;
}
//# sourceMappingURL=app.js.map