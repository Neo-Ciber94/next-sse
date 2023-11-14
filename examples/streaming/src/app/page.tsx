"use client";

import { createClient } from "next-sse/client";
import { CounterStream } from "./api/counter/route";
import { useEffect, useState } from "react";

const client = createClient<CounterStream>("/api/counter");

export default function Home() {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const { subscribe } = client.useStream();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    subscribe({
      onData(data) {
        setCount(data);
      },
    }).finally(() => {
      setIsLoading(false);
    });
  }, [isLoading, subscribe]);

  return (
    <div>
      <h1 className="font-bold">Count: {count}</h1>
      <p>Is streaming? {isLoading.toString()}</p>
    </div>
  );
}
