# next-sse

Provides a mechanism for managing `server sent events` in NextJS.

## Installation

```bash
# npm
npm install next-sse zod
```

```bash
# yarn
yarn add next-sse zod
```

```bash
# pnpm
pnpm add next-sse zod
```

## Usage

Declare the stream on your server

```ts
// /app/api/counter/route.ts

import { createSource } from "next-sse/server";
import { z } from "zod";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const counter = createSource("/api/counter")
  .input(z.number())
  .onSubscribe(({ input, emit }) => {
    for (let i = 0; i < input; i++) {
      emit(i);
      await delay(1000);
    }
  });

export type CounterStream = typeof counter;
```

In your client consume your stream with `useStream()`.

```tsx
// app/page.tsx

import { createClient } from "next-sse/client";
import type { CounterStream } from "@/app/api/counter/route";

const client = createClient<CounterStream>("/api/counter");

export default function Page() {
  const [count, setCount] = useState(0);
  const { subscribe, isStreaming, error } = client.useStream();

  useEffect(() => {
    subscribe({
      input: 10,
      onData(data) {
        setCount(data);
      },
    });
  }, [subscribe]);

  return <div>{ count }<div>;
}
```

Or using `stream()`.

```ts
export default function Page() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const run = async () => {
      for await (const x of client.stream({ input: 10 })) {
        setCount(x);
      }
    };

    run();
  }, []);

  return <div>{ count }<div>;
}
```
