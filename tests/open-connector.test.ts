import { describe, expect, it } from "vitest";

import { pendingConnectorAccountId } from "../shared/connectors.ts";
import {
  DEFAULT_OPENCONNECTOR_BASE_URL,
  LINEAR_GET_CURRENT_USER_ACTION,
  buildLinearReturnUri,
  confirmLinearConnectionRequest,
  getLinearConnectionRequest,
  healthCheckLinearConnection,
  isOpenConnectorConfigured,
  linearConnectReturnScope,
  linearDisplayLabel,
  parseRuntimeEnvelope,
  readOpenConnectorEnv,
  startLinearConnectionRequest,
  stripLinearConnectReturnSearch,
} from "../shared/openConnector.ts";

describe(readOpenConnectorEnv, () => {
  it("reads admin and runtime tokens from OPENCONNECTOR_ or OOMOL_ names", () => {
    expect(
      readOpenConnectorEnv({
        OOMOL_CONNECT_ADMIN_TOKEN: " admin-secret ",
        OOMOL_CONNECT_RUNTIME_TOKEN: "oct_runtime",
        SITE_URL: "https://pr-42.example/",
      })
    ).toMatchObject({
      adminToken: "admin-secret",
      baseUrl: DEFAULT_OPENCONNECTOR_BASE_URL,
      runtimeToken: "oct_runtime",
      siteUrl: "https://pr-42.example/",
    });
  });

  it("requires both admin token and SITE_URL before OAuth can start", () => {
    expect(
      isOpenConnectorConfigured(
        readOpenConnectorEnv({ SITE_URL: "https://tahcode.com" })
      )
    ).toBeFalsy();
    expect(
      isOpenConnectorConfigured(
        readOpenConnectorEnv({
          OPENCONNECTOR_ADMIN_TOKEN: "admin",
          SITE_URL: "https://tahcode.com",
        })
      )
    ).toBeTruthy();
  });
});

describe(buildLinearReturnUri, () => {
  it("lands on the dedicated connectors surface with connector + scope", () => {
    expect(
      buildLinearReturnUri({
        orgSlug: "preview",
        scope: "org",
        siteUrl: "https://pr-42-tahcode-preview.gawara.workers.dev",
      })
    ).toBe(
      "https://pr-42-tahcode-preview.gawara.workers.dev/o/preview/connectors?connector=linear&scope=org"
    );
  });
});

describe("Linear return query", () => {
  it("reads scope from our query and defaults missing scope to org", () => {
    expect(
      linearConnectReturnScope("?connector=linear&scope=user&status=success")
    ).toBe("user");
    expect(linearConnectReturnScope("?connector=linear&status=success")).toBe(
      "org"
    );
    expect(linearConnectReturnScope("?status=success")).toBeNull();
  });

  it("strips return params including a browser connectedAccountId", () => {
    expect(
      stripLinearConnectReturnSearch(
        "?connector=linear&scope=org&status=success&service=linear&connectedAccountId=spoofed"
      )
    ).toBe("");
    expect(
      stripLinearConnectReturnSearch("?tab=team&connector=linear&status=error")
    ).toBe("?tab=team");
  });
});

describe(confirmLinearConnectionRequest, () => {
  it("confirms only from the server request appId, never a browser account id", () => {
    expect(confirmLinearConnectionRequest).toHaveLength(1);
    expect(
      confirmLinearConnectionRequest({
        appId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
        connectionRequestId: "req-1",
        errorCode: null,
        errorMessage: null,
        service: "linear",
        status: "connected",
      })
    ).toStrictEqual({
      connectedAccountId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
      kind: "connected",
    });
    expect(
      confirmLinearConnectionRequest({
        appId: null,
        connectionRequestId: "req-1",
        errorCode: null,
        errorMessage: null,
        service: "linear",
        status: "initiated",
      })
    ).toStrictEqual({ kind: "pending" });
    expect(
      confirmLinearConnectionRequest({
        appId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
        connectionRequestId: "req-1",
        errorCode: "provider_error",
        errorMessage: "OAuth connection failed.",
        service: "linear",
        status: "failed",
      })
    ).toMatchObject({ kind: "failed" });
    expect(() =>
      confirmLinearConnectionRequest({
        appId: "lin_oauth_abcdefghijklmnopqrstuvwxyz",
        connectionRequestId: "req-1",
        errorCode: null,
        errorMessage: null,
        service: "linear",
        status: "connected",
      })
    ).toThrow(/opaque/i);
  });
});

