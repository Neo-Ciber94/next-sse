import { createSource } from "next-sse/server";

let count = 0;
const counter = createSource<number>("/api/counter", async ({ emit }) => {
  setInterval(() => {
    emit(count++);
  }, 1000);
});

export type CounterStream = typeof counter;

export const POST = counter.handler;
