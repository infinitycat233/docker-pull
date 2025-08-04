import { describe, it, expect } from "vitest";
import worker from "../src/index";

// Mock environment
const env = {
  DOCKER_CACHE: undefined,
  METADATA: undefined,
};

// Mock execution context
const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
};

describe("Docker Image Downloader Worker", () => {
  it("应该返回主页HTML", async () => {
    const request = new Request("http://localhost/");
    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("Docker镜像下载器");
    expect(html).toContain("搜索Docker镜像");
  });

  it("应该处理健康检查请求", async () => {
    const request = new Request("http://localhost/health");
    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const data = await response.json();
    expect(data).toHaveProperty("status", "healthy");
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("version");
  });

  it("应该处理CORS预检请求", async () => {
    const request = new Request("http://localhost/api/search", {
      method: "OPTIONS",
    });
    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
  });

  it("应该返回404对于未知路由", async () => {
    const request = new Request("http://localhost/unknown-route");
    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(404);
  });

  it("搜索API应该要求POST方法", async () => {
    const request = new Request("http://localhost/api/search", {
      method: "GET",
    });
    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(405);
  });

  it("搜索API应该验证请求体", async () => {
    const request = new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        /* 缺少query参数 */
      }),
    });
    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty("error");
  });

  it("下载API应该验证请求体", async () => {
    const request = new Request("http://localhost/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        /* 缺少image参数 */
      }),
    });
    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty("error");
  });
});
