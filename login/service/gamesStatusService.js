import redisClient from '../storage/redisClient.js';

// Redis Key 前缀
const STATS_KEY_PREFIX = 'game:stats:';

/**
 * 获取游戏统计的 Redis Key
 * @param {string} fileId - 游戏 file_id
 * @returns {string} Redis Key
 */
function getStatsKey(fileId) {
  return `${STATS_KEY_PREFIX}${fileId}`;
}

/**
 * 初始化游戏统计数据
 * @param {string} fileId - 游戏 file_id
 * @param {Object} initialData - 初始数据（可选）
 * @returns {Promise<Object>} 初始化后的统计数据
 */
export async function initGameStats(fileId, initialData = {}) {
  const key = getStatsKey(fileId);
  
  const defaultStats = {
    likeCount: 0,
    pvCount: 0,
    uvCount: 0,
    conversionCount: 0,
    ...initialData
  };

  // 检查是否已存在，如果不存在则初始化
  const existing = await redisClient.hGetAll(key);
  if (Object.keys(existing).length === 0) {
    // Redis v4+ 使用 hSet 方法，传入对象可以设置多个字段
    await redisClient.hSet(key, defaultStats);
  }

  return await getGameStats(fileId);
}

/**
 * 获取游戏统计数据
 * @param {string} fileId - 游戏 file_id
 * @returns {Promise<Object>} 统计数据对象
 */
export async function getGameStats(fileId) {
  const key = getStatsKey(fileId);
  const stats = await redisClient.hGetAll(key);
  
  // 转换字符串值为数字类型
  if (Object.keys(stats).length === 0) {
    return null;
  }

  return {
    fileId,
    likeCount: parseInt(stats.likeCount || '0', 10),
    pvCount: parseInt(stats.pvCount || '0', 10),
    uvCount: parseInt(stats.uvCount || '0', 10),
    conversionCount: parseInt(stats.conversionCount || '0', 10)
  };
}

/**
 * 获取游戏统计数据（PV、Like）
 * @param {string} fileId - 游戏 file_id
 * @returns {Promise<{pv: number, likeCount: number}|null>} 游戏统计数据
 */
export async function getGameDataByFileId(fileId) {
  const stats = await getGameStats(fileId);
  if (!stats) {
    return null;
  }
  return {
    pv: stats.pvCount,
    likeCount: stats.likeCount
  };
}

/**
 * 获取点赞去重 Key
 * @param {string} fileId - 游戏 file_id
 * @returns {string} Redis Key
 */
function getLikeSetKey(fileId) {
  return `game:like:${fileId}`;
}

/**
 * 切换点赞状态（带去重逻辑，支持点赞/取消点赞）
 * 如果用户已点赞，则取消点赞（点赞数减1）
 * 如果用户未点赞，则点赞（点赞数加1）
 * @param {string} fileId - 游戏 file_id
 * @param {string} userId - 用户 ID，用于去重
 * @returns {Promise<{isLiked: boolean, likeCount: number}>} 当前点赞状态及当前点赞数量
 */
export async function incrementLikeCountWithDeduplication(fileId, userId) {
  if (!userId) {
    throw new Error('userId 参数是必需的，用于点赞去重');
  }

  const statsKey = getStatsKey(fileId);
  const likeSetKey = getLikeSetKey(fileId);
  
  // 检查该用户是否已点赞过
  const isMember = await redisClient.sIsMember(likeSetKey, userId);
  console.log("-------------------",isMember)
  
  if (isMember) {
    // 用户已点赞过，取消点赞：从 Set 中移除，点赞数减1
    await redisClient.sRem(likeSetKey, userId);
    
    // 减少点赞统计（确保不会变成负数）
    const currentCount = await redisClient.hGet(statsKey, 'likeCount');
    const newLikeCount = Math.max(0, parseInt(currentCount || '0', 10) - 1);
    await redisClient.hSet(statsKey, 'likeCount', newLikeCount);
    
    return {
      isLiked: false,
      likeCount: newLikeCount
    };
  }
  
  // 用户未点赞，进行点赞：添加到 Set 中并增加点赞计数
  await redisClient.sAdd(likeSetKey, userId);
  
  // 设置 Set 的过期时间为永久（点赞记录应该永久保存，除非游戏被删除）
  // 这里不设置过期时间，让 Set 永久保存
  
  // 增加点赞统计
  const newLikeCount = await redisClient.hIncrBy(statsKey, 'likeCount', 1);
  
  return {
    isLiked: true,
    likeCount: newLikeCount
  };
}