describe(linearDisplayLabel, () => {
  it("prefers the Linear viewer, then the connection account label", () => {
    expect(
      linearDisplayLabel(
        { displayName: "michitogawara", name: "Michito" },
        {
          accountLabel: "fallback",
          alias: "default",
          id: "a",
          service: "linear",
          status: "active",
        }
      )
    ).toBe("michitogawara");
    expect(
      linearDisplayLabel(undefined, {
        accountLabel: "default · michitogawara",
        alias: "default",
        id: "a",
        service: "linear",
        status: "active",
      })
    ).toBe("default · michitogawara");
  });
});

describe(parseRuntimeEnvelope, () => {
  it("unwraps success data and throws the runtime message on failure", () => {
    expect(
      parseRuntimeEnvelope({
        data: { ok: true },
        message: "OK",
        success: true,
      })
    ).toStrictEqual({ ok: true });
    expect(() =>
      parseRuntimeEnvelope({
        data: null,
        errorCode: "unauthorized",
        message: "A valid administrator bearer token is required.",
        success: false,
      })
    ).toThrow(/administrator/i);
  });
});

describe("OpenConnector HTTP helpers", () => {
  it("starts Linear OAuth with returnUri and never sends a browser account id", async () => {
    const calls: { body?: string; url: string }[] = [];
    const started = await startLinearConnectionRequest({
      config: {
        adminToken: "admin",
        baseUrl: "https://oc.example",
        siteUrl: "https://app.example",
      },
      fetchImpl: async (url, init) => {
        calls.push({ body: init?.body, url });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                authorizationUrl: "https://linear.app/oauth/authorize?x=1",
                connectionRequestId: "req-42",
                expiresAt: "2026-09-14T07:10:00.000Z",
                stateHandle: "state-1",
                status: "initiated",
              },
              message: "OK",
              success: true,
            }),
        };
      },
      orgSlug: "preview",
      scope: "org",
    });
    expect({
      body: calls[0]?.body,
      started,
      url: calls[0]?.url,
    }).toMatchObject({
      started: {
        authorizationUrl: "https://linear.app/oauth/authorize?x=1",
        connectionRequestId: "req-42",
        status: "initiated",
      },
      url: "https://oc.example/v1/connections/linear/connect",
    });
    expect(calls[0]?.body).toContain(
      "https://app.example/o/preview/connectors?connector=linear&scope=org"
    );
    expect(calls[0]?.body).not.toMatch(
      new RegExp(`connectedAccountId|${pendingConnectorAccountId("linear")}`)
    );
  });

  it("confirms the saved connection-request id, not a query account id", async () => {
    const request = await getLinearConnectionRequest({
      config: { adminToken: "admin", baseUrl: "https://oc.example" },
      fetchImpl: async (url) => {
        expect(url).toBe("https://oc.example/v1/connection-requests/req-42");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                appId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
                connectionRequestId: "req-42",
                errorCode: null,
                errorMessage: null,
                service: "linear",
                status: "connected",
              },
              message: "OK",
              success: true,
            }),
        };
      },
      requestId: "req-42",
    });
    expect(confirmLinearConnectionRequest(request)).toMatchObject({
      connectedAccountId: "bfd5bc8a-0044-4f8e-9134-c1db5c9cf7f8",
      kind: "connected",
    });
  });

  it("falls back to list teams when get_current_user fails", async () => {
    const actions: string[] = [];
    const health = await healthCheckLinearConnection({
      config: { adminToken: "admin", baseUrl: "https://oc.example" },
      connectionAlias: "work",
      fetchImpl: async (url) => {
        const actionId = url.split("/").pop() ?? "";
        actions.push(actionId);
        if (actionId === LINEAR_GET_CURRENT_USER_ACTION) {
          return {
            ok: false,
            status: 500,
            text: async () =>
              JSON.stringify({
                data: null,
                message: "provider_error",
                success: false,
              }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: { teams: [{ id: "team-1" }] },
              message: "OK",
              success: true,
            }),
        };
      },
    });
    expect(health.viewer).toBeUndefined();
    expect(actions).toStrictEqual([
      LINEAR_GET_CURRENT_USER_ACTION,
      "linear.list_linear_teams",
    ]);
  });
});
