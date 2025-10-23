import "dotenv/config";
import { syncInventoryFromFeed } from "@/lib/feed-normalize";

(async () => {
  try {
    await syncInventoryFromFeed();
    console.log("Sync complete");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
