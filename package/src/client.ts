"use client";
import { useCallback, useState } from "react";
import { type StreamSource } from "./server";
import { EventSourceParserStream } from "eventsource-parser/stream";

type StreamRoute<S> = S extends StreamSource<unknown, unknown, infer R>
  ? R
  : never;

export function createClient<S extends StreamSource<unknown, unknown, string>>(
  route: StreamRoute<S>
) {
  type Types = NonNullable<S["types"]>;
  type TInput = Types["input"];
  type TOutput = Types["output"];
  type TArgs = TInput extends undefined ? [input?: TInput] : [input: TInput];

  async function* toStream(...args: TArgs) {
    const input = args[0];
    const res = await fetch(route, {
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

  function useStream({ onData }: { onData: (data: TOutput) => void }) {
    const [isStreaming, setIsStreaming] = useState(false);

    const subscribe = useCallback((...args: TArgs) => {
      let isCancel = false;
      setIsStreaming(true);

      const startStreaming = async () => {
        try {
          for await (const data of toStream(...args)) {
            if (isCancel) {
              break;
            }

            onData(data);
          }
        } finally {
          setIsStreaming(false);
        }
      };

      startStreaming().catch(console.error);

      return () => {
        isCancel = true;
      };
    }, []);

    return { subscribe, isStreaming };
  }

  return {
    toStream,
    useStream,
  };
}

// function test<T>() {
//   type TInput = T;
//   type TArgs = TInput extends undefined ? [input?: TInput | undefined] : [input: TInput];

//   return (...args: TArgs) => {};
// }

// const func = test<number | undefined>();
// func();
