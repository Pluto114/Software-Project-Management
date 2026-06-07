# Vercel + Render 部署说明

本项目的公网演示建议采用：

- Vercel：部署 `apps/command-center-web` 前端
- Render：部署两个后端 Web Service
  - `pluto114-spm-asset-service`
  - `pluto114-spm-field-service`

## 1. 部署 Render 后端

1. 登录 Render。
2. 选择 **Blueprints**。
3. 连接 GitHub 仓库 `Pluto114/Software-Project-Management`。
4. Render 会读取仓库根目录的 `render.yaml`。
5. 创建两个服务：
   - `pluto114-spm-asset-service`
   - `pluto114-spm-field-service`
6. 等待两个服务部署完成。

默认公网地址应为：

```text
https://pluto114-spm-asset-service.onrender.com
https://pluto114-spm-field-service.onrender.com
```

健康检查：

```text
https://pluto114-spm-asset-service.onrender.com/health
https://pluto114-spm-field-service.onrender.com/health
```

如果 Render 生成的服务域名不同，需要同步修改：

```text
apps/command-center-web/vercel.json
```

## 2. 部署 Vercel 前端

1. 登录 Vercel。
2. Import Git Repository。
3. 选择 `Pluto114/Software-Project-Management`。
4. 配置：
   - Framework Preset: `Vite`
   - Root Directory: `apps/command-center-web`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Deploy。

前端会通过 `apps/command-center-web/vercel.json` 把 `/api/v1/...` 请求转发到 Render 后端。

## 3. 演示账号

```text
admin / admin123
manager / manager123
operator / operator123
analyst / analyst123
ops / ops123
```

## 注意事项

- Render 免费 Web Service 可能会休眠，老师首次打开时后端接口可能需要等待几十秒。
- 当前后端使用本地文件存储，服务重启后可能恢复到种子数据；课程演示足够，长期生产需要接数据库。
- Vercel 只部署前端，不能直接运行本项目的 Node/Java 后端。
