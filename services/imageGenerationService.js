import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config();
// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL
});

const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');
const IMAGES_DIR = path.join(GAME_DATA_DIR, 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

const IMAGE_SUBDIRS = ['avatars', 'scenes', 'icons'];

IMAGE_SUBDIRS.forEach(subdir => {
  const subdirPath = path.join(IMAGES_DIR, subdir);
  if (!fs.existsSync(subdirPath)) {
    fs.mkdirSync(subdirPath, { recursive: true });
  }
});

function extractLoreContext(fileId) {
  try {
    const lorePath = path.join(GAME_DATA_DIR, `lore_${fileId}.json`);
    if (!fs.existsSync(lorePath)) {
      console.warn(`Lore file not found: ${lorePath}`);
      return getDefaultContext();
    }

    const loreData = JSON.parse(fs.readFileSync(lorePath, 'utf-8'));

    // Extract key information for prompt generation
    const context = {
      era: '',
      location: '',
      culture: '',
      timePeriod: '',
      keyElements: []
    };

    // Extract from worldBackground
    if (loreData.worldBackground?.title) {
      context.era = loreData.worldBackground.title;
    }
    if (loreData.worldBackground?.content && Array.isArray(loreData.worldBackground.content)) {
      loreData.worldBackground.content.forEach(item => {
        // Extract era/time period
        if (item.includes('时间设定') || item.includes('年') || item.includes('朝') || item.includes('代')) {
          context.timePeriod = item.replace(/.*[:：]/, '').trim();
        }
        // Extract location
        if (item.includes('地点') || item.includes('地区') || item.includes('地方')) {
          context.location = item.replace(/.*[:：]/, '').trim();
        }
        // Extract cultural elements
        if (item.includes('文化') || item.includes('风俗') || item.includes('信仰') || item.includes('制度')) {
          context.culture = item.replace(/.*[:：]/, '').trim();
        }
        context.keyElements.push(item);
      });
    }

    // Extract from gameTime
    if (loreData.gameTime?.yearName) {
      context.era = context.era || loreData.gameTime.yearName;
    }
    if (loreData.gameTime?.currentYear) {
      context.timePeriod = context.timePeriod || `${loreData.gameTime.currentYear}年`;
    }

    // Extract from keyEvents
    if (loreData.keyEvents && Array.isArray(loreData.keyEvents)) {
      loreData.keyEvents.forEach(event => {
        if (event.year) {
          context.timePeriod = context.timePeriod || event.year;
        }
        context.keyElements.push(`${event.title}: ${event.description}`);
      });
    }

    return context;
  } catch (error) {
    console.error('Error extracting lore context:', error);
    return getDefaultContext();
  }
}

function generateContextualPrompt(loreContext, elementType, element) {
  const { era, location, culture, timePeriod, keyElements } = loreContext;

  let basePrompt = '';

  // Build context string
  let contextStr = '';
  if (era && era !== '历史时期') {
    contextStr += ` in ${era}`;
  }
  if (timePeriod) {
    contextStr += ` during ${timePeriod}`;
  }
  if (location) {
    contextStr += ` in ${location}`;
  }

  // Add cultural context
  let culturalContext = '';
  if (culture) {
    culturalContext = `, ${culture}`;
  }

  switch (elementType) {
    case 'npc':
      basePrompt = `A detailed portrait of ${element.name}, a ${element.age}-year-old ${element.gender} ${element.job}${contextStr}. ${element.description}${culturalContext}. `;
      if (keyElements.length > 0) {
        basePrompt += `Historical context: ${keyElements.slice(0, 2).join(', ')}. `;
      }
      basePrompt += 'based on the historical context to set the art style, portrait style, detailed facial features. High quality, DO NOT INCLUDE ANY TEXT IN THE IMAGE.';
      break;

    case 'scene':
      basePrompt = `A detailed landscape painting of ${element.name}${contextStr}. ${element.description}${culturalContext}. `;
      if (keyElements.length > 0) {
        basePrompt += `Historical setting: ${keyElements.slice(0, 2).join(', ')}. `;
      }
      basePrompt += 'The architecture and scenery should be based on the historical context,  wide angle view, atmospheric lighting, beautiful composition. The art style should be based on the background context, high quality, cinematic.';
      break;

    case 'building':
      basePrompt = `An indoor scene image of ${element.name}${contextStr}. ${element.description}. `;
      if (element.type) {
        basePrompt += `Type: ${element.type}. `;
      }
      basePrompt += `The items in the building should be related and detailed, architectural style${culturalContext}, warm colors. Digital art.`;
      break;

    default:
      basePrompt = `${element.name}: ${element.description}. The potrait of NPC should be extraggled according to their job and current era. The facial feature should be distinctive. bHistorical context, the art style should be based on context, high quality.`;
  }

  return basePrompt;
}

async function downloadImage(url, filepath, zipsize) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const tempFilepath = filepath + '.temp';
    const file = fs.createWriteStream(tempFilepath);

    protocol.get(url, (response) => {
      response.pipe(file);
      
      file.on('finish', async () => {
        try {
          // 关键：确保文件流完全关闭
          await new Promise(resolve => file.close(resolve));
          
          // 处理图片
          await sharp(tempFilepath)
            .resize(zipsize)
            .toFile(filepath);

          // 关键：等待一下确保Sharp释放句柄
          await new Promise(resolve => setTimeout(resolve, 200));

          // 使用增强的删除函数
          const isDeleted = await deleteTempFileWithRetry(tempFilepath, 5, 150);

          if (isDeleted) {
            console.log(`🗑️ 临时文件已删除: ${path.basename(tempFilepath)}`);
          } else {
            console.warn(`⚠️ 临时文件删除失败，但继续流程: ${path.basename(tempFilepath)}`);
          }

          resolve(filepath);

        } catch (err) {
          console.error(`❌ 处理失败:`, err.message);
          // 清理临时文件
          safeDeleteWithRetry(tempFilepath).catch(() => {});
          safeDeleteWithRetry(filepath).catch(() => {});
          reject(err);
        }
      });
      
    }).on('error', (err) => {
      console.error(`❌ 下载失败:`, err.message);
      safeDeleteWithRetry(tempFilepath).catch(() => {});
      reject(err);
    });
  });
}

