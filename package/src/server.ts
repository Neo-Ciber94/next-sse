import { ZodType } from "zod";

type Subscriber<T, TInput> = {
  input: TInput;
  emit: (data: T) => void;
};

type Cleanup = () => void | (() => Promise<void>);

type SubscribeInit<T, TInput> = (
  subscriber: Subscriber<T, TInput>
) => Promise<void> | void | Cleanup;

export type StreamSource<T, TInput, R extends string> = {
  route: R;
  handler: (req: Request) => Promise<Response>;
  types?: {
    input: TInput;
    output: T;
  };
};

class StreamSourceBuilder<R extends string, TInput = undefined> {
  private readonly route: R;
  private _validator?: ZodType<TInput>;

  constructor(route: R) {
    this.route = route;
  }

  get validator() {
    return this._validator;
  }

  input<I>(validator: ZodType<I>): StreamSourceBuilder<R, I> {
    const builder = new StreamSourceBuilder<R, I>(this.route);
    builder._validator = validator;
    return builder;
  }

  onSubscribe<T>(init: SubscribeInit<T, TInput>): StreamSource<T, TInput, R> {
    const handler = (req: Request) => {
      return createStreamHandler(req, init);
    };

    const route = this.route;
    return {
      route,
      handler,
    };
  }
}

export function source<R extends string = string>(route: R) {
  return new StreamSourceBuilder(route);
}

async function createStreamHandler<T, TInput>(
  req: Request,
  init: SubscribeInit<T, TInput>
) {
  if (req.method === "GET" || req.method === "HEAD") {
    throw new Error(
      "handler expect a http method that can have a body like: POST, PUT, DELETE"
    );
  }

  const json: { input: TInput } = await req.json();
  const encoder = new TextEncoder();
  let done = false;

  req.signal.addEventListener("abort", () => {
    done = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: T) => {
        if (done) {
          return;
        }

        const json = JSON.stringify(data);
        controller.enqueue(encoder.encode(`data: ${json}\n\n`));
      };

      try {
        const input = json.input;
        const cleanup = await init({ input, emit });

        // Cleanup
        if (cleanup instanceof Function) {
          req.signal.addEventListener("abort", async () => {
            await Promise.resolve(cleanup());
          });
        }
      } catch (err) {
        console.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "Keep-Alive",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
