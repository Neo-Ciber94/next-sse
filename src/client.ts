"use client";
import { useCallback, useState } from "react";
import { type StreamSource } from "./server";
import { EventSourceParserStream } from "eventsource-parser/stream";

export function createClient<
  R extends string,
  S extends StreamSource<unknown, unknown, R>
>(route: R) {
  type TInput = S extends StreamSource<infer I, unknown, string> ? I : never;
  type TOutput = S extends StreamSource<unknown, infer O, string> ? O : never;

  async function* toStream(input: TInput) {
    const res = await fetch(route, {
      method: "POST",
      body: JSON.stringify(input),
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

  function useStream() {
    const [isStreaming, setIsStreaming] = useState(false);

    const execute = useCallback(
      async (input: TInput, onData: (data: TOutput) => void) => {
        setIsStreaming(true);

        try {
          for await (const data of toStream(input)) {
            onData(data);
          }
        } finally {
          setIsStreaming(false);
        }
      },
      []
    );

    return { execute, isStreaming };
  }

  return {
    toStream,
    useStream,
  };
}