export async function generateImage(prompt, size, quality = 'standard', maxRetries = 2, timeout = 30000) {
  const attemptGeneration = async (attemptNumber) => {
    console.log(`🎨 Generating image (Attempt ${attemptNumber}/${maxRetries + 1}): ${prompt.substring(0, 100)}...`);
    const startTime = Date.now();

    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Image generation timeout after ${timeout}ms`));
        }, timeout);
      });

      // Create the actual API call promise
      const generationPromise = openai.images.generate({
        model: 'gemini-3-pro-image-preview',
        prompt: prompt,
        n: 1,
        size: size,
        quality: quality,
      });

      // Race between timeout and actual generation
      const response = await Promise.race([generationPromise, timeoutPromise]);

      const elapsedTime = Date.now() - startTime;
      console.log(`✅ Image generated successfully in ${elapsedTime}ms`);

      // Validate response structure
      if (!response || !response.data || !Array.isArray(response.data) || response.data.length === 0) {
        console.error('Invalid API response:', JSON.stringify(response, null, 2));
        throw new Error('OpenAI API returned invalid response structure');
      }

      return response.data[0].url;
    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      if (error.message.includes('timeout')) {
        console.warn(`⏱️ Image generation timed out after ${elapsedTime}ms`);
      } else {
        console.error(`❌ Error generating image (attempt ${attemptNumber}):`, error.message);
        if (error.response) {
          console.error('API Error Response:', error.response.status, error.response.data);
        }
      }

      // If we have retries left, retry
      if (attemptNumber < maxRetries + 1) {
        console.log(`🔄 Retrying image generation... (${attemptNumber}/${maxRetries + 1})`);
        return attemptGeneration(attemptNumber + 1);
      }
      throw error;
    }
  };
  return attemptGeneration(1);
}


export async function generateNPCImage(npc, fileId) {
  try {

    const loreContext = extractLoreContext(fileId);
    const prompt = generateContextualPrompt(loreContext, 'npc', npc);

    console.log(`Generating image for NPC: ${npc.name}`);
    console.log(`Using context: ${loreContext.era} (${loreContext.timePeriod})`);
    const imageUrl = await generateImage(prompt, '1024x1024', 'standard');

    // Create fileId-specific directory structure
    const fileIdDir = path.join(IMAGES_DIR, fileId, 'avatars');
    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = `${npc.id}.png`;
    const filepath = path.join(fileIdDir, filename);
    await downloadImage(imageUrl, filepath, 300);

    return `/api/backend/images/${fileId}/serve/avatars/${filename}`;
  } catch (error) {
    console.error(`Error generating image for NPC ${npc.name}:`, error);
    throw error;
  }
}

export async function generateSceneImage(scene, fileId) {
  try {

    const loreContext = extractLoreContext(fileId);
    const prompt = generateContextualPrompt(loreContext, 'scene', scene);

    console.log(`Generating image for scene: ${scene.name}`);
    const imageUrl = await generateImage(prompt, '1792x1024', 'standard');

    // Create fileId-specific directory structure
    const fileIdDir = path.join(IMAGES_DIR, fileId, 'scenes');
    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = `${scene.id}.png`;
    const filepath = path.join(fileIdDir, filename);
    await downloadImage(imageUrl, filepath, 1000);

    return `/api/backend/images/${fileId}/serve/scenes/${filename}`;
  } catch (error) {
    console.error(`Error generating image for scene ${scene.name}:`, error);
    throw error;
  }
}

export async function generateBuilding(building, fileId) {
  try {

    const loreContext = extractLoreContext(fileId);
    const prompt = generateContextualPrompt(loreContext, 'building', building);

    console.log(`Generating for building: ${building.name}`);
    console.log(`Using context: ${loreContext.era} (${loreContext.timePeriod})`);
    const imageUrl = await generateImage(prompt, '1792x1024', 'standard');

    // Create fileId-specific directory structure
    const fileIdDir = path.join(IMAGES_DIR, fileId, 'icons');
    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = `${building.id}.png`;
    const filepath = path.join(fileIdDir, filename);
    await downloadImage(imageUrl, filepath, 300);

    return `/api/backend/images/${fileId}/serve/icons/${filename}`;
  } catch (error) {
    console.error(`Error generating icon for building ${building.name}:`, error);
    throw error;
  }
}

export async function generateWorldImage(fileId, sceneData) {
  try {
    const loreContext = extractLoreContext(fileId);

    const prompt = `Based on this history context: ${JSON.stringify(loreContext)} and pre-defined scene data: ${JSON.stringify(sceneData)}. Please generate a high-quality, detailed bird's-eye view image of the entire game world(including main scenes and several buildings in context.)`;

    console.log('Generating the world scenery.....');
    const imageUrl = await generateImage(prompt, '1792x1024', 'standard');

    // Create fileId-specific directory structure
    const fileIdDir = path.join(IMAGES_DIR, fileId);
    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = `world_${fileId}.png`;
    const filepath = path.join(fileIdDir, filename);
    await downloadImage(imageUrl, filepath, 500);

    return `/api/backend/images/${fileId}/world`;

  } catch (error) {
    console.error(`Error generating image for world image:`, error);
    throw error;
  }
}

