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
          return handleDownload(request);

        case "/api/download-stream":
          return handleStreamingDownload(request);

        case "/api/popular":
          return handlePopular();

        case "/api/image-details":
          return handleImageDetails(request);

        case "/api/test":
          return handleTest(request);

        case "/api/test-docker":
          return handleDockerTest(request);

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
async function handleStreamingDownload(request: Request): Promise<Response> {
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
    const streamHandler = new StreamingDownloadHandler(registry);

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
async function handleDownload(request: Request): Promise<Response> {
  if (request.method === "GET") {
    // GET 请求返回测试表单
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Docker Image Download Test</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .form-group { margin: 15px 0; }
          label { display: block; margin-bottom: 5px; font-weight: bold; }
          input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
          button { background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background: #005a87; }
          .result { margin-top: 20px; padding: 10px; border-radius: 4px; }
          .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
      </head>
      <body>
        <h1>🐳 Docker Image Download Test</h1>
        <p>Test the Docker image download functionality:</p>
        
        <form id="downloadForm">
          <div class="form-group">
            <label for="image">Docker Image:</label>
            <input type="text" id="image" name="image" value="hello-world:latest" required>
          </div>
          
          <div class="form-group">
            <label for="platform">Platform:</label>
            <select id="platform" name="platform">
              <option value="linux/amd64">linux/amd64</option>
              <option value="linux/arm64">linux/arm64</option>
              <option value="linux/arm/v7">linux/arm/v7</option>
            </select>
          </div>
          
          <button type="submit">Download Image</button>
        </form>
        
        <div id="result"></div>
        
        <script>
          document.getElementById('downloadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const resultDiv = document.getElementById('result');
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            resultDiv.innerHTML = '<p>Downloading...</p>';
            
            try {
              const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.image.replace(/[^a-zA-Z0-9.-]/g, '_') + '.tar';
                a.click();
                URL.revokeObjectURL(url);
                
                resultDiv.innerHTML = '<div class="result success">✅ Download completed successfully!</div>';
              } else {
                const errorText = await response.text();
                resultDiv.innerHTML = '<div class="result error">❌ Download failed: ' + errorText + '</div>';
              }
            } catch (error) {
              resultDiv.innerHTML = '<div class="result error">❌ Error: ' + error.message + '</div>';
            }
          });
        </script>
      </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html" },
    });
  }
  
  if (request.method !== "POST") {
    return new Response("Method Not Allowed - Use POST request", { status: 405 });
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

    // 缓存已暂时禁用以调试核心下载功能

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
        password
      );
    }

    return await downloadWithClient(
      registryClient,
      repository,
      tag,
      platform,
      username,
      password
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
  password?: string
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

  // 缓存功能暂时移除

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
 * 处理测试请求 - 用于诊断AWS错误
 */
async function handleTest(request: Request): Promise<Response> {
  try {
    console.log("=== TEST REQUEST START ===");
    console.log("Method:", request.method);
    console.log("URL:", request.url);
    console.log("Headers:", Object.fromEntries(request.headers.entries()));

    // 测试一个简单的外部HTTP请求
    const testUrl = "https://httpbin.org/json";
    console.log("Testing simple HTTP request to:", testUrl);

    const response = await fetch(testUrl);
    const data = await response.json();

    console.log("Test response status:", response.status);
    console.log(
      "Test response headers:",
      Object.fromEntries(response.headers.entries())
    );
    console.log("=== TEST REQUEST END ===");

    return new Response(
      JSON.stringify({
        status: "test_success",
        testUrl,
        responseStatus: response.status,
        data,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("=== TEST ERROR ===", error);
    return new Response(
      JSON.stringify({
        status: "test_error",
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * 测试Docker Registry连接 - 只获取manifest，不下载blob
 */
async function handleDockerTest(request: Request): Promise<Response> {
  try {
    console.log("=== DOCKER TEST START ===");

    const registryClient = new DockerRegistryClient();
    const image = "hello-world:latest";
    const { repository, tag } = registryClient.parseImageName(image);

    console.log("Testing Docker Registry connection:");
    console.log("Repository:", repository);
    console.log("Tag:", tag);
    console.log("Registry URL:", "https://registry-1.docker.io");

    // 只测试获取manifest，不下载任何blob
    const manifest = await registryClient.getManifest(repository, tag);

    console.log("Manifest retrieved successfully");
    console.log("Manifest type:", manifest?.mediaType || "unknown");
    console.log("=== DOCKER TEST END ===");

    return new Response(
      JSON.stringify({
        status: "docker_test_success",
        image,
        repository,
        tag,
        manifestType: manifest?.mediaType || "unknown",
        hasManifest: !!manifest,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("=== DOCKER TEST ERROR ===", error);
    return new Response(
      JSON.stringify({
        status: "docker_test_error",
        error: error.message,
        timestamp: new Date().toISOString(),
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
