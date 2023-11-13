"use client";

import { createClient } from "next-sse/client";
import { CounterStream } from "./api/counter/route";
import { useEffect, useState } from "react";

const client = createClient<CounterStream>("/api/counter");

export default function Home() {
  const [count, setCount] = useState(0);
  const { subscribe } = client.useStream({
    onData(n) {
      setCount(n);
    },
  });

  useEffect(() => {
    const abort = subscribe(12);
    return () => {
      abort();
    };
  }, [subscribe]);

  return <h1 className="font-bold">Count: {count}</h1>;
}
