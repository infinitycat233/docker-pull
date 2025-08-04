export const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Docker镜像下载器 - Cloudflare Workers</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        .hero-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4rem 0;
        }
        .search-card {
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            border: none;
            border-radius: 15px;
        }
        .image-card {
            transition: transform 0.2s;
            border: none;
            box-shadow: 0 5px 15px rgba(0,0,0,0.08);
        }
        .image-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        }
        .download-btn {
            background: linear-gradient(45deg, #28a745, #20c997);
            border: none;
            border-radius: 25px;
            padding: 0.5rem 1.5rem;
        }
        .download-btn:hover {
            background: linear-gradient(45deg, #218838, #1ea085);
        }
        .progress-container {
            display: none;
            margin-top: 1rem;
        }
        .tag-badge {
            background: #f8f9fa;
            color: #6c757d;
            border-radius: 20px;
            padding: 0.25rem 0.75rem;
            font-size: 0.85rem;
            margin: 0.2rem;
        }
    </style>
</head>
<body>
    <!-- Hero Section -->
    <section class="hero-section">
        <div class="container">
            <div class="row justify-content-center text-center">
                <div class="col-lg-8">
                    <h1 class="display-4 fw-bold mb-4">
                        <i class="fab fa-docker"></i> Docker镜像下载器
                    </h1>
                    <p class="lead mb-4">基于Cloudflare Workers的高性能Docker镜像搜索和下载服务</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Main Content -->
    <div class="container my-5">
        <!-- Search Section -->
        <div class="row justify-content-center mb-5">
            <div class="col-lg-8">
                <div class="card search-card p-4">
                    <h3 class="text-center mb-4">
                        <i class="fas fa-search"></i> 搜索Docker镜像
                    </h3>
                    
                    <div class="row">
                        <div class="col-md-8 mb-3">
                            <input type="text" 
                                   id="searchInput" 
                                   class="form-control form-control-lg" 
                                   placeholder="输入镜像名称，如: ubuntu, nginx, mysql..."
                                   value="">
                        </div>
                        <div class="col-md-4 mb-3">
                            <button id="searchBtn" class="btn btn-primary btn-lg w-100">
                                <i class="fas fa-search"></i> 搜索
                            </button>
                        </div>
                    </div>

                    <!-- Platform Selection -->
                    <div class="row mt-3">
                        <div class="col-md-6">
                            <label class="form-label">目标平台:</label>
                            <select id="platformSelect" class="form-select">
                                <option value="linux/amd64">Linux AMD64</option>
                                <option value="linux/arm64">Linux ARM64</option>
                                <option value="linux/arm/v7">Linux ARM v7</option>
                                <option value="linux/arm/v6">Linux ARM v6</option>
                                <option value="linux/386">Linux 386</option>
                                <option value="windows/amd64">Windows AMD64</option>
                                <option value="darwin/amd64">macOS AMD64</option>
                                <option value="darwin/arm64">macOS ARM64</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">镜像标签:</label>
                            <input type="text" 
                                   id="tagInput" 
                                   class="form-control" 
                                   placeholder="latest" 
                                   value="latest">
                        </div>
                    </div>

                    <!-- Quick Download -->
                    <div class="mt-4 p-3 bg-light rounded">
                        <h6><i class="fas fa-bolt"></i> 快速下载</h6>
                        <div class="row">
                            <div class="col-md-8">
                                <input type="text" 
                                       id="quickDownloadInput" 
                                       class="form-control" 
                                       placeholder="直接输入完整镜像名，如: ubuntu:22.04">
                            </div>
                            <div class="col-md-4">
                                <button id="quickDownloadBtn" class="btn download-btn w-100">
                                    <i class="fas fa-download"></i> 立即下载
                                </button>
                            </div>
                        </div>
                        
                        <div class="row mt-2">
                            <div class="col-12">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="useStreamingDownload">
                                    <label class="form-check-label" for="useStreamingDownload">
                                        <i class="fas fa-stream"></i> 使用流式下载（推荐用于大镜像 >500MB）
                                    </label>
                                </div>
                                <small class="text-muted">
                                    💡 流式下载支持任意大小的镜像，包括多GB镜像文件
                                </small>
                            </div>
                        </div>
                        
                        <!-- Progress Bar -->
                        <div id="progressContainer" class="progress-container">
                            <div class="progress">
                                <div id="progressBar" class="progress-bar progress-bar-striped progress-bar-animated" 
                                     role="progressbar" style="width: 0%">0%</div>
                            </div>
                            <small id="progressText" class="text-muted mt-2 d-block"></small>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Loading Indicator -->
        <div id="loadingIndicator" class="text-center d-none">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">加载中...</span>
            </div>
            <p class="mt-2">正在搜索镜像...</p>
        </div>

        <!-- Search Results -->
        <div id="searchResults"></div>

        <!-- Popular Images -->
        <div id="popularImages" class="mt-5">
            <h3 class="text-center mb-4">
                <i class="fas fa-fire"></i> 热门镜像
            </h3>
            <div class="row" id="popularImagesList">
                <!-- Popular images will be loaded here -->
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Global variables
        let currentSearchResults = [];

        // DOM Elements
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const loadingIndicator = document.getElementById('loadingIndicator');
        const searchResults = document.getElementById('searchResults');
        const platformSelect = document.getElementById('platformSelect');
        const tagInput = document.getElementById('tagInput');
        const quickDownloadInput = document.getElementById('quickDownloadInput');
        const quickDownloadBtn = document.getElementById('quickDownloadBtn');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');

        // Event listeners
        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
        quickDownloadBtn.addEventListener('click', quickDownload);
        quickDownloadInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') quickDownload();
        });

        // Search function
        async function performSearch() {
            const query = searchInput.value.trim();
            if (!query) return;

            showLoading(true);
            
            try {
                const response = await fetch('/api/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, limit: 20 })
                });

                const data = await response.json();
                displaySearchResults(data.results || []);
            } catch (error) {
                console.error('Search error:', error);
                showError('搜索失败，请稍后重试');
            } finally {
                showLoading(false);
            }
        }

        // Quick download function
        async function quickDownload() {
            const imageName = quickDownloadInput.value.trim();
            if (!imageName) return;

            const platform = platformSelect.value;
            const tag = tagInput.value || 'latest';
            
            downloadImage(imageName, platform, tag);
        }

        // Download image function
        async function downloadImage(imageName, platform = 'linux/amd64', tag = 'latest') {
            try {
                showProgress(true);
                updateProgress(0, '准备下载...');

                const fullImageName = imageName.includes(':') ? imageName : \`\${imageName}:\${tag}\`;
                const useStreaming = document.getElementById('useStreamingDownload')?.checked || false;
                
                // 选择下载API端点
                const apiEndpoint = useStreaming ? '/api/download-stream' : '/api/download';
                
                updateProgress(10, useStreaming ? '启动流式下载...' : '启动标准下载...');
                
                const response = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        image: fullImageName,
                        platform: platform
                    })
                });

                if (!response.ok) {
                    throw new Error(\`下载失败: \${response.status}\`);
                }

                updateProgress(30, '开始接收数据...');

                let blob;
                if (useStreaming && response.body) {
                    // 流式下载处理
                    const reader = response.body.getReader();
                    const chunks = [];
                    let receivedLength = 0;
                    const contentLength = parseInt(response.headers.get('content-length') || '0');
                    
                    while (true) {
                        const { done, value } = await reader.read();
                        
                        if (done) break;
                        
                        chunks.push(value);
                        receivedLength += value.length;
                        
                        // 更新进度
                        if (contentLength > 0) {
                            const progress = Math.min(90, 30 + (receivedLength / contentLength) * 60);
                            updateProgress(progress, \`正在下载: \${formatBytes(receivedLength)}/\${formatBytes(contentLength)}\`);
                        } else {
                            updateProgress(Math.min(85, 30 + (receivedLength / (50 * 1024 * 1024)) * 55), \`已下载: \${formatBytes(receivedLength)}\`);
                        }
                    }
                    
                    // 合并所有数据块
                    const allChunks = new Uint8Array(receivedLength);
                    let position = 0;
                    for (const chunk of chunks) {
                        allChunks.set(chunk, position);
                        position += chunk.length;
                    }
                    
                    blob = new Blob([allChunks], { type: 'application/octet-stream' });
                } else {
                    // 标准下载处理
                    updateProgress(50, '正在处理镜像...');
                    blob = await response.blob();
                }
                
                updateProgress(90, '准备保存文件...');

                // Create download link
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = \`\${fullImageName.replace(/[^a-zA-Z0-9.-]/g, '_')}.tar\`;
                document.body.appendChild(a);
                a.click();
                
                updateProgress(100, \`下载完成！文件大小: \${formatBytes(blob.size)}\`);
                
                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    showProgress(false);
                }, 3000);

            } catch (error) {
                console.error('Download error:', error);
                showError(\`下载失败: \${error.message}\`);
                showProgress(false);
            }
        }

        // Display search results
        function displaySearchResults(results) {
            if (results.length === 0) {
                searchResults.innerHTML = \`
                    <div class="alert alert-info text-center">
                        <i class="fas fa-info-circle"></i> 没有找到相关镜像
                    </div>
                \`;
                return;
            }

            const resultsHtml = results.map(result => \`
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card image-card h-100">
                        <div class="card-body">
                            <h5 class="card-title">
                                <i class="fab fa-docker text-primary"></i>
                                \${result.name}
                                \${result.is_official ? '<span class="badge bg-success ms-2">官方</span>' : ''}
                            </h5>
                            <p class="card-text text-muted small">
                                \${result.description || '暂无描述'}
                            </p>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <small class="text-muted">
                                    <i class="fas fa-star text-warning"></i> \${result.star_count}
                                </small>
                                \${result.pull_count ? \`<small class="text-muted">
                                    <i class="fas fa-download"></i> \${formatNumber(result.pull_count)}
                                </small>\` : ''}
                            </div>
                            <div class="d-grid gap-2">
                                <button class="btn download-btn" 
                                        onclick="downloadImage('\${result.name}', '\${platformSelect.value}', '\${tagInput.value}')">
                                    <i class="fas fa-download"></i> 下载
                                </button>
                                <button class="btn btn-outline-info btn-sm" 
                                        onclick="showImageDetails('\${result.name}')">
                                    <i class="fas fa-info"></i> 详情
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            \`).join('');

            searchResults.innerHTML = \`
                <h3 class="mb-4">
                    <i class="fas fa-list"></i> 搜索结果 (\${results.length})
                </h3>
                <div class="row">
                    \${resultsHtml}
                </div>
            \`;
        }

        // Show image details
        async function showImageDetails(imageName) {
            try {
                const response = await fetch('/api/image-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: imageName })
                });

                const data = await response.json();
                
                // Show modal with image details
                showImageDetailsModal(data);
            } catch (error) {
                console.error('Error fetching image details:', error);
                showError('获取镜像详情失败');
            }
        }

        // Show image details modal
        function showImageDetailsModal(imageData) {
            // Create and show bootstrap modal with image details
            const modalHtml = \`
                <div class="modal fade" id="imageDetailsModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    <i class="fab fa-docker"></i> \${imageData.name}
                                </h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <p><strong>描述:</strong> \${imageData.description || '暂无描述'}</p>
                                <p><strong>星数:</strong> \${imageData.star_count || 0}</p>
                                <p><strong>下载量:</strong> \${formatNumber(imageData.pull_count || 0)}</p>
                                \${imageData.tags ? \`
                                    <p><strong>可用标签:</strong></p>
                                    <div class="tags-container">
                                        \${imageData.tags.map(tag => \`<span class="tag-badge">\${tag.name}</span>\`).join('')}
                                    </div>
                                \` : ''}
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                                <button type="button" class="btn download-btn" 
                                        onclick="downloadImage('\${imageData.name}', '\${platformSelect.value}', '\${tagInput.value}'); bootstrap.Modal.getInstance(document.getElementById('imageDetailsModal')).hide();">
                                    <i class="fas fa-download"></i> 下载镜像
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            \`;

            // Remove existing modal
            const existingModal = document.getElementById('imageDetailsModal');
            if (existingModal) {
                existingModal.remove();
            }

            // Add new modal
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modal = new bootstrap.Modal(document.getElementById('imageDetailsModal'));
            modal.show();
        }

        // Utility functions
        function showLoading(show) {
            if (show) {
                loadingIndicator.classList.remove('d-none');
                searchResults.innerHTML = '';
            } else {
                loadingIndicator.classList.add('d-none');
            }
        }

        function showProgress(show) {
            if (show) {
                progressContainer.style.display = 'block';
            } else {
                progressContainer.style.display = 'none';
                updateProgress(0, '');
            }
        }

        function updateProgress(percent, text) {
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent + '%';
            progressText.textContent = text;
        }

        function showError(message) {
            searchResults.innerHTML = \`
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> \${message}
                </div>
            \`;
        }

        function formatNumber(num) {
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'M';
            } else if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'K';
            }
            return num.toString();
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Load popular images on page load
        window.addEventListener('load', loadPopularImages);

        async function loadPopularImages() {
            try {
                const response = await fetch('/api/popular');
                const data = await response.json();
                
                if (data.results && data.results.length > 0) {
                    displayPopularImages(data.results);
                }
            } catch (error) {
                console.error('Error loading popular images:', error);
            }
        }

        function displayPopularImages(images) {
            const imagesHtml = images.slice(0, 6).map(image => \`
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card image-card h-100">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="fab fa-docker text-primary"></i>
                                \${image.name}
                                \${image.is_official ? '<span class="badge bg-success ms-2">官方</span>' : ''}
                            </h6>
                            <p class="card-text text-muted small">
                                \${(image.description || '').substring(0, 80)}\${image.description && image.description.length > 80 ? '...' : ''}
                            </p>
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <small class="text-muted">
                                    <i class="fas fa-star text-warning"></i> \${image.star_count}
                                </small>
                            </div>
                            <div class="d-grid">
                                <button class="btn download-btn btn-sm" 
                                        onclick="downloadImage('\${image.name}', '\${platformSelect.value}', 'latest')">
                                    <i class="fas fa-download"></i> 下载
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            \`).join('');

            document.getElementById('popularImagesList').innerHTML = imagesHtml;
        }
    </script>
</body>
</html>
`;
