import { createSource } from "next-sse/server";
import { z } from "zod";

export const runtime = "edge";

const counter = createSource("/api/counter")
  .input(z.number().optional())
  .onSubscribe<number>(({ input, emit }) => {
    let count = input || 0;
    const interval = setInterval(() => {
      emit(count++);
    }, 1000);

    return () => {
      console.log("cleanup");
      clearInterval(interval);
    };
  });

export type CounterStream = typeof counter;

export const POST = counter.handler;
