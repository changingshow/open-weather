# Weather Worker

天气查询 API 中转服务，带 IP 限流功能。

## 功能特性

- ✅ 查询城市天气信息
- ✅ IP 限流：每个 IP 每分钟最多 10 次请求
- ✅ 完整的日志记录
- ✅ 基于 Cloudflare Workers + KV

## 部署步骤

### 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <你的仓库地址>
git push -u origin main
```

### 2. 在 Cloudflare Dashboard 配置

#### 2.1 创建 KV 命名空间

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **KV**
3. 点击 **Create a namespace**
4. 命名为 `my-kv-space`
5. 记下创建的 KV Namespace ID

#### 2.2 配置环境变量和密钥

在 Cloudflare Dashboard 的 Worker 设置中添加：

**Environment Variables:**
- `WEATHER_API_KEY`: 你的 OpenWeatherMap API Key

**KV Namespace Bindings:**
- Variable name: `RATE_LIMIT_KV`
- KV namespace: 选择刚创建的 `my-kv-space`

### 3. 连接 GitHub 仓库部署

1. 在 Cloudflare Dashboard 进入 **Workers & Pages**
2. 点击 **Create application** → **Pages** → **Connect to Git**
3. 选择你的 GitHub 仓库
4. 配置构建设置：
   - **Framework preset**: None
   - **Build command**: `npm install`
   - **Build output directory**: 留空
5. 点击 **Save and Deploy**

### 4. 或者使用 Wrangler CLI 部署

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 部署到生产环境
npm run deploy
```

## API 使用

### 查询天气

```bash
GET https://your-worker.workers.dev/?city=Shanghai
```

**参数：**
- `city`: 城市名称（可选，默认 Beijing）

**响应头：**
- `X-RateLimit-Limit`: 限流上限
- `X-RateLimit-Remaining`: 剩余请求次数

**限流响应（429）：**
```json
{
  "error": "请求过于频繁，请稍后再试",
  "retryAfter": 60
}
```

## 查看日志

```bash
npx wrangler tail
```

或在 Cloudflare Dashboard 的 Worker 页面查看实时日志。

## 项目结构

```
c-worker/
├── src/
│   └── index.ts          # Worker 主逻辑
├── wrangler.jsonc        # Cloudflare Worker 配置
├── package.json          # 项目依赖
├── tsconfig.json         # TypeScript 配置
└── README.md             # 说明文档
```

## 注意事项

1. **KV Namespace ID**: 需要在 `wrangler.jsonc` 中填入你的 KV ID
2. **API Key**: 需要在 Cloudflare 中配置 `WEATHER_API_KEY` 密钥
3. **限流规则**: 当前设置为每 IP 每分钟 10 次，可在 `src/index.ts` 中修改

## 修改限流配置

编辑 `src/index.ts` 中的常量：

```typescript
const RATE_LIMIT = 10        // 每分钟最大请求次数
const RATE_LIMIT_WINDOW = 60 // 时间窗口（秒）
```
