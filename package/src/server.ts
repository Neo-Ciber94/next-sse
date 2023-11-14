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
   * Closes this connection.
   */
  close: () => void;
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
  private _closeOnExit = true;

  constructor(route: R) {
    this.route = route;
  }

  /**
   * Returns the validator used.
   */
  get validator() {
    return this._validator;
  }

  closeOnExit(close: boolean) {
    this._closeOnExit = close;
    return this;
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
    const closeOnExit = this._closeOnExit;

    const handler = (req: Request) => {
      return createStreamHandler({ req, init, validator, closeOnExit });
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
  closeOnExit: boolean;
};

async function createStreamHandler<T, TInput>({
  validator,
  closeOnExit,
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

      const close = () => {
        if (done) {
          return;
        }

        controller.close();
      };

      let cleanUpFunction: (() => void) | void = undefined;

      try {
        const input = result.data;
        cleanUpFunction = await init({ input, emit, close });

        // Cleanup
        if (cleanUpFunction) {
          req.signal.addEventListener("abort", async () => {
            if (cleanUpFunction instanceof Function) {
              await Promise.resolve(cleanUpFunction());
            }
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (cleanUpFunction instanceof Function) {
          await Promise.resolve(cleanUpFunction());
        }

        if (closeOnExit) {
          controller.close();
        }
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
