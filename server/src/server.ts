import { app } from "./app";
import { getEnv } from "./lib/env";

const { port } = getEnv();

app.listen(port, () => {
  console.log(`ShopMate server listening on port ${port}`);
});
