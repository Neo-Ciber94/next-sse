"use client";

import { createClient } from "next-sse/client";
import { CounterStream } from "./api/countdown/route";
import { useState } from "react";

const client = createClient<CounterStream>("/api/countdown");

export default function Home() {
  const [count, setCount] = useState(0);
  const { subscribe, isStreaming, error } = client.useStream();

  const handleCountdown = () => {
    subscribe({
      input: count > 0 ? count : undefined,
      onData(data) {
        setCount(data);
      },
    });
  };

  return (
    <div className="p-4 space-y-4">
      <p className="font-bold text-2xl font-mono">Countdown: {count}</p>

      <button
        onClick={handleCountdown}
        className={`px-8 py-2 text-white rounded-md ${
          isStreaming
            ? "bg-red-500 hover:bg-red-600"
            : "bg-blue-500 hover:bg-blue-600"
        }`}
      >
        {isStreaming ? "Stop" : "Start"}
      </button>

      {error && (
        <p className="text-red-500 italic">
          {error.message || "Something went wrong"}
        </p>
      )}
    </div>
  );
}