export async function generateUserImage(fileId, playerData) {
  try {
    const loreContext = extractLoreContext(fileId);
    const prompt = `This is an image generator to generate user portrait in RPG games. Please generate a high-quality portrait with detailed facial features and clothing. Based on this history context: ${loreContext.era} ${loreContext.location} and player character data: ${playerData.profile.name}, ${playerData.profile.gender}, ${playerData.profile.age}.`;
    console.log(prompt);
    console.log('Generating the player portrait.....');
    const imageUrl = await generateImage(prompt, '1024x1024', 'standard');

    // Create fileId-specific directory structure
    const fileIdDir = path.join(IMAGES_DIR, fileId);
    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = `player_${fileId}.png`;
    const filepath = path.join(fileIdDir, filename);
    await downloadImage(imageUrl, filepath, 500);

    return `/api/backend/images/${fileId}/player`;

  } catch (error) {
    console.error(`Error generating image for portrait image:`, error);
    throw error;
  }
}

export async function generateAllGameImages(fileId, options = {}) {
  const {
    generateNPCs = true,
    generateScenes = true,
    generateBuildings = true,
    generateWorld = true,
    generateUser = true,
    updateJSON = true
  } = options;

  const results = {
    npcs: [],
    scenes: [],
    buildings: [],
    world: null,
    user: null,
    errors: []
  };

  try {
    // Load scenes JSON
    const scenesPath = path.join(GAME_DATA_DIR, `scenes_${fileId}.json`);
    const playerPath = path.join(GAME_DATA_DIR, `player_${fileId}.json`);
    const playerData = JSON.parse(fs.readFileSync(playerPath, 'utf-8'));
    const scenesData = JSON.parse(fs.readFileSync(scenesPath, 'utf-8'));
    const updatedScenesData = { ...scenesData };

    // Generate world image if requested
    if (generateWorld) {
      try {
        console.log('Generating world image...');
        const worldImage = await generateWorldImage(fileId, scenesData);
        results.world = { imagePath: worldImage, success: true };
      } catch (error) {
        console.error('Error generating world image:', error);
        results.errors.push({ type: 'world', error: error.message });
        results.world = { success: false };
      }
    }

    // Generate user/player image if requested
    if (generateUser) {
      try {
        console.log('Generating user/player image...');
        const userImage = await generateUserImage(fileId, playerData);
        results.user = { imagePath: userImage, success: true };
      } catch (error) {
        console.error('Error generating user image:', error);
        results.errors.push({ type: 'user', error: error.message });
        results.user = { success: false };
      }
    }

    if (generateScenes) {
      console.log(`Starting parallel generation of ${Object.keys(scenesData).length} scenes...`);
      const sceneTasks = Object.entries(scenesData).map(async ([sceneId, scene]) => {
        try {
          const imagePath = await generateSceneImage(scene, fileId);
          updatedScenesData[sceneId].background = imagePath;
          return { id: sceneId, name: scene.name, imagePath, success: true };
        } catch (error) {
          results.errors.push({ type: 'scene', id: sceneId, name: scene.name, error: error.message });
          return { id: sceneId, name: scene.name, success: false };
        }
      });
      results.scenes = await Promise.all(sceneTasks);
    }
    // Generate NPC images in parallel
    if (generateNPCs) {
      console.log('Starting parallel generation of NPCs...');
      const npcTasks = [];

      for (const [sceneId, scene] of Object.entries(scenesData)) {
        if (scene.npcs && scene.npcs.length > 0) {
          for (let i = 0; i < scene.npcs.length; i++) {
            const npc = scene.npcs[i];
            npcTasks.push(
              (async () => {
                try {
                  const imagePath = await generateNPCImage(npc, fileId);
                  updatedScenesData[sceneId].npcs[i].icon = imagePath;
                  return { id: npc.id, name: npc.name, imagePath, success: true };
                } catch (error) {
                  results.errors.push({ type: 'npc', id: npc.id, name: npc.name, error: error.message });
                  return { id: npc.id, name: npc.name, success: false };
                }
              })()
            );
          }
        }
      }
      results.npcs = await Promise.all(npcTasks);
    }

    if (generateBuildings) {
      const totalBuildings = Object.values(scenesData).reduce((total, scene) => total + (scene.buildings?.length || 0), 0);
      console.log(`Starting parallel generation of ${totalBuildings} buildings...`);
      const buildingTasks = [];

      for (const [sceneId, scene] of Object.entries(scenesData)) {
        if (scene.buildings && scene.buildings.length > 0) {
          for (let i = 0; i < scene.buildings.length; i++) {
            const building = scene.buildings[i];
            buildingTasks.push(
              (async () => {
                try {
                  const imagePath = await generateBuilding(building, fileId);
                  updatedScenesData[sceneId].buildings[i].icon = imagePath;
                  return { id: building.id, name: building.name, imagePath, success: true };
                } catch (error) {
                  results.errors.push({ type: 'building', id: building.id, name: building.name, error: error.message });
                  return { id: building.id, name: building.name, success: false };
                }
              })()
            );
          }
        }
      }
      results.buildings = await Promise.all(buildingTasks);
    }

    console.log('All parallel generation completed');

    // Update JSON file if requested
    if (updateJSON && (generateNPCs || generateScenes || generateBuildings)) {
      fs.writeFileSync(scenesPath, JSON.stringify(updatedScenesData, null, 2));
      console.log('✅ Updated scenes JSON with API URLs');
      console.log(`📝 Updated ${results.scenes.length} scene backgrounds, ${results.npcs.length} NPC icons, ${results.buildings.length} building icons`);
    }

    return results;
  } catch (error) {
    console.error('Error generating game images:', error);
    throw error;
  }
}


