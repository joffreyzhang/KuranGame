FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 只复制 package 文件（利用 Docker 缓存层）
COPY package*.json ./

# 安装依赖（这部分会被缓存，只有 package.json 变化时才重新安装）
RUN npm ci --only=production

# 注意：不复制代码，代码通过 volume 挂载，这样代码修改可以实时生效

# 暴露端口
EXPOSE 3002

# 启动命令（代码从 volume 挂载，所以直接运行）
CMD ["node", "server.js"]

