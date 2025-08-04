import { DockerManifest, PlatformSelection } from "./types";

export class DockerRegistryClient {
  private baseUrl: string;
  private registry: string;

  constructor(registry: string = "registry-1.docker.io") {
    this.registry = registry;
    this.baseUrl = `https://${registry}`;
  }

  /**
   * 获取认证token
   */
  async getAuthToken(
    repository: string,
    username?: string,
    password?: string
  ): Promise<string | null> {
    try {
      // 首先尝试匿名访问
      const authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;

      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (username && password) {
        headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
      }

      const response = await fetch(authUrl, { headers });

      if (!response.ok) {
        console.error(`Auth failed: ${response.status}`);
        return null;
      }

      const data: any = await response.json();
      return data.token || null;
    } catch (error) {
      console.error("Auth error:", error);
      return null;
    }
  }

  /**
   * 解析镜像名称
   */
  parseImageName(image: string): {
    registry: string;
    repository: string;
    tag: string;
  } {
    let registry = "registry-1.docker.io";
    let repository = image;
    let tag = "latest";

    // 处理tag
    if (image.includes(":")) {
      const parts = image.split(":");
      tag = parts.pop() || "latest";
      repository = parts.join(":");
    }

    // 处理registry
    if (repository.includes("/") && repository.split("/").length > 1) {
      const parts = repository.split("/");
      if (parts[0].includes(".") || parts[0].includes(":")) {
        registry = parts.shift() || registry;
        repository = parts.join("/");
      }
    }

    // Docker Hub官方镜像特殊处理
    if (!repository.includes("/") && registry === "registry-1.docker.io") {
      repository = `library/${repository}`;
    }

    return { registry, repository, tag };
  }

  /**
   * 获取镜像manifest
   */
  async getManifest(
    repository: string,
    tag: string,
    token?: string
  ): Promise<DockerManifest | null> {
    try {
      const url = `${this.baseUrl}/v2/${repository}/manifests/${tag}`;
      const headers: Record<string, string> = {
        Accept: [
          "application/vnd.docker.distribution.manifest.v2+json",
          "application/vnd.docker.distribution.manifest.list.v2+json",
          "application/vnd.oci.image.manifest.v1+json",
          "application/vnd.oci.image.index.v1+json",
        ].join(", "),
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.error(`Manifest fetch failed: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("Manifest error:", error);
      return null;
    }
  }

  /**
   * 选择平台特定的manifest
   */
  selectPlatformManifest(
    manifest: DockerManifest,
    platform: PlatformSelection
  ): string | null {
    if (!manifest.manifests) {
      return null; // 不是多架构镜像
    }

    // 精确匹配
    for (const m of manifest.manifests) {
      const p = m.platform;
      if (
        p &&
        p.os === platform.os &&
        p.architecture === platform.architecture
      ) {
        if (!platform.variant || p.variant === platform.variant) {
          return m.digest;
        }
      }
    }

    // 架构匹配，操作系统兼容
    const osCompatibility: Record<string, string[]> = {
      linux: ["linux"],
      windows: ["windows"],
      darwin: ["darwin", "linux"],
    };

    const compatibleOs = osCompatibility[platform.os] || [platform.os];

    for (const m of manifest.manifests) {
      const p = m.platform;
      if (
        p &&
        compatibleOs.includes(p.os) &&
        p.architecture === platform.architecture
      ) {
        return m.digest;
      }
    }

    // 返回第一个兼容的manifest
    for (const m of manifest.manifests) {
      if (m.mediaType.includes("manifest")) {
        return m.digest;
      }
    }

    return null;
  }

  /**
   * 下载blob数据
   */
  async downloadBlob(
    repository: string,
    digest: string,
    token?: string
  ): Promise<ArrayBuffer | null> {
    try {
      const url = `${this.baseUrl}/v2/${repository}/blobs/${digest}`;
      const headers: Record<string, string> = {};

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.error(`Blob download failed: ${response.status}`);
        return null;
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error("Blob download error:", error);
      return null;
    }
  }

  /**
   * 创建Docker镜像tar包
   */
  async createImageTar(
    manifest: DockerManifest,
    configData: ArrayBuffer,
    layersData: ArrayBuffer[],
    imageName: string
  ): Promise<ArrayBuffer> {
    // 创建manifest.json
    const imageId = this.generateImageId(configData);
    const repoTags = [imageName];

    const manifestJson = JSON.stringify([
      {
        Config: `${imageId}.json`,
        RepoTags: repoTags,
        Layers: layersData.map((_, index) => `layer_${index}.tar`),
      },
    ]);

    // 使用简单的tar格式创建
    const files: Array<{ name: string; data: ArrayBuffer }> = [
      { name: "manifest.json", data: new TextEncoder().encode(manifestJson) },
      { name: `${imageId}.json`, data: configData },
    ];

    // 添加层文件
    layersData.forEach((layerData, index) => {
      files.push({ name: `layer_${index}.tar`, data: layerData });
    });

    return this.createTarArchive(files);
  }

  /**
   * 生成镜像ID
   */
  private generateImageId(configData: ArrayBuffer): string {
    // 简化版SHA256计算
    const hash = Array.from(new Uint8Array(configData))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 64);
    return hash;
  }

  /**
   * 创建TAR存档
   */
  private createTarArchive(
    files: Array<{ name: string; data: ArrayBuffer }>
  ): ArrayBuffer {
    let totalSize = 0;
    const fileBlocks: ArrayBuffer[] = [];

    files.forEach((file) => {
      const nameBytes = new TextEncoder().encode(file.name);
      const header = new ArrayBuffer(512);
      const headerView = new Uint8Array(header);

      // 文件名
      headerView.set(nameBytes, 0);

      // 文件大小 (8进制)
      const sizeOctal =
        file.data.byteLength.toString(8).padStart(11, "0") + "\0";
      headerView.set(new TextEncoder().encode(sizeOctal), 124);

      // 文件模式
      headerView.set(new TextEncoder().encode("0000644\0"), 100);

      // 类型标志 (普通文件)
      headerView[156] = 48; // '0'

      // 计算校验和
      let checksum = 0;
      for (let i = 0; i < 512; i++) {
        checksum += headerView[i];
      }
      const checksumOctal = checksum.toString(8).padStart(6, "0") + "\0 ";
      headerView.set(new TextEncoder().encode(checksumOctal), 148);

      fileBlocks.push(header);
      fileBlocks.push(file.data);

      // 添加填充到512字节边界
      const padding = (512 - (file.data.byteLength % 512)) % 512;
      if (padding > 0) {
        fileBlocks.push(new ArrayBuffer(padding));
      }

      totalSize += 512 + file.data.byteLength + padding;
    });

    // 添加两个空块作为结束标记
    fileBlocks.push(new ArrayBuffer(1024));
    totalSize += 1024;

    // 合并所有块
    const result = new ArrayBuffer(totalSize);
    const resultView = new Uint8Array(result);
    let offset = 0;

    fileBlocks.forEach((block) => {
      resultView.set(new Uint8Array(block), offset);
      offset += block.byteLength;
    });

    return result;
  }
}
