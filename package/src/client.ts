"use client";
import { useCallback, useRef, useState } from "react";
import { type StreamSource } from "./server";
import { EventSourceParserStream } from "eventsource-parser/stream";

type StreamRoute<S> = S extends StreamSource<unknown, unknown, infer R>
  ? R
  : never;

export type UseStreamOptions<TError = unknown> = {
  onError?: (err: TError) => void;
};

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
   *
   * @throws If an error ocurred during the request.
   */
  async function* stream(...args: TArgs) {
    const { input, signal } = args[0] || {};
    const res = await fetch(route, {
      signal,
      method: "POST",
      body: JSON.stringify({ input }),
    });

    if (!res.ok) {
      if (res.status === 400) {
        const message = await getResponseError(res);
        if (message) {
          throw new Error(message);
        }
      }

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
  function useStream<TError = { message?: string }>(
    opts?: UseStreamOptions<TError>
  ) {
    type SubscribeOptions = TOptions & {
      onData: (data: TOutput) => void | Promise<void>;
    };

    const { onError } = opts || {};
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<TError>();
    const isOngoingRequestRef = useRef(false);

    const subscribe = useCallback(
      async ({ onData, ...opts }: SubscribeOptions) => {
        const { input, signal } = opts;

        if (isStreaming || isOngoingRequestRef.current) {
          return;
        }

        try {
          isOngoingRequestRef.current = true;
          setIsStreaming(true);
          setError(undefined);

          for await (const data of stream({ input, signal })) {
            await Promise.resolve(onData(data));
          }
        } catch (err) {
          setError(err as TError);

          if (onError) {
            onError(err as TError);
          } else {
            console.error(err);
          }
        } finally {
          setIsStreaming(false);
          isOngoingRequestRef.current = false;
        }
      },
      []
    );

    return { subscribe, isStreaming, error };
  }

  return {
    stream,
    useStream,
  };
}

async function getResponseError(res: Response) {
  if (res.headers.get("content-type") === "application/json") {
    const json: { message?: string } = await res.json();
    return json.message ?? null;
  }

  return null;
}
