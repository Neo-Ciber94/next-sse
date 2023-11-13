import { source } from "next-sse/server";
import { z } from "zod";

const counter = source("/api/counter")
  .input(z.number())
  .onSubscribe<number>(({ input, emit }) => {
    let count = input;
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
