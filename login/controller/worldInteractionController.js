import { createGame, listAllGames, listGamesByUser, listGamesByIsPublicNoDiscount, listGamesByIsPublicWithDiscount, publishGameByFileId, deleteGameByFileId, getGameFilesByFileId, getGameByFileId, listFileIdsAndFilesByUser, getCreatorUserIdByFileId, createGameSession, getGameSessionByFiles, getGameSessionByUserAndFile, updateGameSessionEndTime, updateGameSessionStatusAndFiles, getUserIdBySessionId, getGameSessionBySessionId, deleteGameSessionsByFileId, deleteGameSessionBySessionId, getFileIdsFromSessionsByUser, getGamesByFileIds, listPublicGameCreatorIds, unpublishGameByFileId, getGameDataByFileId, updateGameCoverUrl } from '../service/gamesService.js';
import { downloadPrefixToLocal, uploadLocalFolderToMinio, uploadImage, uploadfileToMinio, uploadInitJsonFilesToMinio, uploadSessionJsonFilesToMinio, downloadObjectFileToLocal, uploadSessionJsonFileToMinio } from '../service/minioService.js';
import { minioClient, ensureBucketExists } from '../storage/minioClient.js';
import { updateUser, getUserById, getUserByUserId } from '../service/authService.js';
import { checkUserReaction } from '../service/gameLikeService.js';
import { checkUserAlreadyPurchased, getUserPaidFileIdsInPoints, createPointsPurchase, deletePointsPurchaseByUserAndFile } from '../service/pointsPurchasesService.js';
import { getPaymentStatusByUserIdAndFileId, getUserPaidFileIds, updateOrderToPaid } from '../service/gameOrdersService.js';
import { processDocumentFile } from '../../controllers/visualGameController.js';
import { processWorldInteractionDocumentFile } from '../../controllers/worldInteractionController.js';
import { downloadInitFilesAndReturnFiles } from './visualController.js';
import fs from 'fs';
import path from 'path';

