# Hunter Killer Desk Read for n8n

Paste `desk_read.workflow.json` into n8n (Ctrl+V on the canvas, or Import from File). It calls the Desk Read with an HTTP Request node and branches on `verdict == skip`.

Free delayed data works without a key: delete the Authorization header node setting. (An empty Bearer would be sent if `HK_API_KEY` is unset.) For live data set `HK_API_KEY` as an n8n environment variable. Change symbol, side, entry and leverage in the query parameters; map them from earlier nodes with expressions.

`package.json` is the community-package manifest stub; a native node is not published yet. Validate the template with `node smoke_test.mjs`, which parses it and makes the same call once.
