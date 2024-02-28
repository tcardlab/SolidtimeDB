import { $ } from "bun";

await Promise.all([
  $`sleep 1; echo 1`,
  $`sleep 2; echo 2`,
  $`sleep 1000000; echo 3`,
])