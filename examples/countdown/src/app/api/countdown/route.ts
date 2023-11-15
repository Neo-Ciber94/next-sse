import { createSource } from "next-sse/server";
import { z } from "zod";

export const runtime = "edge";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const counter = createSource("/api/countdown")
  .input(z.number().min(1).default(10))
  .onSubscribe<number>(async ({ input, emit }) => {
    let cur = input ?? 0;

    while (cur >= 0) {
      await delay(1000);
      emit(cur--);
    }
  });

export type CounterStream = typeof counter;

export const POST = counter.handler;