/**
 * 增加点赞数量（原子操作）
 * @param {string} fileId - 游戏 file_id
 * @param {number} increment - 增加的数量，默认为 1
 * @returns {Promise<number>} 增加后的点赞数量
 */
export async function incrementLikeCount(fileId, increment = 1) {
  const key = getStatsKey(fileId);
  const newValue = await redisClient.hIncrBy(key, 'likeCount', increment);
  return newValue;
}

/**
 * 增加 PV 统计（原子操作）
 * @param {string} fileId - 游戏 file_id
 * @param {number} increment - 增加的数量，默认为 1
 * @returns {Promise<number>} 增加后的 PV 数量
 */
export async function incrementPvCount(fileId, increment = 1) {
  const key = getStatsKey(fileId);
  const newValue = await redisClient.hIncrBy(key, 'pvCount', increment);
  return newValue;
}

/**
 * 获取 UV 去重 Key（按日期）
 * @param {string} fileId - 游戏 file_id
 * @param {string} date - 日期字符串，格式：YYYY-MM-DD，默认为今天
 * @returns {string} Redis Key
 */
function getUvSetKey(fileId, date = null) {
  if (!date) {
    const today = new Date();
    date = today.toISOString().split('T')[0]; // YYYY-MM-DD
  }
  return `game:uv:${fileId}:${date}`;
}

/**
 * 增加 UV 统计（带去重逻辑，固定使用 userId 去重）
 * @param {string} fileId - 游戏 file_id
 * @param {string} userId - 用户 ID，用于去重
 * @returns {Promise<{incremented: boolean, uvCount: number}>} 是否增加成功及当前 UV 数量
 */
export async function incrementUvCountWithDeduplication(fileId, userId) {
  if (!userId) {
    throw new Error('userId 参数是必需的，用于 UV 去重');
  }

  const statsKey = getStatsKey(fileId);
  const uvSetKey = getUvSetKey(fileId);
  
  // 检查该用户今天是否已访问过
  const isMember = await redisClient.sIsMember(uvSetKey, userId);
  
  if (isMember) {
    // 用户今天已访问过，不增加 UV
    const stats = await getGameStats(fileId);
    return {
      incremented: false,
      uvCount: stats ? stats.uvCount : 0
    };
  }
  
  // 用户今天首次访问，添加到 Set 中并增加 UV 计数
  // 使用事务或管道确保原子性（这里简化处理，先添加 Set，再增加计数）
  await redisClient.sAdd(uvSetKey, userId);
  
  // 设置 Set 的过期时间为 2 天（确保跨天时数据不会丢失）
  await redisClient.expire(uvSetKey, 2 * 24 * 60 * 60);
  
  // 增加 UV 统计
  const newUvCount = await redisClient.hIncrBy(statsKey, 'uvCount', 1);
  
  return {
    incremented: true,
    uvCount: newUvCount
  };
}

/**
 * 增加 UV 统计（原子操作，不去重）
 * @param {string} fileId - 游戏 file_id
 * @param {number} increment - 增加的数量，默认为 1
 * @returns {Promise<number>} 增加后的 UV 数量
 */
export async function incrementUvCount(fileId, increment = 1) {
  const key = getStatsKey(fileId);
  const newValue = await redisClient.hIncrBy(key, 'uvCount', increment);
  return newValue;
}

/**
 * 获取转化去重 Key
 * @param {string} fileId - 游戏 file_id
 * @returns {string} Redis Key
 */
function getConversionSetKey(fileId) {
  return `game:conversion:${fileId}`;
}

/**
 * 增加转化统计（带去重逻辑，固定使用 userId 去重）
 * @param {string} fileId - 游戏 file_id
 * @param {string} userId - 用户 ID，用于去重
 * @returns {Promise<{incremented: boolean, conversionCount: number}>} 是否增加成功及当前转化数量
 */
