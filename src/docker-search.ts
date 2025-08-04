import { DockerSearchResponse, DockerSearchResult } from "./types";

export class DockerSearchClient {
  private baseUrl = "https://index.docker.io";

  /**
   * 搜索Docker Hub镜像
   */
  async searchImages(
    query: string,
    limit: number = 25
  ): Promise<DockerSearchResponse | null> {
    try {
      const url = `${this.baseUrl}/v1/search?q=${encodeURIComponent(
        query
      )}&n=${limit}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Docker-Registry-Client/1.0",
        },
      });

      if (!response.ok) {
        console.error(`Search failed: ${response.status}`);
        return null;
      }

      const data = await response.json();

      return {
        query,
        num_results: data.num_results || data.results?.length || 0,
        results: data.results || [],
      };
    } catch (error) {
      console.error("Search error:", error);
      return null;
    }
  }

  /**
   * 获取镜像详细信息
   */
  async getImageDetails(imageName: string): Promise<any | null> {
    try {
      // 解析镜像名称
      const [namespace, name] = imageName.includes("/")
        ? imageName.split("/")
        : ["library", imageName];

      const url = `${this.baseUrl}/v2/repositories/${namespace}/${name}/`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Docker-Registry-Client/1.0",
        },
      });

      if (!response.ok) {
        console.error(`Image details fetch failed: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("Image details error:", error);
      return null;
    }
  }

  /**
   * 获取镜像标签列表
   */
  async getImageTags(
    imageName: string,
    page: number = 1,
    pageSize: number = 10
  ): Promise<any | null> {
    try {
      // 解析镜像名称
      const [namespace, name] = imageName.includes("/")
        ? imageName.split("/")
        : ["library", imageName];

      const url = `${this.baseUrl}/v2/repositories/${namespace}/${name}/tags/?page=${page}&page_size=${pageSize}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Docker-Registry-Client/1.0",
        },
      });

      if (!response.ok) {
        console.error(`Tags fetch failed: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("Tags fetch error:", error);
      return null;
    }
  }

  /**
   * 获取热门镜像列表
   */
  async getPopularImages(limit: number = 20): Promise<DockerSearchResult[]> {
    const popularQueries = [
      "ubuntu",
      "nginx",
      "redis",
      "mysql",
      "postgres",
      "node",
      "python",
      "alpine",
      "busybox",
      "hello-world",
    ];

    const results: DockerSearchResult[] = [];

    for (const query of popularQueries.slice(0, Math.ceil(limit / 2))) {
      const searchResult = await this.searchImages(query, 5);
      if (searchResult?.results) {
        results.push(...searchResult.results.slice(0, 2));
      }

      if (results.length >= limit) break;
    }

    // 去重并按star数排序
    const uniqueResults = results
      .filter(
        (result, index, self) =>
          self.findIndex((r) => r.name === result.name) === index
      )
      .sort((a, b) => b.star_count - a.star_count)
      .slice(0, limit);

    return uniqueResults;
  }

  /**
   * 获取官方镜像列表
   */
  async getOfficialImages(limit: number = 20): Promise<DockerSearchResult[]> {
    try {
      const searchResult = await this.searchImages("", 100);

      if (!searchResult?.results) {
        return [];
      }

      return searchResult.results
        .filter((result) => result.is_official)
        .sort((a, b) => b.star_count - a.star_count)
        .slice(0, limit);
    } catch (error) {
      console.error("Official images error:", error);
      return [];
    }
  }
}
