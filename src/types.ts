// Docker Registry API types
export interface DockerManifest {
  schemaVersion: number;
  mediaType: string;
  config?: {
    digest: string;
    mediaType: string;
    size: number;
  };
  layers?: Array<{
    digest: string;
    mediaType: string;
    size: number;
  }>;
  manifests?: Array<{
    digest: string;
    mediaType: string;
    size: number;
    platform?: {
      architecture: string;
      os: string;
      variant?: string;
    };
  }>;
}

export interface DockerSearchResult {
  name: string;
  description: string;
  star_count: number;
  is_official: boolean;
  is_automated: boolean;
  pull_count?: number;
}

export interface DockerSearchResponse {
  query: string;
  num_results: number;
  results: DockerSearchResult[];
}

export interface DownloadProgress {
  step: string;
  current: number;
  total: number;
  percent: number;
}

export interface Env {
  DOCKER_CACHE?: R2Bucket;
  METADATA?: KVNamespace;
}

export interface PlatformSelection {
  os: string;
  architecture: string;
  variant?: string;
}
