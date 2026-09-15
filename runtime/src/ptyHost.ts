import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

import {
  homeAliasPath,
  isSafeBrowsePath,
} from "../../shared/filesystemBrowse.ts";
import {
  clampTerminalCols,
  clampTerminalRows,
} from "../../shared/workbenchTerminal.ts";

export type PtyHostEvent =
  | { kind: "started"; pid: number }
  | { kind: "output"; data: string }
  | { kind: "exit"; code: number | null }
  | { kind: "error"; message: string };

export function encodePtyCommand(
  command:
    | { kind: "write"; data: string }
    | { kind: "resize"; cols: number; rows: number }
    | { kind: "close" }
): string {
  if (command.kind === "write") {
    return `W ${Buffer.from(command.data, "utf-8").toString("base64")}\n`;
  }
  if (command.kind === "resize") {
    return `R ${clampTerminalCols(command.cols)} ${clampTerminalRows(command.rows)}\n`;
  }
  return "C\n";
}

export function parsePtyHostLine(line: string): PtyHostEvent | null {
  const trimmed = line.replace(/\r$/, "");
  if (trimmed.length === 0) {
    return null;
  }
  const kind = trimmed[0];
  const rest = trimmed.slice(2);
  if (kind === "S") {
    const pid = Number(rest);
    return Number.isFinite(pid) ? { kind: "started", pid } : null;
  }
  if (kind === "O") {
    try {
      return {
        data: Buffer.from(rest, "base64").toString("utf-8"),
        kind: "output",
      };
    } catch {
      return null;
    }
  }
  if (kind === "X") {
    const code = rest.length === 0 ? null : Number(rest);
    return {
      code: code !== null && Number.isFinite(code) ? code : null,
      kind: "exit",
    };
  }
  if (kind === "E") {
    return { kind: "error", message: rest.slice(0, 2000) };
  }
  return null;
}

const HELPER = `
import base64, fcntl, os, pty, select, struct, sys, termios

def winsize(cols, rows):
    return struct.pack("HHHH", rows, cols, 0, 0)

def send(kind, payload=""):
    sys.stdout.write(kind + " " + payload + "\\n")
    sys.stdout.flush()

def main():
    cwd = sys.argv[1]
    cols = int(sys.argv[2])
    rows = int(sys.argv[3])
    shell = os.environ.get("SHELL") or "/bin/zsh"
    try:
        os.chdir(cwd)
    except OSError as error:
        send("E", str(error))
        return
    pid, fd = pty.fork()
    if pid == 0:
        os.execvpe(shell, [os.path.basename(shell), "-i"], os.environ)
        os._exit(127)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize(cols, rows))
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    send("S", str(pid))
    buf = b""
    while True:
        try:
            ready, _, _ = select.select([fd, sys.stdin], [], [], 0.05)
        except InterruptedError:
            continue
        if sys.stdin in ready:
            line = sys.stdin.readline()
            if line == "":
                os.close(fd)
                return
            if line.startswith("W "):
                os.write(fd, base64.b64decode(line[2:].strip()))
            elif line.startswith("R "):
                parts = line.split()
                if len(parts) >= 3:
                    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize(int(parts[1]), int(parts[2])))
            elif line.startswith("C"):
                try:
                    os.kill(pid, 15)
                except ProcessLookupError:
                    pass
                os.close(fd)
                return
        if fd in ready:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                chunk = b""
            if not chunk:
                _pid, status = os.waitpid(pid, 0)
                send("X", str(os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1))
                return
            send("O", base64.b64encode(chunk).decode("ascii"))

if __name__ == "__main__":
    main()
`;

export function resolvePtyCwd(
  requestPath: string,
  fallback = homedir()
): string {
  const raw = homeAliasPath(requestPath || "~", fallback);
  if (!isSafeBrowsePath(raw)) {
    throw new Error("Terminal cwd is invalid");
  }
  return raw;
}

export class PtyProcess {
  private child;
  private leftover = "";
  private closed = false;
  readonly cwd: string;
  private readonly onEvent: (event: PtyHostEvent) => void;

  constructor(
    cwd: string,
    cols: number,
    rows: number,
    onEvent: (event: PtyHostEvent) => void
  ) {
    this.cwd = cwd;
    this.onEvent = onEvent;
    const python = existsSync("/usr/bin/python3")
      ? "/usr/bin/python3"
      : "python3";
    this.child = spawn(
      python,
      ["-u", "-c", HELPER, cwd, String(cols), String(rows)],
      {
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    this.child.stdout?.on("data", (chunk: Buffer | string) => {
      this.leftover +=
        typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const lines = this.leftover.split("\n");
      this.leftover = lines.pop() ?? "";
      for (const line of lines) {
        const event = parsePtyHostLine(line);
        if (event) {
          this.onEvent(event);
        }
      }
    });
    this.child.stderr?.on("data", (chunk: Buffer | string) => {
      const message =
        typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      this.onEvent({ kind: "error", message: message.slice(0, 2000) });
    });
    this.child.on("exit", (code) => {
      if (!this.closed) {
        this.onEvent({ code, kind: "exit" });
      }
    });
    this.child.on("error", (error) => {
      this.onEvent({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  write(data: string): void {
    if (data.length === 0 || this.closed) {
      return;
    }
    this.child.stdin?.write(encodePtyCommand({ data, kind: "write" }));
  }

  resize(cols: number, rows: number): void {
    if (this.closed) {
      return;
    }
    this.child.stdin?.write(encodePtyCommand({ cols, kind: "resize", rows }));
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.child.stdin?.write(encodePtyCommand({ kind: "close" }));
    this.child.stdin?.end();
    setTimeout(() => {
      if (!this.child.killed) {
        this.child.kill("SIGTERM");
      }
    }, 1500);
  }
}
