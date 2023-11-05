type Source<T, TInput> = {
  input: TInput;
  emit: (data: T) => void;
};

export type CreateSourceInit<T, TInput> = (
  source: Source<T, TInput>
) => Promise<void> | void;

export type StreamSource<T, TInput, R extends string> = {
  inputType?: TInput;
  outputType?: T;
  route: R;
  handler: (req: Request) => Promise<Response>;
};

export function createSource<T, TInput = void, R extends string = string>(
  route: R,
  init: CreateSourceInit<T, TInput>
): StreamSource<T, TInput, R> {
  const createStreamHandler = async (req: Request) => {
    if (req.method === "GET" || req.method === "HEAD") {
      throw new Error(
        "handler expect a http method that can have a body like: POST, PUT, DELETE"
      );
    }

    const input: TInput = await req.json();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: T) => {
          const json = JSON.stringify(data);
          controller.enqueue(encoder.encode(`data: ${json}\n\n`));
        };

        try {
          await init({ input, emit });
        } catch (err) {
          console.error(err);
        } finally {
          controller.close();
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
  };

  return {
    route,
    handler: createStreamHandler,
  };
}
