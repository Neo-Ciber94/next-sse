import { ZodType, z } from "zod";

/**
 * Represents a subscriber.
 */
export type Subscriber<T, TInput> = {
  /**
   * The input.
   */
  input: TInput;

  /**
   * Sends data to the client.
   * @param data The data to sends to the subscriber.
   */
  emit: (data: T) => void;

  /**
   * Whether if the stream is done.
   */
  readonly isClosed: boolean;
};

type Cleanup = () => void | (() => Promise<void>);

export type SubscribeInit<T, TInput> = (
  subscriber: Subscriber<T, TInput>
) => Promise<void> | void | Cleanup | Promise<Cleanup>;

export type StreamSource<T, TInput, R extends string> = {
  /**
   * The route of the API handler.
   */
  route: R;

  /**
   * The API handler, must be a handler that allows a body like POST, PUT, DELETE.
   */
  handler: (req: Request) => Promise<Response>;

  /**
   * @internal
   */
  _types?: {
    input: TInput;
    output: T;
  };
};

class StreamSourceBuilder<R extends string, TInput = void> {
  private readonly route: R;
  private _validator = z.void() as unknown as ZodType<TInput>;

  constructor(route: R) {
    this.route = route;
  }

  /**
   * Returns the validator used.
   */
  get validator() {
    return this._validator;
  }

  /**
   * Sets an input validator.
   * @param validator The validator for the input.
   */
  input<I>(validator: ZodType<I>): StreamSourceBuilder<R, I> {
    const builder = new StreamSourceBuilder<R, I>(this.route);
    builder._validator = validator;
    return builder;
  }

  /**
   * Adds a handler to stream the content.
   * @param init The subscriber to send the data.
   */
  onSubscribe<T = never>(
    init: SubscribeInit<T, TInput>
  ): StreamSource<T, TInput, R> {
    const route = this.route;
    const validator = this._validator;

    const handler = (req: Request) => {
      return createStreamHandler({ req, init, validator });
    };

    return {
      route,
      handler,
    };
  }
}

/**
 * Creates a stream source.
 * @param route The route of the api handler.
 */
export function createSource<R extends string = string>(route: R) {
  return new StreamSourceBuilder(route);
}

type CreateStreamHandler<T, TInput> = {
  req: Request;
  init: SubscribeInit<T, TInput>;
  validator: ZodType<TInput>;
};

async function createStreamHandler<T, TInput>({
  validator,
  req,
  init,
}: CreateStreamHandler<T, TInput>) {
  if (req.method === "GET" || req.method === "HEAD") {
    throw new Error(
      "handler expect a http method that can have a body like: POST, PUT, DELETE"
    );
  }

  const json: { input: TInput } = await req.json();
  const result = validator.safeParse(json.input);

  if (!result.success) {
    const message = result.error.issues.map((x) => x.message).join("\n");
    const error = JSON.stringify({ message });
    return new Response(error, {
      status: 400,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  const encoder = new TextEncoder();
  let done = false;
  let hadCleanup = false;

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

      let cleanup: Cleanup | void = undefined;
      const startCleanup = async () => {
        if (cleanup instanceof Function) {
          if (!hadCleanup) {
            hadCleanup = true;
            await Promise.resolve(cleanup());
          }
        }
      };

      try {
        const input = result.data;
        cleanup = await init({
          input,
          emit,
          get isClosed() {
            return done;
          },
        });

        // Cleanup
        if (cleanup) {
          req.signal.addEventListener("abort", async () => {
            await startCleanup();
          });
        }
      } finally {
        // Cleanup
        await startCleanup();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "Keep-Alive",
    },
  });
}

function noop() {}