export async function incrementConversionCountWithDeduplication(fileId, userId) {
  if (!userId) {
    throw new Error('userId 参数是必需的，用于转化去重');
  }

  const statsKey = getStatsKey(fileId);
  const conversionSetKey = getConversionSetKey(fileId);
  
  // 检查该用户是否已转化过
  const isMember = await redisClient.sIsMember(conversionSetKey, userId);
  
  if (isMember) {
    // 用户已转化过，不增加转化数
    const stats = await getGameStats(fileId);
    return {
      incremented: false,
      conversionCount: stats ? stats.conversionCount : 0
    };
  }
  
  // 用户首次转化，添加到 Set 中并增加转化计数
  await redisClient.sAdd(conversionSetKey, userId);
  
  // 设置 Set 的过期时间为永久（转化记录应该永久保存，除非游戏被删除）
  // 这里不设置过期时间，让 Set 永久保存
  
  // 增加转化统计
  const newConversionCount = await redisClient.hIncrBy(statsKey, 'conversionCount', 1);
  
  return {
    incremented: true,
    conversionCount: newConversionCount
  };
}

/**
 * 增加转化统计（原子操作，不去重）
 * @param {string} fileId - 游戏 file_id
 * @param {number} increment - 增加的数量，默认为 1
 * @returns {Promise<number>} 增加后的转化数量
 */
export async function incrementConversionCount(fileId, increment = 1) {
  const key = getStatsKey(fileId);
  const newValue = await redisClient.hIncrBy(key, 'conversionCount', increment);
  return newValue;
}

/**
 * 从转化 Set 中删除用户 ID
 * @param {string} fileId - 游戏 file_id
 * @param {string} userId - 用户 ID
 * @returns {Promise<boolean>} 是否删除成功（如果用户不在 Set 中，返回 false）
 */
export async function removeUserIdFromConversionSet(fileId, userId) {
  if (!userId) {
    throw new Error('userId 参数是必需的');
  }

  const conversionSetKey = getConversionSetKey(fileId);
  
  // 从 Set 中删除 userId
  const result = await redisClient.sRem(conversionSetKey, userId);
  
  // sRem 返回删除的元素数量，如果返回 1 表示删除成功，0 表示元素不存在
  return result > 0;
}

/**
 * 批量更新游戏统计数据
 * @param {string} fileId - 游戏 file_id
 * @param {Object} updates - 要更新的字段对象
 * @returns {Promise<Object>} 更新后的统计数据
 */
export async function updateGameStats(fileId, updates) {
  const key = getStatsKey(fileId);
  
  // 过滤掉 undefined 和 null 的值
  const validUpdates = {};
  for (const [field, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null) {
      validUpdates[field] = value;
    }
  }

  if (Object.keys(validUpdates).length > 0) {
    // Redis v4+ 使用 hSet 方法，传入对象可以设置多个字段
    await redisClient.hSet(key, validUpdates);
  }

  return await getGameStats(fileId);
}

/**
 * 获取单个统计字段的值
 * @param {string} fileId - 游戏 file_id
 * @param {string} field - 字段名（likeCount, pvCount, uvCount, conversionCount）
 * @returns {Promise<number|null>} 字段值，如果不存在返回 null
 */
export async function getGameStatField(fileId, field) {
  const key = getStatsKey(fileId);
  const value = await redisClient.hGet(key, field);
  
  if (value === null) {
    return null;
  }
  
  // 转换字符串值为数字类型
  return parseInt(value, 10);
}

/**
 * 删除游戏统计数据
 * @param {string} fileId - 游戏 file_id
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteGameStats(fileId) {
  const key = getStatsKey(fileId);
  const result = await redisClient.del(key);
  return result > 0;
}

/**
 * 批量获取多个游戏的统计数据
 * @param {string[]} fileIds - 游戏 file_id 数组
 * @returns {Promise<Object>} 以 fileId 为 key 的统计数据对象
 */
export async function getMultipleGameStats(fileIds) {
  const results = {};
  
  // 并行获取所有游戏的统计数据
  const promises = fileIds.map(async (fileId) => {
    const stats = await getGameStats(fileId);
    if (stats) {
      results[fileId] = stats;
    }
  });
  
  await Promise.all(promises);
  return results;
}

export default {
  initGameStats,
  getGameStats,
  getGameDataByFileId,
  incrementLikeCount,
  incrementLikeCountWithDeduplication,
  incrementPvCount,
  incrementUvCount,
  incrementUvCountWithDeduplication,
  incrementConversionCount,
  incrementConversionCountWithDeduplication,
  updateGameStats,
  getGameStatField,
  deleteGameStats,
  getMultipleGameStats,
  removeUserIdFromConversionSet
};

