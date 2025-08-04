import { DockerRegistryClient } from "./docker-registry";
import { DockerSearchClient } from "./docker-search";
import { StreamingDownloadHandler } from "./streaming-download";
import { HTML_TEMPLATE } from "./html-templates";
import { Env, PlatformSelection } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Add CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    try {
      // Routes
      switch (path) {
        case "/":
          return handleHome();

        case "/api/search":
          return handleSearch(request);

        case "/api/download":
          return handleDownload(request, env);

        case "/api/download-stream":
          return handleStreamingDownload(request, env);

        case "/api/popular":
          return handlePopular();

        case "/api/image-details":
          return handleImageDetails(request);

        case "/health":
          return handleHealth();

        default:
          return new Response("Not Found", {
            status: 404,
            headers: corsHeaders,
          });
      }
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
  },
};

/**
 * 主页面
 */
async function handleHome(): Promise<Response> {
  return new Response(HTML_TEMPLATE, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * 处理镜像搜索
 */
async function handleSearch(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { query, limit = 25 }: { query: string; limit?: number } =
      await request.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid query parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const searchClient = new DockerSearchClient();
    const results = await searchClient.searchImages(query.trim(), limit);

    return new Response(
      JSON.stringify(results || { query, num_results: 0, results: [] }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300", // 5分钟缓存
        },
      }
    );
  } catch (error) {
    console.error("Search error:", error);
    return new Response(
      JSON.stringify({
        error: "Search failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * 处理流式镜像下载（支持大镜像）
 */
async function handleStreamingDownload(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const {
      image,
      platform = "linux/amd64",
      username,
      password,
    }: {
      image: string;
      platform?: string;
      username?: string;
      password?: string;
    } = await request.json();

    if (!image || typeof image !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid image parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 解析镜像信息
    const registryClient = new DockerRegistryClient();
    const { registry } = registryClient.parseImageName(image);

    // 创建流式下载处理器
    const streamHandler = new StreamingDownloadHandler(registry, env);

    // 执行流式下载
    return await streamHandler.handleStreamingDownload(
      image,
      platform,
      username,
      password
    );
  } catch (error) {
    console.error("Streaming download error:", error);
    return new Response(
      JSON.stringify({
        error: "Streaming download failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * 处理镜像下载
 */
async function handleDownload(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const {
      image,
      platform = "linux/amd64",
      username,
      password,
    }: {
      image: string;
      platform?: string;
      username?: string;
      password?: string;
    } = await request.json();

    if (!image || typeof image !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid image parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 检查缓存（暂时禁用以调试核心功能）
    const cacheKey = `${image}-${platform}`;
    let cachedData: ArrayBuffer | null = null;

    // 暂时禁用缓存
    if (false && env.DOCKER_CACHE) {
      try {
        const cached = await env.DOCKER_CACHE.get(cacheKey);
        if (cached) {
          console.log("Cache hit for:", cacheKey);
          cachedData = await cached.arrayBuffer();
        }
      } catch (error) {
        console.warn("Cache read error:", error);
      }
    }

    if (cachedData) {
      return new Response(cachedData, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${image.replace(
            /[^a-zA-Z0-9.-]/g,
            "_"
          )}.tar"`,
          "Cache-Control": "public, max-age=86400", // 24小时缓存
        },
      });
    }

    // 创建Docker Registry客户端
    const registryClient = new DockerRegistryClient();
    const { registry, repository, tag } = registryClient.parseImageName(image);

    // 设置正确的registry客户端
    if (registry !== "registry-1.docker.io") {
      const customRegistryClient = new DockerRegistryClient(registry);
      return await downloadWithClient(
        customRegistryClient,
        repository,
        tag,
        platform,
        username,
        password,
        env,
        cacheKey
      );
    }

    return await downloadWithClient(
      registryClient,
      repository,
      tag,
      platform,
      username,
      password,
      env,
      cacheKey
    );
  } catch (error) {
    console.error("Download error:", error);
    return new Response(
      JSON.stringify({
        error: "Download failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * 使用指定客户端下载镜像
 */
async function downloadWithClient(
  client: DockerRegistryClient,
  repository: string,
  tag: string,
  platform: string,
  username?: string,
  password?: string,
  env?: Env,
  cacheKey?: string
): Promise<Response> {
  // 获取认证token
  const token = await client.getAuthToken(repository, username, password);

  // 获取manifest
  let manifest = await client.getManifest(repository, tag, token || undefined);
  if (!manifest) {
    return new Response(JSON.stringify({ error: "Failed to fetch manifest" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 处理多架构镜像
  if (manifest.manifests) {
    const [os, architecture, variant] = platform.split("/");
    const platformSelection: PlatformSelection = { os, architecture, variant };

    const selectedDigest = client.selectPlatformManifest(
      manifest,
      platformSelection
    );
    if (!selectedDigest) {
      return new Response(
        JSON.stringify({ error: `No manifest found for platform ${platform}` }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 获取特定平台的manifest
    manifest = await client.getManifest(
      repository,
      selectedDigest,
      token || undefined
    );
    if (!manifest) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch platform-specific manifest" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // 下载config
  let configData: ArrayBuffer | null = null;
  if (manifest.config) {
    configData = await client.downloadBlob(
      repository,
      manifest.config.digest,
      token || undefined
    );
    if (!configData) {
      return new Response(
        JSON.stringify({ error: "Failed to download config" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } else {
    // Schema v1 compatibility - 创建最小配置
    const minimalConfig = {
      architecture: platform.split("/")[1] || "amd64",
      os: platform.split("/")[0] || "linux",
      history: [],
    };
    configData = new TextEncoder().encode(JSON.stringify(minimalConfig)).buffer;
  }

  // 下载所有层
  const layers = manifest.layers || [];
  const layersData: ArrayBuffer[] = [];

  for (const layer of layers) {
    const layerData = await client.downloadBlob(
      repository,
      layer.digest,
      token || undefined
    );
    if (!layerData) {
      return new Response(
        JSON.stringify({ error: `Failed to download layer ${layer.digest}` }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    layersData.push(layerData);
  }

  // 创建tar文件
  const tarData = await client.createImageTar(
    manifest,
    configData,
    layersData,
    `${repository}:${tag}`
  );

  // 缓存结果（暂时禁用）
  if (false && env?.DOCKER_CACHE && cacheKey) {
    try {
      // 将 ArrayBuffer 转换为 Uint8Array 以确保兼容性
      const cacheData =
        tarData instanceof ArrayBuffer ? new Uint8Array(tarData) : tarData;
      await env.DOCKER_CACHE.put(cacheKey, cacheData, {
        httpMetadata: {
          contentType: "application/octet-stream",
        },
        customMetadata: {
          createdAt: new Date().toISOString(),
        },
      });
      console.log("Cached:", cacheKey);
    } catch (error) {
      console.warn("Cache write error:", error);
    }
  }

  return new Response(tarData, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${repository.replace(
        /[^a-zA-Z0-9.-]/g,
        "_"
      )}_${tag}.tar"`,
      "Content-Length": tarData.byteLength.toString(),
    },
  });
}

/**
 * 获取热门镜像
 */
async function handlePopular(): Promise<Response> {
  try {
    const searchClient = new DockerSearchClient();
    const results = await searchClient.getPopularImages(20);

    return new Response(JSON.stringify({ results }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // 1小时缓存
      },
    });
  } catch (error) {
    console.error("Popular images error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch popular images",
        results: [],
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * 获取镜像详情
 */
async function handleImageDetails(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { image }: { image: string } = await request.json();

    if (!image || typeof image !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid image parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const searchClient = new DockerSearchClient();

    // 获取镜像详情和标签
    const [details, tags] = await Promise.all([
      searchClient.getImageDetails(image),
      searchClient.getImageTags(image, 1, 10),
    ]);

    const result = {
      name: image,
      ...details,
      tags: tags?.results || [],
    };

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=1800", // 30分钟缓存
      },
    });
  } catch (error) {
    console.error("Image details error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch image details",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * 健康检查
 */
async function handleHealth(): Promise<Response> {
  return new Response(
    JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
