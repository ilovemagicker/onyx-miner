/**
 * Onyx Labs — Stratum WebSocket ↔ TCP proxy
 * Browser connects via WSS; we open TCP to an allowlisted pool.
 * Protocol: first client text message is JSON:
 *   { "type":"connect", "host":"public-pool.io", "port":3333 }
 * Then raw Stratum lines (JSON + newline) both ways.
 * Control messages from proxy: { "type":"status"|"error", ... }
 */
import { connect } from "cloudflare:sockets";

const ALLOW = new Map([
  // BTC solo / pool
  ["stratum.ckpool.org", new Set([3333, 4334])],
  ["solo.ckpool.org", new Set([3333])],
  ["uwsolo.ckpool.org", new Set([3333])],
  ["uesolo.ckpool.org", new Set([3333])],
  ["eusolo.ckpool.org", new Set([3333])],
  ["sgsolo.ckpool.org", new Set([3333])],
  ["ausolo.ckpool.org", new Set([3333])],
  ["public-pool.io", new Set([3333, 4333, 13333, 14333, 21496])],
  ["solo.atlaspool.io", new Set([3333, 4333])],
  // BCH (ViaBTC)
  ["bch.viabtc.io", new Set([3333, 443])],
  ["bch.viabtc.com", new Set([3333, 443])],
  // LTC / DOGE scrypt
  ["eu.litesolo.org", new Set([3333])],
  ["us.litesolo.org", new Set([3333])],
  ["scrypt.mysolopool.com", new Set([3341, 3342])],
  ["eu.molepool.com", new Set([2601, 2602, 2603])],
  ["lite.nexuspool.io", new Set([3354])],
  ["ltc.viabtc.io", new Set([3333, 443])],
]);

function allowed(host, port) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  const ports = ALLOW.get(h);
  return ports ? ports.has(Number(port)) : false;
}

function jsonMsg(obj) {
  return JSON.stringify(obj);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(
        jsonMsg({ ok: true, service: "onyx-stratum-proxy", pools: [...ALLOW.keys()] }),
        { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }
      );
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response(
        "Onyx Stratum Proxy — connect via WebSocket. See https://miner.onyxlab.dev\n",
        { status: 426, headers: { "access-control-allow-origin": "*" } }
      );
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    let tcpSocket = null;
    let writer = null;
    let closed = false;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let tcpBuf = "";

    const sendCtrl = (obj) => {
      try {
        server.send(jsonMsg(obj));
      } catch {
        /* ignore */
      }
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        writer?.releaseLock();
      } catch {
        /* ignore */
      }
      try {
        tcpSocket?.close();
      } catch {
        /* ignore */
      }
      try {
        server.close(1000, "done");
      } catch {
        /* ignore */
      }
    };

    const pumpTcp = async () => {
      const reader = tcpSocket.readable.getReader();
      try {
        while (!closed) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          tcpBuf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = tcpBuf.indexOf("\n")) >= 0) {
            const line = tcpBuf.slice(0, idx).replace(/\r$/, "");
            tcpBuf = tcpBuf.slice(idx + 1);
            if (line.length) {
              try {
                server.send(line);
              } catch {
                cleanup();
                return;
              }
            }
          }
        }
      } catch (e) {
        sendCtrl({ type: "error", message: `tcp_read: ${e?.message || e}` });
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
        sendCtrl({ type: "status", state: "tcp_closed" });
        cleanup();
      }
    };

    server.addEventListener("message", async (event) => {
      if (closed) return;
      const data = typeof event.data === "string" ? event.data : decoder.decode(event.data);

      if (!tcpSocket) {
        let msg;
        try {
          msg = JSON.parse(data);
        } catch {
          sendCtrl({ type: "error", message: "first_message_must_be_connect_json" });
          cleanup();
          return;
        }
        if (msg.type !== "connect" || !msg.host || !msg.port) {
          sendCtrl({ type: "error", message: "expected {type:connect,host,port}" });
          cleanup();
          return;
        }
        const host = String(msg.host).toLowerCase();
        const port = Number(msg.port);
        if (!allowed(host, port)) {
          sendCtrl({
            type: "error",
            message: `host_not_allowlisted: ${host}:${port}`,
          });
          cleanup();
          return;
        }
        try {
          tcpSocket = connect({ hostname: host, port });
          writer = tcpSocket.writable.getWriter();
          sendCtrl({ type: "status", state: "connected", host, port });
          ctx.waitUntil(pumpTcp());
        } catch (e) {
          sendCtrl({ type: "error", message: `tcp_connect_failed: ${e?.message || e}` });
          cleanup();
        }
        return;
      }

      // Forward stratum line(s) to TCP
      const payload = data.endsWith("\n") ? data : data + "\n";
      try {
        await writer.write(encoder.encode(payload));
      } catch (e) {
        sendCtrl({ type: "error", message: `tcp_write: ${e?.message || e}` });
        cleanup();
      }
    });

    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "access-control-allow-origin": "*" },
    });
  },
};
