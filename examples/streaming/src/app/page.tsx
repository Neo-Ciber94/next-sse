"use client";

import { createClient } from "next-sse/client";
import { CounterStream } from "./api/counter";

const client = createClient<"/api/counter", CounterStream>("/api/counter");

export default function Home() {
  return <h1>Hello World</h1>;
}
