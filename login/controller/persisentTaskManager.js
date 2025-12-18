// persistentTaskManager.js
import fs from 'fs/promises';
import path from 'path';
import co from 'co';
import { v4 as uuidv4 } from 'uuid';

class PersistentTaskManager {
    constructor() {
        this.tasks = new Map();
        this.storagePath = path.join(process.cwd(), 'task_storage');
        this.initStorage();
        this.loadTasksFromStorage();
    }

    // 初始化存储目录
    async initStorage() {
        try {
            await fs.mkdir(this.storagePath, { recursive: true });
            console.log(`[任务存储] 存储目录已创建: ${this.storagePath}`);
        } catch (error) {
            console.error('[任务存储] 创建目录失败:', error);
        }
    }

    // 从文件系统加载任务
    async loadTasksFromStorage() {
        try {
            const files = await fs.readdir(this.storagePath);

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(this.storagePath, file);
                        const data = await fs.readFile(filePath, 'utf8');
                        const task = JSON.parse(data);

                        // 只加载未完成的任务（24小时内）
                        const isExpired = Date.now() - task.updatedAt > 24 * 60 * 60 * 1000;
                        const isCompleted = task.state === 'completed' || task.state === 'failed';

                        if (!isExpired && !isCompleted) {
                            this.tasks.set(task.taskId, task);
                            console.log(`[任务存储] 加载任务: ${task.taskId} (${task.progress}%)`);
                        } else {
                            // 删除过期或已完成的任务文件
                            await fs.unlink(filePath);
                        }
                    } catch (error) {
                        console.error(`[任务存储] 加载任务文件 ${file} 失败:`, error);
                    }
                }
            }

            console.log(`[任务存储] 已加载 ${this.tasks.size} 个未完成任务`);

        } catch (error) {
            console.error('[任务存储] 加载任务失败:', error);
        }
    }

    // 获取任务文件路径
    getTaskFilePath(taskId) {
        return path.join(this.storagePath, `${taskId}.json`);
    }

    // 保存任务到文件系统
    async saveTaskToFile(task) {
        try {
            const filePath = this.getTaskFilePath(task.taskId);
            await fs.writeFile(
                filePath,
                JSON.stringify(task, null, 2),
                'utf8'
            );

            // 更新内存中的任务
            this.tasks.set(task.taskId, task);

        } catch (error) {
            console.error(`[任务存储] 保存任务 ${task.taskId} 失败:`, error);
        }
    }

    // 创建新任务
    async createTask(taskId, userId, fileBuffer, options) {
        const task = {
            taskId,
            userId,
            state: 'pending',
            progress: 0,
            message: '等待开始',
            fileId: null,
            result: null,
            error: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            options: options,
            // 文件数据单独存储（如果文件不大）
            fileData: fileBuffer ? fileBuffer.toString('base64') : null,
            fileSize: fileBuffer ? fileBuffer.length : 0
        };

        await this.saveTaskToFile(task);
        console.log(`[任务存储] 创建任务: ${taskId}`);

        return task;
    }

    // 更新任务进度
    async updateProgress(taskId, progress, message, data = {}) {
        let task = this.tasks.get(taskId);

        if (!task) {
            // 尝试从文件系统加载
            task = await this.loadTaskFromFile(taskId);
        }

        if (!task) {
            console.error(`[任务存储] 更新失败，任务不存在: ${taskId}`);
            return null;
        }

        // 更新任务信息
        task.progress = progress;
        task.message = message;
        task.updatedAt = Date.now();

        if (progress >= 100) {
            task.state = 'completed';
        } else if (task.state === 'pending') {
            task.state = 'processing';
        }

        // 合并额外数据
        Object.assign(task, data);

        // 保存到文件
        await this.saveTaskToFile(task);

        console.log(`[任务 ${taskId}] ${progress}% - ${message}`);
        return task;
    }

    // 从文件系统加载单个任务
    async loadTaskFromFile(taskId) {
        try {
            const filePath = this.getTaskFilePath(taskId);
            const data = await fs.readFile(filePath, 'utf8');
            const task = JSON.parse(data);

            this.tasks.set(taskId, task);
            return task;

        } catch (error) {
            return null;
        }
    }

    // 获取任务状态
    async getTask(taskId) {
        let task = this.tasks.get(taskId);

        if (!task) {
            task = await this.loadTaskFromFile(taskId);
        }

        if (!task) return null;

        // 检查是否过期（24小时）
        if (Date.now() - task.updatedAt > 24 * 60 * 60 * 1000) {
            await this.deleteTask(taskId);
            return null;
        }

        return task;
    }

    // 完成任务
    async completeTask(taskId, result) {
        const task = await this.getTask(taskId);
        if (!task) return null;

        task.progress = 100;
        task.state = 'completed';
        task.result = result;
        task.message = '任务完成';
        task.updatedAt = Date.now();

        // 清理文件数据（节省空间）
        if (task.fileData) {
            delete task.fileData;
        }

        await this.saveTaskToFile(task);
        console.log(`[任务存储] 完成任务: ${taskId}`);

        // 24小时后删除文件
        setTimeout(async () => {
            await this.deleteTask(taskId);
        }, 24 * 60 * 60 * 1000);

        return task;
    }

    // 标记任务失败
    async failTask(taskId, error) {
        const task = await this.getTask(taskId);
        if (!task) return null;

        task.state = 'failed';
        task.error = error.message || error;
        task.message = '任务失败';
        task.updatedAt = Date.now();

        await this.saveTaskToFile(task);
        console.log(`[任务存储] 任务失败: ${taskId} - ${task.error}`);

        // 2小时后删除文件
        setTimeout(async () => {
            await this.deleteTask(taskId);
        }, 2 * 60 * 60 * 1000);

        return task;
    }

    // 删除任务
    async deleteTask(taskId) {
        try {
            this.tasks.delete(taskId);

            const filePath = this.getTaskFilePath(taskId);
            await fs.unlink(filePath);

            console.log(`[任务存储] 删除任务: ${taskId}`);
            return true;

        } catch (error) {
            console.error(`[任务存储] 删除任务失败 ${taskId}:`, error);
            return false;
        }
    }

    // 获取用户的所有任务
    async getUserTasks(userId) {
        const userTasks = [];

        try {
            // 从内存中查找
            for (const [taskId, task] of this.tasks) {
                if (task.userId === userId) {
                    userTasks.push(task);
                }
            }

            // 如果内存中没有，扫描文件系统
            if (userTasks.length === 0) {
                const files = await fs.readdir(this.storagePath);

                for (const file of files) {
                    if (file.endsWith('.json')) {
                        try {
                            const filePath = path.join(this.storagePath, file);
                            const data = await fs.readFile(filePath, 'utf8');
                            const task = JSON.parse(data);

                            if (task.userId === userId &&
                                Date.now() - task.updatedAt <= 24 * 60 * 60 * 1000) {
                                userTasks.push(task);
                            }
                        } catch (error) {
                            // 忽略损坏的文件
                        }
                    }
                }
            }

            // 按创建时间排序
            return userTasks.sort((a, b) => b.createdAt - a.createdAt);

        } catch (error) {
            console.error('[任务存储] 获取用户任务失败:', error);
            return [];
        }
    }

    // 恢复文件数据
    async restoreFileData(task) {
        if (task.fileData) {
            return Buffer.from(task.fileData, 'base64');
        }
        return null;
    }

    // 定期清理
    async cleanup() {
        try {
            const files = await fs.readdir(this.storagePath);
            const now = Date.now();
            let deletedCount = 0;

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(this.storagePath, file);
                        const stats = await fs.stat(filePath);

                        // 删除超过48小时的文件
                        if (now - stats.mtimeMs > 48 * 60 * 60 * 1000) {
                            await fs.unlink(filePath);
                            deletedCount++;

                            // 从内存中移除
                            const taskId = file.replace('.json', '');
                            this.tasks.delete(taskId);
                        }
                    } catch (error) {
                        // 忽略错误
                    }
                }
            }

            if (deletedCount > 0) {
                console.log(`[任务存储] 清理了 ${deletedCount} 个过期任务文件`);
            }

        } catch (error) {
            console.error('[任务存储] 清理失败:', error);
        }
    }
}

// 创建全局实例并启动清理定时器
const taskManager = new PersistentTaskManager();

// 每小时清理一次过期任务
setInterval(() => taskManager.cleanup(), 60 * 60 * 1000);

// 进程退出时保存状态
process.on('SIGINT', async () => {
    console.log('[任务存储] 进程退出，保存任务状态...');
    // 这里可以添加额外的清理逻辑
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('[任务存储] 进程终止，保存任务状态...');
    process.exit(0);
});

export default taskManager;