// 解析文件
// 上传并处理世界交互游戏文档
export async function uploadAndProcessWorldInteractionDocument(req, res) {
    try {
        // 设置响应超时时间为 30 分钟（1800000ms），防止长时间处理导致连接断开
        // 文档解析可能需要较长时间，需要确保 HTTP 连接不会超时
        res.setTimeout(Number(process.env.HTTP_RESPONSE_TIMEOUT_MS || 1800000));

        const payload = req.body || {};
        // 仅处理文档，file_id 将优先取解析结果
        const userIdForPrefix = req.user?.userId;

        const user = await getUserByUserId(userIdForPrefix);
        const authorName = user?.phoneNumber || null;
        console.log("----------------------------userId", userIdForPrefix);
        if (!userIdForPrefix) {
            return res.status(400).json({ success: false, message: '缺少必填字段：creator_user_id' });
        }
        let derivedFileId = null;
        let docUrl = null;
        let parseResult = null;

        // doc,pdf的解析
        // 如果传了文档文件，调用解析函数
        try {
            // 使用 upload.single('document') 后，文件在 req.file 中
            let docFileForParse = req.file;
            // 兼容处理：如果没有 req.file，尝试从 req.files 数组中查找
            if (!docFileForParse && Array.isArray(req.files)) {
                docFileForParse = req.files.find(f => f.fieldname === 'document');
            }
            if (docFileForParse) {
                const fileBufferForParse = docFileForParse.buffer || fs.readFileSync(docFileForParse.path);
                const filenameForParse = docFileForParse.originalname || 'document.pdf';
                const mimetypeForParse = docFileForParse.mimetype || 'application/pdf';

                console.log('-------------------------开始上传世界交互游戏文档------------------------');
                console.log(`[文档解析] 文件名: ${filenameForParse}, 大小: ${fileBufferForParse.length} 字节`);

                // 设置超时时间为 25 分钟（1500000ms），文档解析可能需要较长时间
                const timeoutMs = Number(process.env.DOCUMENT_PARSE_TIMEOUT_MS || 1500000);
                console.log(`[文档解析] 超时设置: ${timeoutMs}ms (${timeoutMs / 60000} 分钟)`);

                // 直接调用函数处理文档
                parseResult = await processWorldInteractionDocumentFile(fileBufferForParse, {
                    originalname: filenameForParse,
                    mimetype: mimetypeForParse,
                    cleanupTempFile: true,
                    timeout: timeoutMs
                });

                console.log("========================parseResult", parseResult);

                if (parseResult && parseResult.fileId) {
                    derivedFileId = parseResult.fileId;
                    console.log('------------------文档解析结果的fileId-------------------', parseResult.fileId);
                } else {
                    console.warn('[文档解析] 文档处理成功，但未返回 fileId');
                }
            }
        } catch (error) {
            console.warn('[文档解析] 调用失败，忽略并继续:', error && error.message ? error.message : error);
            if (error && error.stack) console.warn('[文档解析] 错误堆栈:', error.stack);

            // 更精确的错误类型判断
            if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('超时')) {
                const timeoutMs = Number(process.env.DOCUMENT_PARSE_TIMEOUT_MS || 1500000);
                console.warn(`[文档解析] 处理超时，耗时超过 ${timeoutMs / 60000} 分钟`);
                console.warn('[文档解析] 建议：1. 增加超时时间 2. 优化文档内容 3. 减少文件大小');
            } else if (error.message?.includes('Invalid file') || error.message?.includes('No file')) {
                console.warn('[文档解析] 文件格式错误:', error.message);
            } else {
                console.warn('[文档解析] 其他错误:', error.message);
            }
        }

        // file_id 优先使用解析结果
        const fileId = derivedFileId;
        if (!fileId) {
            return res.status(400).json({ success: false, message: '缺少 file_id（请通过文档解析获取）' });
        }
        // 规范化前缀，去掉首尾斜杠
        const normalizedFileId = String(fileId).replace(/^\/+|\/+$/g, '');

        // doc,pdf的上传
        // 调用minioService中uploadfileToMinio函数
        try {
            // 从 form-data 中获取字段名为 'file' 的文档（pdf/docx）
            let docFile = req.file;
            if (!docFile && Array.isArray(req.files)) {
                docFile = req.files.find(f => f.fieldname === 'file');
            }
            if (docFile) {
                // 可选：快速校验类型，失败直接返回 400（底层也会校验）
                const lowerName = (docFile.originalname || '').toLowerCase();
                const isPdf = (docFile.mimetype === 'application/pdf') || lowerName.endsWith('.pdf');
                const isDocx = (docFile.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') || lowerName.endsWith('.docx');
                if (!isPdf && !isDocx) {
                    return res.status(400).json({ success: false, message: '文档文件仅支持 PDF 或 DOCX' });
                }
                // 上传到 MinIO（bucket 使用函数内部的固定配置，路径：<userId>/<fileId>/<random>.ext）
                const result = await uploadfileToMinio(docFile, normalizedFileId, String(userIdForPrefix));
                // docUrl = result && result.url ? result.url : null;
                docUrl = result && result.url ? result.url.replace(/^http(s)?:\/\/.+?:\d+\/(.+)$/, '$2') : null;
            }
        } catch (error) {
            console.error('[文档上传] 上传失败:', error);
            console.error('[文档上传] 错误堆栈:', error.stack);
            return res.status(500).json({ success: false, message: '文档上传失败: ' + error.message });
        }

        // 上传图片和初始化 JSON 文件到 MinIO
        try {
            try {
                // 检查目录是否存在
                const imageDirPath = `public/world_interaction/images/${normalizedFileId}`;
                const fullImagePath = path.join(process.cwd(), imageDirPath);

                if (fs.existsSync(fullImagePath) && fs.statSync(fullImagePath).isDirectory()) {
                    // 映射为内部需要的字段 fileId，并按给定格式提供 localRoot 与 bucketName
                    const uploadParams = {
                        localRoot: `public/world_interaction/images/${normalizedFileId}`,
                        fileId: normalizedFileId,
                        userId: String(userIdForPrefix),
                        bucketName: 'interactive-fiction-game-init',
                        deleteBeforeUpload: false
                    };
                    await uploadLocalFolderToMinio(uploadParams);
                } else {
                    console.log(`[图片上传到 MinIO] 路径 ${imageDirPath} 不存在，跳过图片上传`);
                }
            } catch (e) {
                console.warn('[图片上传到 MinIO] 跳过或失败:', e && e.message ? e.message : e);
            }
            try {
                // 上传初始化 JSON 文件到 MinIO
                // 世界交互游戏的初始化文件在 temp 目录下
                const worldInteractionTempPath = path.join(process.cwd(), 'public', 'world_interaction', 'temp', normalizedFileId);
                if (fs.existsSync(worldInteractionTempPath)) {
                    // 确保 bucket 存在
                    await ensureBucketExists('interactive-fiction-game-init'); 
                    // 手动上传世界交互游戏的 JSON 文件
                    const jsonFiles = ['worldSetting.json', 'npcSetting.json', 'sceneSetting.json', 'metadata.json'];
                    let uploaded = 0;
                    for (const fileName of jsonFiles) {
                        const filePath = path.join(worldInteractionTempPath, fileName);
                        if (fs.existsSync(filePath)) {
                            const objectKey = `${userIdForPrefix}/${normalizedFileId}/${fileName}`;
                            const buffer = fs.readFileSync(filePath);
                            await minioClient.putObject('interactive-fiction-game-init', objectKey, buffer, {
                                'Content-Type': 'application/json; charset=utf-8'
                            });
                            uploaded += 1;
                        }
                    }
                    console.log(`[初始化 JSON 上传到 MinIO] ======成功======= 上传了 ${uploaded} 个文件`);
                } else {
                    console.log(`[初始化 JSON] 路径 ${worldInteractionTempPath} 不存在，跳过上传`);
                }
            } catch (e) {
                console.warn('[初始化 JSON 上传到 MinIO] 跳过或失败:', e && e.message ? e.message : e);
            }
        } catch (e) {
            console.warn('[初始化文件上传到 MinIO] 跳过或失败:', e && e.message ? e.message : e);
        }

        // 创建游戏记录
        const finalPayload = {
            title: parseResult?.worldSetting?.title || '未命名游戏',
            subtitle: parseResult?.worldSetting?.title || '未命名游戏',
            description: parseResult?.worldSetting?.background || '',
            creator_user_id: userIdForPrefix,
            file_id: normalizedFileId,
            cover_url: null,
            doc_url: docUrl,
            version: 'map-plugin-version',
            files: `interactive-fiction-game-init/${userIdForPrefix}/${normalizedFileId}`,
            author_name: authorName
        };

        const row = await createGame(finalPayload);
        console.log('-------------------------数据库插入数据结果------------------------', row);

       // 更新用户的 fileIds 字段
        try {
            const user = await getUserByUserId(userIdForPrefix);
            if (user) {
                let fileIds = [];

                // 解析现有的 fileIds（如果存在）
                if (user.fileIds) {
                    try {
                        fileIds = JSON.parse(user.fileIds);
                        if (!Array.isArray(fileIds)) {
                            fileIds = [];
                        }
                    } catch (parseError) {
                        console.warn('解析用户 fileIds 失败，使用空数组:', parseError);
                        fileIds = [];
                    }
                }

                // 检查 fileId 是否已存在，避免重复添加
                if (!fileIds.includes(normalizedFileId)) {
                    fileIds.push(normalizedFileId);

                    // 更新用户的 fileIds 字段
                    await updateUser(user.userId, {
                        fileIds: JSON.stringify(fileIds)
                    });

                    console.log(`用户 ${userIdForPrefix} 的 fileIds 已更新:`, fileIds);
                } else {
                    console.log(`fileId ${normalizedFileId} 已存在于用户 ${userIdForPrefix} 的 fileIds 中`);
                }
            } else {
                console.warn(`未找到用户 ${userIdForPrefix}`);
            }
        } catch (updateError) {
            console.error('更新用户 fileIds 失败:', updateError);
            // 不影响游戏创建的成功响应，只记录错误
        }

        return res.json(parseResult);
    } catch (err) {
        console.error('worldInteractionController.uploadAndProcessWorldInteractionDocument error:', err);
        return res.status(500).json({ success: false, message: err.message || '创建失败' });
    }
}

