"use client";
import { useCallback } from "react";
import { type StreamSource } from "./server";
import { EventSourceParserStream } from "eventsource-parser/stream";

type StreamRoute<S> = S extends StreamSource<unknown, unknown, infer R>
  ? R
  : never;

/**
 * Creates a client to consume the stream.
 * @param route The route.
 */
export function createClient<S extends StreamSource<unknown, unknown, string>>(
  route: StreamRoute<S>
) {
  type Types = NonNullable<S["_types"]>;
  type TInput = Types["input"];
  type TOutput = Types["output"];
  type TOptions = undefined extends TInput
    ? { input?: TInput; signal?: AbortSignal }
    : { input: TInput; signal?: AbortSignal };

  type TArgs = undefined extends TInput ? [opts?: TOptions] : [opts: TOptions];

  /**
   * Subscribe to the server and consume the stream.
   */
  async function* stream(...args: TArgs) {
    const { input, signal } = args[0] || {};
    const res = await fetch(route, {
      signal,
      method: "POST",
      body: JSON.stringify({ input }),
      headers: {
        Accept: "text/event-stream",
      },
    });

    if (!res.ok) {
      throw new Error("Failed to get event-stream from server");
    }

    if (res.body == null) {
      throw new Error("No response from server");
    }

    const stream = res.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream());

    const reader = stream.getReader();

    while (true) {
      const { value, done } = await reader.read();

      if (value && value.type === "event") {
        const json = JSON.parse(value.data) as TOutput;
        yield json;
      }

      if (done) {
        break;
      }
    }
  }

  /**
   * Creates a hook to subscribe and consume the stream.
   */
  function useStream() {
    type SubscribeOptions = TOptions & {
      onData: (data: TOutput) => void | Promise<void>;
    };

    const subscribe = useCallback(
      async ({ onData, ...opts }: SubscribeOptions) => {
        const { input, signal } = opts;
        for await (const data of stream({ input, signal })) {
          await Promise.resolve(onData(data));
        }
      },
      []
    );

    return { subscribe };
  }

  return {
    stream,
    useStream,
  };
}
