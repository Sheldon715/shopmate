import { app } from "./app";
import { getEnv } from "./lib/env";

const { host, port } = getEnv();

const onListening = (): void => {
  console.log(
    host
      ? `ShopMate server listening on ${host}:${port}`
      : `ShopMate server listening on port ${port}`,
  );
};

if (host) {
  app.listen(port, host, onListening);
} else {
  app.listen(port, onListening);
}