function safeDeleteFile(filePath) {
  try {
    // 检查文件是否存在
    if (fs.existsSync(filePath)) {
      console.log(`准备删除文件: ${filePath}`);
      fs.unlinkSync(filePath);
      console.log(`✅ 文件删除成功: ${path.basename(filePath)}`);

      // 再次验证文件是否已删除
      if (fs.existsSync(filePath)) {
        console.warn(`⚠️ 文件删除后仍存在: ${filePath}`);
        return false;
      }
      return true;
    } else {
      console.warn(`⚠️ 文件不存在，无需删除: ${filePath}`);
      return true; // 视为"已清理"状态
    }
  } catch (error) {
    console.error(`❌ 删除文件失败: ${path.basename(filePath)}`, error.message);
    console.log("======================删除临时文件error信息===========================",error);
    // 根据错误码提供更具体的建议
    if (error.code === 'ENOENT') {
      console.log('文件不存在，可能已被删除。');
    } else if (error.code === 'EBUSY' || error.code === 'EPERM') {
      console.log('文件被占用或无权限。请关闭可能使用此文件的程序，或检查权限。');
    } else if (error.code === 'EACCES') {
      console.log('权限不足，无法删除文件[citation:5]。');
    }
    return false;
  }
}


// ✅ 重试删除函数
async function safeDeleteWithRetry(filePath) {
 try {
    // 方法1：尝试 fs.unlinkSync
    fs.unlinkSync(filePath);
    console.log(`✅ 后备方案删除成功: ${path.basename(filePath)}`);
    return true;
  } catch (error1) {
    try {
      // 方法2：尝试修改权限后删除
      fs.chmodSync(filePath, 0o666); // 添加写权限
      fs.unlinkSync(filePath);
      console.log(`✅ 修改权限后删除成功: ${path.basename(filePath)}`);
      return true;
    } catch (error2) {
      console.error(`❌ 所有删除方法都失败: ${path.basename(filePath)}`);
      return false;
    }
  }
}

