"use client";

import { createClient } from "next-sse/client";
import { CounterStream } from "./api/countdown/route";
import { useRef, useState } from "react";

const client = createClient<CounterStream>("/api/countdown");

export default function CountDownPage() {
  const [count, setCount] = useState(0);
  const { subscribe, isStreaming, error } = client.useStream();
  const abortControllerRef = useRef(new AbortController());

  const handleCountdown = () => {
    if (isStreaming) {
      abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
    } else {
      const signal = abortControllerRef.current.signal;

      subscribe({
        input: count > 0 ? count : undefined,
        signal,
        onData(data) {
          setCount(data);
        },
      });
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full h-screen justify-center items-center">
      <p className="font-bold text-2xl sm:text-6xl font-mono text-white mx-auto">
        <span>Countdown:</span>
        <span className="text-sky-400">{count}</span>
      </p>

      <div>
        <button
          onClick={handleCountdown}
          className={`px-10 sm:px-20 py-2 text-white rounded-md text-base sm:text-xl ${
            isStreaming
              ? "bg-red-500 hover:bg-red-600"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {isStreaming ? "Stop" : "Start"}
        </button>
      </div>

      {error && (
        <p className="text-red-500 italic">
          {error.message || "Something went wrong"}
        </p>
      )}
    </div>
  );
}
