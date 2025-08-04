import { DockerRegistryClient } from "./docker-registry";
import { DockerManifest, PlatformSelection, Env } from "./types";

/**
 * 流式下载处理器 - 支持大镜像文件
 */
export class StreamingDownloadHandler {
  private client: DockerRegistryClient;
  private env: Env;

  constructor(registry: string, env: Env) {
    this.client = new DockerRegistryClient(registry);
    this.env = env;
  }

  /**
   * 处理流式下载请求
   */
  async handleStreamingDownload(
    image: string,
    platform: string = "linux/amd64",
    username?: string,
    password?: string
  ): Promise<Response> {
    try {
      const { repository, tag } = this.client.parseImageName(image);

      // 获取认证token
      const token = await this.client.getAuthToken(repository, username, password);

      // 获取manifest
      let manifest = await this.client.getManifest(repository, tag, token || undefined);
      if (!manifest) {
        throw new Error("Failed to fetch manifest");
      }

      // 处理多架构镜像
      if (manifest.manifests) {
        const [os, architecture, variant] = platform.split("/");
        const platformSelection: PlatformSelection = { os, architecture, variant };
        
        const selectedDigest = this.client.selectPlatformManifest(manifest, platformSelection);
        if (!selectedDigest) {
          throw new Error(`No manifest found for platform ${platform}`);
        }

        manifest = await this.client.getManifest(repository, selectedDigest, token || undefined);
        if (!manifest) {
          throw new Error("Failed to fetch platform-specific manifest");
        }
      }

      // 创建流式响应
      return this.createStreamingResponse(manifest, repository, tag, token, image);

    } catch (error) {
      throw new Error(`Streaming download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 创建流式响应
   */
  private async createStreamingResponse(
    manifest: DockerManifest,
    repository: string,
    tag: string,
    token: string | null,
    imageName: string
  ): Promise<Response> {
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 创建TAR头部
          await this.writeTarHeaders(controller, manifest, imageName);

          // 流式写入config
          if (manifest.config) {
            await this.writeConfigToStream(controller, repository, manifest.config.digest, token);
          } else {
            await this.writeMinimalConfig(controller, imageName);
          }

          // 流式写入所有层
          const layers = manifest.layers || [];
          for (let i = 0; i < layers.length; i++) {
            await this.writeLayerToStream(controller, repository, layers[i].digest, token, i);
          }

          // 写入TAR结尾
          await this.writeTarFooter(controller);

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }.bind(this)
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${imageName.replace(/[^a-zA-Z0-9.-]/g, '_')}.tar"`,
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache", // 大文件不缓存
      },
    });
  }

  /**
   * 写入TAR头部信息
   */
  private async writeTarHeaders(
    controller: ReadableStreamDefaultController,
    manifest: DockerManifest,
    imageName: string
  ): Promise<void> {
    // 创建manifest.json
    const manifestJson = JSON.stringify([{
      Config: "config.json",
      RepoTags: [imageName],
      Layers: (manifest.layers || []).map((_, index) => `layer_${index}.tar`)
    }]);

    const manifestHeader = this.createTarHeader("manifest.json", manifestJson.length);
    controller.enqueue(manifestHeader);
    controller.enqueue(new TextEncoder().encode(manifestJson));
    controller.enqueue(this.createPadding(manifestJson.length));
  }

  /**
   * 流式写入config到TAR
   */
  private async writeConfigToStream(
    controller: ReadableStreamDefaultController,
    repository: string,
    digest: string,
    token: string | null
  ): Promise<void> {
    const configData = await this.client.downloadBlob(repository, digest, token || undefined);
    if (!configData) {
      throw new Error("Failed to download config");
    }

    const configHeader = this.createTarHeader("config.json", configData.byteLength);
    controller.enqueue(configHeader);
    controller.enqueue(new Uint8Array(configData));
    controller.enqueue(this.createPadding(configData.byteLength));
  }

  /**
   * 写入最小配置
   */
  private async writeMinimalConfig(
    controller: ReadableStreamDefaultController,
    imageName: string
  ): Promise<void> {
    const minimalConfig = {
      architecture: "amd64",
      os: "linux",
      history: []
    };
    const configJson = JSON.stringify(minimalConfig);
    
    const configHeader = this.createTarHeader("config.json", configJson.length);
    controller.enqueue(configHeader);
    controller.enqueue(new TextEncoder().encode(configJson));
    controller.enqueue(this.createPadding(configJson.length));
  }

  /**
   * 流式写入层到TAR
   */
  private async writeLayerToStream(
    controller: ReadableStreamDefaultController,
    repository: string,
    digest: string,
    token: string | null,
    layerIndex: number
  ): Promise<void> {
    
    // 使用fetch API的stream功能直接流式传输
    const registryUrl = this.client['baseUrl'] || `https://registry-1.docker.io`;
    const url = `${registryUrl}/v2/${repository}/blobs/${digest}`;
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download layer ${digest}: ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0');
    
    // 写入层的TAR头部
    const layerHeader = this.createTarHeader(`layer_${layerIndex}.tar`, contentLength);
    controller.enqueue(layerHeader);

    // 流式传输层数据
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
      }
    }

    // 添加填充
    controller.enqueue(this.createPadding(contentLength));
  }

  /**
   * 写入TAR结尾
   */
  private async writeTarFooter(controller: ReadableStreamDefaultController): Promise<void> {
    // TAR格式要求两个空的512字节块作为结尾
    const footer = new Uint8Array(1024);
    controller.enqueue(footer);
  }

  /**
   * 创建TAR文件头
   */
  private createTarHeader(filename: string, size: number): Uint8Array {
    const header = new Uint8Array(512);
    
    // 文件名 (100字节)
    const nameBytes = new TextEncoder().encode(filename);
    header.set(nameBytes, 0);
    
    // 文件模式 (8字节)
    header.set(new TextEncoder().encode("0000644\0"), 100);
    
    // 用户ID和组ID (各8字节)
    header.set(new TextEncoder().encode("0000000\0"), 108);
    header.set(new TextEncoder().encode("0000000\0"), 116);
    
    // 文件大小 (12字节，8进制)
    const sizeOctal = size.toString(8).padStart(11, "0") + "\0";
    header.set(new TextEncoder().encode(sizeOctal), 124);
    
    // 修改时间 (12字节，8进制)
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0";
    header.set(new TextEncoder().encode(mtime), 136);
    
    // 类型标志 (1字节) - 普通文件
    header[156] = 48; // '0'
    
    // 计算校验和
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    const checksumOctal = checksum.toString(8).padStart(6, "0") + "\0 ";
    header.set(new TextEncoder().encode(checksumOctal), 148);
    
    return header;
  }

  /**
   * 创建填充字节
   */
  private createPadding(size: number): Uint8Array {
    const padding = (512 - (size % 512)) % 512;
    return new Uint8Array(padding);
  }
}