/**
 * 重试删除临时文件
 * @param {string} tempFilepath 临时文件路径
 * @param {number} maxRetries 最大重试次数，默认3次
 * @param {number} baseDelay 基础延迟时间(ms)，默认100ms
 */
async function deleteTempFileWithRetry(tempFilepath, maxRetries = 3, baseDelay = 100) {
  console.log(`🗑️ 尝试删除临时文件: ${path.basename(tempFilepath)}`);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 尝试删除
      await fs.promises.unlink(tempFilepath);
      console.log(`✅ 删除成功 (第${attempt + 1}次尝试): ${path.basename(tempFilepath)}`);
      return true;
      
    } catch (error) {
      // 文件不存在，也算成功
      if (error.code === 'ENOENT') {
        console.log(`📭 文件已不存在: ${path.basename(tempFilepath)}`);
        return true;
      }
      
      // 最后一次尝试，记录警告
      if (attempt === maxRetries - 1) {
        console.warn(`⚠️ 删除失败 (${maxRetries}次尝试后): ${path.basename(tempFilepath)}`, error.code);
        return false;
      }
      
      // 如果是权限或占用错误，等待后重试
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        // 指数退避：100ms, 200ms, 400ms...
        const waitTime = baseDelay * Math.pow(2, attempt);
        console.log(`⏳ ${error.code} 错误，${waitTime}ms后重试 (${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        // 其他错误直接退出
        console.warn(`⚠️ 无法处理的错误: ${error.code}`, error.message);
        return false;
      }
    }
  }
  return false;
}