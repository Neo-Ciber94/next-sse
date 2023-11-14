import { createSource } from "next-sse/server";
import { z } from "zod";

export const runtime = "edge";

const counter = createSource("/api/countdown")
  .input(z.number().min(1).default(10))
  .onSubscribe<number>(({ input, emit, close }) => {
    let current = input || 0; // default is 10
    const interval = setInterval(() => {
      if (current < 0) {
        clearInterval(interval);
        close();
      }

      emit(current--);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  });

export type CounterStream = typeof counter;

export const POST = counter.handler;
