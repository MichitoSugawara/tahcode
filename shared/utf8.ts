export type Utf8LineBuffer = {
  buffer: string;
  decoder: InstanceType<typeof TextDecoder>;
};

export function createUtf8LineBuffer(): Utf8LineBuffer {
  return { buffer: "", decoder: new TextDecoder("utf-8") };
}

/** Decode a chunk without splitting a multi-byte code point; emit complete lines. */
export function pushUtf8Lines(
  state: Utf8LineBuffer,
  chunk: Uint8Array
): string[] {
  state.buffer += state.decoder.decode(chunk, { stream: true });
  const lines = state.buffer.split("\n");
  state.buffer = lines.pop() ?? "";
  return lines;
}

export function flushUtf8Lines(state: Utf8LineBuffer): string[] {
  state.buffer += state.decoder.decode();
  const leftover = state.buffer;
  state.buffer = "";
  return leftover ? [leftover] : [];
}