// 创建会话session
export async function worldInteractionSessionCreate(req, res) {
    try {
        const { presetId, fileId } = req.body || {};
        const userId = req.user?.userId;
        console.log("============================session:userId", userId);
        console.log("============================session:fileId", fileId);
        if (!fileId) {
            return res.status(400).json({
                success: false,
                message: '缺少必填参数：fileId'
            });
        }
        const normalizedFileId = String(fileId).trim();
        const normalizedUserId = String(userId).trim();
        if (!normalizedFileId || !normalizedUserId) {
            return res.status(400).json({
                success: false,
                message: 'fileId 或 userId 不能为空字符串'
            });
        }
        // 如果games_saves路径下存在${filedId}的文件夹的话，就不再拉取初始化文件，直接看existingSession是否存在
        let initFilesPath = null;
        const gameSavesPath = `visual_saves/${normalizedFileId}`;
        const folderExists = fs.existsSync(gameSavesPath) && fs.statSync(gameSavesPath).isDirectory();

        if (!folderExists) {
            try {
                console.log("----------------------------拉取初始化文件-----------------------------")
                initFilesPath = await downloadInitFilesAndReturnFiles(normalizedFileId, 'visual_saves');
            } catch (error) {
                console.warn('[sessionCreate] 下载初始化文件失败，继续执行', error && error.message ? error.message : error);
            }
        } else {
            console.log(`[sessionCreate] visual_saves/${normalizedFileId} 文件夹已存在，跳过下载初始化文件`);
        }
        console.log("----------------------------normalizedUserId-----------------------------", normalizedUserId);
        console.log("----------------------------normalizedFileId-----------------------------", normalizedFileId);
        const existingSession = await getGameSessionByUserAndFile(normalizedUserId, normalizedFileId);
        console.log("----------------------------existingSession-----------------------------", existingSession);

        if (!existingSession) {
            const baseUrl = process.env.SELF_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            let backendSessionResp;
            console.log("========================${baseUrl}/api/world-interaction/session/create", `${baseUrl}/api/worldInteraction/session/create`);

            try {
                let response = await fetch(`${baseUrl}/api/world-interaction/session/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        presetId: normalizedFileId
                    }),
                    signal: AbortSignal.timeout(Number(process.env.SESSION_CREATE_TIMEOUT_MS || 120000))
                });

                if (!response.ok) {
                    const message = await response.text().catch(() => '');
                    throw new Error(`后端会话创建接口返回异常状态 ${response.status}: ${message}`);
                }

                backendSessionResp = await response.json();
            } catch (error) {
                console.error('[sessionCreate] 调用后端会话创建接口失败', error);
                return res.status(502).json({
                    success: false,
                    message: '调用后端会话创建接口失败',
                    error: error.message || error
                });
            }
            console.log("============================backendSessionResp", backendSessionResp);
            if (!backendSessionResp || backendSessionResp.success !== true || !backendSessionResp.session.sessionId) {
                return res.status(500).json({
                    success: false,
                    message: '会话创建接口返回的数据不完整',
                    data: backendSessionResp || null
                });
            }
            console.log("--------------------------------", backendSessionResp.session.sessionId);
            //对于数据库games_session,插入一条数据插入字段为fileId,sessionId,userId,startedAt,endedAt
            let sessionRecord = null;
            try {
                // 确定 files 字段的值
                const filesValue = initFilesPath || `visual_saves/${normalizedFileId}`;

                sessionRecord = await createGameSession({
                    sessionId: backendSessionResp.session.sessionId,
                    userId: normalizedUserId,
                    fileId: normalizedFileId,
                    status: 'active',
                    files: filesValue,
                    startedAt: new Date(),
                    endedAt: null
                });
                console.log('[sessionCreate] 数据库会话记录创建成功:', sessionRecord.id);
            } catch (error) {
                console.error('[sessionCreate] 写入 game_sessions 表失败', error);
                // 如果是因为重复键错误（并发情况），尝试查询现有记录
                if (error.code === 'ER_DUP_ENTRY' && error.errno === 1062) {
                    try {
                        sessionRecord = await getGameSessionBySessionId(backendSessionResp.session.sessionId);
                        console.log('[sessionCreate] 会话记录已存在，使用现有记录');
                    } catch (queryError) {
                        console.error('[sessionCreate] 查询现有会话记录失败', queryError);
                    }
                }
                // 即使数据库插入失败，也继续返回响应（因为后端会话已创建成功）
            }
            // 第二个操作：完成会话（只有在数据库记录创建成功后才执行）
            if (sessionRecord) {
                try {
                    await completeGameSessionByParams(backendSessionResp.session.sessionId, 'public/world_interaction/sessions', normalizedFileId);
                    console.log('[sessionCreate] 会话存储完成操作成功');
                } catch (error) {
                    console.error('[sessionCreate] 完成会话存储操作失败', error);
                }
            }

            console.log("----------------------------会话创建结束-----------------------------")
            return res.json({
                success: true,
                message: '会话创建成功',
                data: {
                    session: sessionRecord || {
                        session_id: backendSessionResp.session.sessionId
                    },
                    initFilesPath,
                    sessionDataSync: null
                }
            });
        } else {
            console.log("--------------------------------不是第一次游戏会话---------------------------")
            // 检查拉取后的文件夹是否有 avatars 文件夹(是否是无图模式)，如果没有则删除整个文件夹（无图模式的逻辑增加）
            // const npcsPath = path.join(gameSavesPath, 'npcs');
            // const scenesPath = path.join(gameSavesPath, 'scenes');
            // const avatarExists = fs.existsSync(npcsPath) && fs.statSync(npcsPath).isDirectory();
            // const iconExists = fs.existsSync(scenesPath) && fs.statSync(scenesPath).isDirectory();
            // console.log("==============================iconExists", iconExists);
            // console.log("==========================avatarExists", avatarExists);
            // if (!avatarExists && !iconExists) {
            //     console.log(`[sessionCreate] visual_saves/${normalizedFileId} 文件夹下没有图片文件夹，删除该文件夹`);
            //     fs.rmSync(gameSavesPath, { recursive: true, force: true });
            // }

            // 安全检查：确保 existingSession 存在且有 session_id
            if (!existingSession || !existingSession.session_id) {
                console.error('[sessionCreate] existingSession 不存在或缺少 session_id');
                return res.status(500).json({
                    success: false,
                    message: '会话数据不完整'
                });
            }

            // 如果public/game_data路径下存在${session_id}的文件夹的话，就不再做下载步骤，直接return即可
            const sessionDataPath = `public/world_interaction/sessions/${existingSession.session_id}`;
            const sessionDataFolderExists = fs.existsSync(sessionDataPath) && fs.statSync(sessionDataPath).isDirectory;

            if (sessionDataFolderExists) {
                console.log(`[sessionCreate] public/world_interaction/sessions/${existingSession.session_id} 文件夹已存在，跳过下载步骤`);
                return res.json({
                    success: true,
                    message: '会话已存在，返回现有会话信息了',
                    data: {
                        session: existingSession,
                        initFilesPath,
                        sessionDataSync: null
                    }
                });
            }

            let sessionDataSync = null;
            try {
                console.log("--------------------------------进入minio拉取历史存档---------------------")
                sessionDataSync = await uploadGameSessionDataBySessionId(existingSession.session_id, 'public/world_interaction/sessions');
            } catch (error) {
                console.warn('[sessionCreate] 拉取已存在会话的游戏数据失败', error && error.message ? error.message : error);
            }
            // // 复制预设游戏的images同步 images 资源目录
            // try {
            //     copyGameImagesToSession(normalizedFileId, existingSession.session_id);
            // } catch (error) {
            //     console.warn('[sessionCreate] 同步 images 目录失败', error && error.message ? error.message : error);
            // }
            return res.json({
                success: true,
                message: '会话已存在，返回现有会话信息',
                data: {
                    session: existingSession,
                    initFilesPath,
                    sessionDataSync
                }
            });
        }
    } catch (error) {
        console.error('gamesController.sessionCreate error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || '创建会话失败'
        });
    }
}

// ==================
// 通用函数
// ==================
// 游戏会话存储，上传数据并写入/更新 （本地的上传路径为local_path）
export async function completeGameSessionByParams(session_id, local_path, file_id) {
    // 先通过 session_id 查询是否存在记录（session_id 是唯一键）
    const existingSession = await getGameSessionBySessionId(session_id);

    // 通过 session_id 获取 user_id（如果 existingSession 存在，则从 existingSession 中获取）
    const user_id = existingSession ? existingSession.user_id : null;

    if (!user_id) {
        throw new Error('未找到对应的用户（根据 session_id）');
    }

    // 本地上传源路径：<local_path>/<session_id>（目录路径，不是文件路径）
    const localRoot = (local_path && String(local_path).trim()) ? String(local_path).trim() : 'public/world_interaction/sessions';
    const resolvedLocalPath = `${localRoot}/${session_id}`;

    // MinIO prefix 使用 user_id/session_id 拼接
    const minioPrefix = `${user_id}/${session_id}`;
    const filesValue = `interactive-fiction-game-data / ${minioPrefix}`;

    // 只上传四个 JSON 文件（不上传 images 文件夹）
    // 如果存在相同 session_id 的记录，先删除 MinIO 中对应路径下的所有文件，再上传（确保完全同步）
    // 本地路径使用 resolvedLocalPath，prefix：user_id/session_id
    try {
        const shouldDeleteBeforeUpload = !!existingSession; // 如果存在相同记录，先删除再上传
        await uploadSessionJsonFilesToMinio({
            userId: String(user_id),
            sessionId: session_id,
            localDir: resolvedLocalPath,
            bucketName: 'interactive-fiction-game-data',
            deleteBeforeUpload: shouldDeleteBeforeUpload
        });
        console.log("======================游戏初始会话存储成功=================");
    } catch (e) {
        console.error('uploadSessionJsonFilesToMinio error:', e);
        throw new Error('MinIO 上传失败: ' + (e && e.message ? e.message : String(e)));
    }

    if (existingSession) {
        // 如果存在相同的 session_id，更新 status、files 和 ended_at 字段
        return await updateGameSessionStatusAndFiles(existingSession.id, 'completed', filesValue, new Date());
    }

    // 创建新的 game_session 记录
    try {
        return await createGameSession({
            sessionId: session_id,
            userId: Number(user_id),
            fileId: file_id,
            status: 'completed',
            files: filesValue,
            startedAt: new Date(),
            endedAt: null
        });
    } catch (err) {
        // 如果插入时仍然遇到重复键错误（并发情况），则查询并更新
        if (err.code === 'ER_DUP_ENTRY' && err.errno === 1062) {
            const session = await getGameSessionBySessionId(session_id);
            if (session) {
                return await updateGameSessionEndTime(session.id, new Date());
            }
        }
        throw err;
    }
}


// 根据 sessionId 从 MinIO 下载文件夹到本地（存储桶：interactive-fiction-game-data，路径：userId/sessionId）（ZZ）
export async function uploadGameSessionDataBySessionId(sessionId, localRoot) {
    if (!sessionId) {
        throw new Error('缺少必填参数：sessionId');
    }

    // 通过 sessionId 查询 userId
    const userId = await getUserIdBySessionId(sessionId);
    if (!userId) {
        throw new Error('未找到对应的用户（根据 sessionId）');
    }

    // MinIO prefix 使用 userId/sessionId 拼接
    const minioPrefix = `${userId}/${sessionId}`;

    // 本地下载目标路径：如果 localRoot 为空则使用默认路径
    const destRoot = (localRoot && String(localRoot).trim()) ? String(localRoot).trim() : `game_saves/${sessionId}`;

    // 从 MinIO 下载到本地
    await downloadPrefixToLocal('interactive-fiction-game-data', minioPrefix, destRoot, {
        stripPrefixSegments: 1
    });
    console.log("======================游戏初始会话下载成功=================");

    return { success: true, bucket: 'interactive-fiction-game-data', prefix: minioPrefix, destRoot };
}


