import {
  AGENT_TOOLS,
  isAgentToolName,
  parseAgentToolArgsJson,
} from "../../shared/agentTools.ts";

export type AgentToolInvokeFn = (
  name: string,
  args: Record<string, unknown>
) => Promise<unknown>;

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  id?: JsonRpcId;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  error?: { code: number; message: string };
  id: JsonRpcId;
  jsonrpc: "2.0";
  result?: unknown;
};

export async function handleMcpRequest(
  message: JsonRpcRequest,
  invoke: AgentToolInvokeFn
): Promise<JsonRpcResponse | null> {
  const method = message.method ?? "";
  const id = message.id ?? null;
  if (method.startsWith("notifications/")) {
    return null;
  }
  try {
    if (method === "initialize") {
      return {
        id,
        jsonrpc: "2.0",
        result: {
          capabilities: { tools: {} },
          protocolVersion: "2024-11-05",
          serverInfo: { name: "tahcode", version: "0.1.0" },
        },
      };
    }
    if (method === "ping") {
      return { id, jsonrpc: "2.0", result: {} };
    }
    if (method === "tools/list") {
      return {
        id,
        jsonrpc: "2.0",
        result: {
          tools: AGENT_TOOLS.map((tool) => ({
            description: tool.description,
            inputSchema: tool.inputSchema,
            name: tool.name,
          })),
        },
      };
    }
    if (method === "tools/call") {
      const params = asRecord(message.params);
      const name = typeof params.name === "string" ? params.name : "";
      if (!isAgentToolName(name)) {
        throw new Error("Unknown tool");
      }
      const rawArgs = params.arguments;
      const args =
        typeof rawArgs === "string"
          ? parseAgentToolArgsJson(rawArgs)
          : asRecord(rawArgs);
      const result = await invoke(name, args);
      return {
        id,
        jsonrpc: "2.0",
        result: {
          content: [
            {
              text: JSON.stringify(result ?? {}, null, 2),
              type: "text",
            },
          ],
        },
      };
    }
    return {
      error: { code: -32601, message: `Unknown method: ${method}` },
      id,
      jsonrpc: "2.0",
    };
  } catch (error) {
    return {
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
      id,
      jsonrpc: "2.0",
    };
  }
}

export function encodeMcpFrame(payload: unknown): string {
  const body = `${JSON.stringify(payload)}\n`;
  return `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
}

export function parseMcpBuffer(buffer: string): {
  rest: string;
  messages: JsonRpcRequest[];
} {
  const messages: JsonRpcRequest[] = [];
  let rest = buffer;
  for (;;) {
    const framed = takeContentLengthFrame(rest);
    if (framed) {
      messages.push(framed.message);
      rest = framed.rest;
      continue;
    }
    const newline = takeNewlineJson(rest);
    if (newline) {
      messages.push(newline.message);
      rest = newline.rest;
      continue;
    }
    break;
  }
  return { messages, rest };
}

function takeContentLengthFrame(buffer: string): {
  message: JsonRpcRequest;
  rest: string;
} | null {
  const header =
    /^(?:Content-Length:\s*(\d+)\r?\n)(?:[A-Za-z-]+:[^\n]*\n)*\r?\n/i.exec(
      buffer
    );
  if (!header) {
    return null;
  }
  const length = Number(header[1]);
  const start = header[0].length;
  if (!Number.isFinite(length) || buffer.length < start + length) {
    return null;
  }
  const raw = buffer.slice(start, start + length);
  return {
    message: asRequest(JSON.parse(raw) as unknown),
    rest: buffer.slice(start + length),
  };
}

function takeNewlineJson(buffer: string): {
  message: JsonRpcRequest;
  rest: string;
} | null {
  const trimmed = buffer.replace(/^\s+/, "");
  if (!trimmed.startsWith("{")) {
    return null;
  }
  const lineEnd = trimmed.indexOf("\n");
  if (lineEnd === -1) {
    return null;
  }
  const line = trimmed.slice(0, lineEnd).trim();
  if (!line) {
    return { message: {}, rest: trimmed.slice(lineEnd + 1) };
  }
  return {
    message: asRequest(JSON.parse(line) as unknown),
    rest: trimmed.slice(lineEnd + 1),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function asRequest(value: unknown): JsonRpcRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as JsonRpcRequest;
}
