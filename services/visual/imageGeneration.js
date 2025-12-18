import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { completeGameByParams } from '../../login/controller/gamesController.js';
import { relative } from 'path/win32';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config();

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// OpenAI API configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL
});

// Baidu configuration
const ak = process.env.BAIDU_ACCESS_TOKEN;
const sk = process.env.BAIDU_SECRET_KEY;

// BCE (Baidu Cloud Engine) configuration for video/image cutout
const CONFIG = {
  AK: process.env.BAIDU_ACCESS_TOKEN,
  SK: process.env.BAIDU_SECRET_KEY,
  HOST: 'vod.bj.baidubce.com'
};

const VISUAL_GAME_DATA_DIR = path.join(__dirname, '..', '..', 'public', 'visual_game');
const VISUAL_IMAGES_DIR = path.join(VISUAL_GAME_DATA_DIR, 'images');

if (!fs.existsSync(VISUAL_IMAGES_DIR)) {
  fs.mkdirSync(VISUAL_IMAGES_DIR, { recursive: true });
}

/**
 * Extract lore context from visual game worldSetting
 */
function extractVisualGameContext(fileId) {
  try {
    // Try to load from temp directory first (user uploads)
    let worldSettingPath = path.join(VISUAL_GAME_DATA_DIR, 'temp', fileId, 'worldSetting.json');

    // If not in temp, try preset directory
    if (!fs.existsSync(worldSettingPath)) {
      worldSettingPath = path.join(__dirname, '..', '..', 'public','world_interaction', 'temp', fileId, 'worldSetting.json');
    }

    if (!fs.existsSync(worldSettingPath)) {
      console.warn(`World setting file not found for fileId: ${fileId}`);
      return {
        title: '',
        literary: 'Fantasy Art',
        background: '',
        Theme: []
      };
    }

    const worldSetting = JSON.parse(fs.readFileSync(worldSettingPath, 'utf-8'));

    return {
      title: worldSetting.title || '',
      literary: worldSetting.literary || 'Fantasy Art',
      background: worldSetting.background || '',
      Theme: worldSetting.Theme || [],
      preamble: worldSetting.preamble || ''
    };
  } catch (error) {
    console.error('Error extracting visual game context:', error);
    return {
      title: '',
      literary: 'Fantasy Art',
      background: '',
      Theme: []
    };
  }
}

/**
 * Generate contextual prompt for visual game elements
 */
function generateVisualGamePrompt(gameContext, elementType, element, variant = null) {
  const { literary, background, Theme } = gameContext;

  let basePrompt = '';
  const themeStr = Theme.length > 0 ? Theme.join(', ') : '';
  const contextStr = background ? `Story context: ${background}. ` : '';

  switch (elementType) {
    case 'npc':
      // Full-body vertical illustration for NPC
      basePrompt = `Full-body character illustration of ${element.name}. `;
      basePrompt += `${element.description} `;
      basePrompt += `Appearance: ${element.appearance}. `;
      

      if (variant) {
        // Differential illustration variant
        if (variant.type === 'expression') {
          basePrompt += `Expression: ${variant.value} (${variant.description || ''}). `;
        } else if (variant.type === 'clothing') {
          basePrompt += `Outfit: ${variant.value} (${variant.description || ''}). `;
        } else if (variant.type === 'pose') {
          basePrompt += `Pose: ${variant.value}. `;
        }
      }

      basePrompt += `${contextStr}`;
      if (themeStr) {
        basePrompt += `Theme: ${themeStr}. `;
      }
      basePrompt += 'Full-body vertical portrait, standing pose, clean white background for easy cutout, detailed character design, high quality visual novel style illustration. DO NOT INCLUDE ANY TEXT IN THE IMAGE.';
      break;

    case 'scene':
      // Landscape scene image
      basePrompt = `A detailed landscape illustration of ${element.name}. `;
      basePrompt += `${element.description} `;
      basePrompt += `${contextStr}`;
      if (themeStr) {
        basePrompt += `Theme: ${themeStr}. `;
      }
      basePrompt += 'Wide angle cinematic view, atmospheric lighting, beautiful composition, detailed background art for visual novel. High quality, professional game background art.';
      break;

    default:
      basePrompt = `${element.name}: ${element.description}. Art style: ${literary}. High quality visual novel illustration.`;
  }

  return basePrompt;
}

async function removeBgFromImage(imagePath, ak, sk) {
  try {
    console.log('🎨 Removing background from image...');
    
    // Read the image file and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString('base64');

    // Call Baidu image segmentation API
    const response = await fetch(`https://aip.baidubce.com/rest/2.0/image-process/v1/segment?access_token=${accessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        'image': imageBase64,
        'refine_mask': 'true',
        'method': 'auto'
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Baidu API response:', result);

      // Check if the API returned success
      if (result.foreground) {
        // The processed image is returned as base64
        const resultBuffer = Buffer.from(result.foreground, 'base64');
        console.log('✅ Background removed successfully');
        return resultBuffer;
      } else {
        console.error('❌ Baidu API error: No image data in response');
        console.error('Response fields:', Object.keys(result));
        return null;
      }
    } else {
      const errorText = await response.text();
      console.error(`❌ Baidu API error: ${response.status} - ${errorText}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Background removal failed:', error.message);
    return null;
  }
}

async function convertToSquare(inputPath, outputPath) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // Calculate the size for the square (use the larger dimension)
    const size = Math.max(width, height);

    // Create a square image with padding
    await image
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
      })
      .toFile(outputPath);

    console.log(`✅ Image converted to square (${size}x${size}): ${path.basename(outputPath)}`);
    return outputPath;
  } catch (error) {
    console.error('Error converting image to square:', error);
    throw error;
  }
}

export async function downloadImage(fileId, url, filepath, zipsize) {
  return new Promise(async (resolve, reject) => {
    // Validate that url is a string
    if (typeof url !== 'string') {
      reject(new Error(`downloadImage expects a string URL, but received: ${typeof url}`));
      return;
    }
    const protocol = url.startsWith('https') ? https : http;
    const tempFilepath = filepath + '.temp';
    const file = fs.createWriteStream(tempFilepath);

    protocol.get(url, (response) => {
      response.pipe(file);
      file.on('finish', async () => {
        file.close();

        try {
          // Process image with sharp - resize to 500px width
          await sharp(tempFilepath)
            .resize(zipsize)
            .toFile(filepath);

          // Delete the temporary file
          fs.unlinkSync(tempFilepath);

          console.log(`✅ Image processed and resized to 500px: ${path.basename(filepath)}`);
          resolve(filepath);
        } catch (err) {
          // If sharp processing fails, clean up and reject
          fs.unlink(tempFilepath, () => {});
          fs.unlink(filepath, () => {});
          reject(err);
        }
      });
      
    }).on('error', (err) => {
      fs.unlink(tempFilepath, () => {}); // Delete the file on error
      reject(err);
    });
     try {
      console.log(`✅ InitData data uploaded to MinIO: ${fileId}`);
      await completeGameByParams(filepath, fileId);
      console.log(`✅ InitData data uploaded to MinIO: ${fileId}`);
    } catch (uploadError) {
      console.error('[MinIO Upload] Failed to upload InitData data:', uploadError.message);
    }
  });
}

/**
 * Save base64 image data to file with resizing
 */
export async function saveBase64Image(fileId, base64Data, filepath, zipsize) {
  try {
    // Decode base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Process and resize with sharp
    await sharp(imageBuffer)
      .resize(zipsize)
      .toFile(filepath);

    console.log(`✅ Base64 image processed and resized: ${path.basename(filepath)}`);
    //上传到minio
    try {
      console.log(`✅ InitData data uploaded to MinIO,getTargetPath: ${fileId}`);
      await completeGameByParams(filepath, fileId);
      console.log(`✅ InitData data uploaded to MinIO: ${fileId}`);
    } catch (uploadError) {
      console.error('[MinIO Upload] Failed to upload session data:', uploadError.message);
    }
    return filepath;
  } catch (error) {
    console.error('Error saving base64 image:', error);
    throw error;
  }
}

/**
 * get fileId
 */
function getTargetPath(localPath) {
  console.log('==============================getTargetPathlocalPath', localPath);
  // 步骤1：找到 images/ 的结束位置
  const imagesPrefix = 'images/';
  const imagesIndex = localPath.indexOf(imagesPrefix);
  console.log('==============================imagesIndex', imagesIndex);
  if (imagesIndex === -1) return '';
  
  // 步骤2：截取 images/ 后的内容，直到第一个 / 为止（即 ${fileId}）
  const start = imagesIndex + imagesPrefix.length;
  const end = localPath.indexOf('/', start);
  if (end === -1) return '';
  const fileIdStr = localPath.slice(start, end); // 此时 fileIdStr = "${fileId}"
  
  console.log('==============================fileIdStr', fileIdStr);
  // 步骤3：剔除 ${} 符号，只保留中间的 fileId
  return fileIdStr.replace(/\$\{|\}/g, '');
}

/**
 * Handle image result from generation (either URL or base64)
 */
export async function processImageResult(fileId, imageResult, filepath, zipsize) {
  // 防御式校验，避免 URL 为空导致下载报错
  if (!imageResult || typeof imageResult !== 'object') {
    throw new Error(`Invalid image result: ${JSON.stringify(imageResult)}`);
  }

  // 如果上游返回了错误标记，则跳过处理（不抛错，交由调用方决定兜底）
  if (imageResult.type === 'error') {
    console.warn(`Image result marked as error, skip saving: ${imageResult.message || ''}`);
    return null;
  }

  if (imageResult.type === 'url') {
    if (typeof imageResult.data !== 'string' || !imageResult.data.trim()) {
      throw new Error(`Image result is missing URL: ${JSON.stringify(imageResult)}`);
    }
    return await downloadImage(fileId, imageResult.data, filepath, zipsize);
  } else if (imageResult.type === 'base64') {
    if (typeof imageResult.data !== 'string' || !imageResult.data.trim()) {
      throw new Error(`Image result is missing base64 data: ${JSON.stringify(imageResult)}`);
    }
    return await saveBase64Image(fileId, imageResult.data, filepath, zipsize);
  } else {
    throw new Error(`Unknown image result type: ${imageResult.type}`);
  }
}

/**
 * Generate image using Gemini API
 */
export async function generateImage(prompt, size = '1024x1024', quality = 'standard', maxRetries = 2, timeout = 60000) {
  const attemptGeneration = async (attemptNumber) => {
    console.log(`🎨 Generating image with Gemini (Attempt ${attemptNumber}/${maxRetries + 1}): ${prompt.substring(0, 100)}...`);
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
        quality: quality
      });

      // Race between timeout and actual generation
      const response = await Promise.race([generationPromise, timeoutPromise]);

      const elapsedTime = Date.now() - startTime;
      console.log(`✅ Image generated successfully in ${elapsedTime}ms`);
      // Extract URL or base64 data from response object
      const imageUrl = response.data?.[0]?.url;
      const imageB64 = response.data?.[0]?.b64_json;

      if (imageUrl) {
        return { type: 'url', data: imageUrl };
      } else if (imageB64) {
        return { type: 'base64', data: imageB64 };
      } else {
        throw new Error('OpenAI API returned a response without an image URL or base64 data. Response structure may be invalid.');
      }
    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      if (error.message.includes('timeout')) {
        console.warn(`⏱️ Image generation timed out after ${elapsedTime}ms`);
      } else {
        console.error(`❌ Error generating image (attempt ${attemptNumber}):`, error.message);
      }

      // If we have retries left, retry
      if (attemptNumber < maxRetries + 1) {
        console.log(`🔄 Retrying image generation... (${attemptNumber}/${maxRetries + 1})`);
        return attemptGeneration(attemptNumber + 1);
      }
      // 重试耗尽后，不抛出异常，返回错误标记，由上层决定是否兜底
      return { type: 'error', message: error.message || 'image generation failed' };
    }
  };
  return attemptGeneration(1);
}

/**
 * Generate image-to-image using OpenAI /v1/images/edits with reference image
 * This is the true img2img function for variants
 */
export async function generateImageToImage(prompt, referenceImagePath, size = '1024x1024', maxRetries = 2, timeout = 80000) {
  const attemptGeneration = async (attemptNumber) => {
    console.log(`🎨 Generating img2img with OpenAI (Attempt ${attemptNumber}/${maxRetries + 1})`);
    const startTime = Date.now();

    try {
      // Convert image to square format first (required by OpenAI)
      const squareImagePath = referenceImagePath.replace(/(\.\w+)$/, '_square$1');
      await convertToSquare(referenceImagePath, squareImagePath);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Image generation timeout after ${timeout}ms`));
        }, timeout);
      });

      const generationPromise = (async () => {
        // Read the square image as a Blob
        const imageBlob = await fs.openAsBlob(squareImagePath);

        const formData = new FormData();
        formData.append('image', imageBlob, path.basename(squareImagePath));
        formData.append('prompt', prompt);
        formData.append('model', 'gemini-3-pro-image-preview');
        formData.append('n', '1');
        formData.append('quality', 'auto');
        formData.append('size', size);

        const response = await fetch(`${OPENAI_BASE_URL}/images/edits`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: formData
        });

        // Clean up temporary square image
        if (fs.existsSync(squareImagePath)) {
          fs.unlinkSync(squareImagePath);
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        const imageUrl = result.data?.[0]?.url;
        const imageB64 = result.data?.[0]?.b64_json;

        if (imageUrl) {
          return { type: 'url', data: imageUrl };
        } else if (imageB64) {
          return { type: 'base64', data: imageB64 };
        } else {
          throw new Error('OpenAI API returned a response without an image URL or base64 data. Response structure may be invalid.');
        }
      })();

      const imageResult = await Promise.race([generationPromise, timeoutPromise]);

      const elapsedTime = Date.now() - startTime;
      console.log(`✅ Image-to-image generated successfully in ${elapsedTime}ms`);

      return imageResult;
    } catch (error) {
      console.error(`❌ Error generating img2img (attempt ${attemptNumber}):`, error.message);

      // Clean up temporary square image in case of error
      const squareImagePath = referenceImagePath.replace(/(\.\w+)$/, '_square$1');
      if (fs.existsSync(squareImagePath)) {
        fs.unlinkSync(squareImagePath);
      }

      if (attemptNumber < maxRetries + 1) {
        console.log(`🔄 Retrying img2img generation... (${attemptNumber}/${maxRetries + 1})`);
        return attemptGeneration(attemptNumber + 1);
      }
      throw error;
    }
  };
  return attemptGeneration(1);
}


/**
 * Generate NPC base image for visual game
 * Base images are full generation from scratch
 */
export async function generateVisualNPCImage(npc, fileId, removeBg = true, presetId = null, pluginType) {
  try {
    const gameContext = extractVisualGameContext(fileId || presetId);
    const prompt = generateVisualGamePrompt(gameContext, 'npc', npc, null);
    console.log(`plugin ${pluginType}`);
    console.log(`🎨 Generating base image for NPC: ${npc.name}`);
    const imageResult = await generateImage(prompt, '768x1344', 'standard'); // Vertical format for full-body

    // Create fileId-specific directory structure based on plugin type
    let fileIdDir;
    if (pluginType === 'world-interaction') {
      fileIdDir = path.join(__dirname, '..', '..', 'public', 'world_interaction', 'images', fileId || presetId || 'preset', 'npcs', npc.id);
    } else {
      // Default to visual game
      fileIdDir = path.join(VISUAL_IMAGES_DIR, fileId || presetId || 'preset', 'npcs', npc.id);
    }

    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = 'base.png';
    const filepath = path.join(fileIdDir, filename);

    // Process and save the image (handles both URL and base64)
    await processImageResult(fileId, imageResult, filepath, 800);

    // Remove background if requested
    if (removeBg) {
      const noBgData = await removeBgFromImage(filepath, ak, sk);
      if (noBgData) {
        // Save the no-bg version as the main file
        fs.writeFileSync(filepath, noBgData);
        console.log('✅ Background removed and saved');
      }
    }

    // Generate correct API path based on fileId, presetId, and pluginType
    let apiPath;
    if (pluginType === 'world-interaction' && fileId) {
      apiPath = `/api/world-interaction/images/${fileId}/npcs/${npc.id}/${filename}`;
    } else if (fileId) {
      // User uploaded game
      apiPath = `/api/visual/images/${fileId}/npcs/${npc.id}/${filename}`;
    } else if (presetId) {
      // Preset game with specific presetId
      apiPath = `/api/visual/presets/${presetId}/images/npcs/${npc.id}/${filename}`;
    } else {
      // Legacy preset path (not recommended)
      apiPath = `/api/visual/images/preset/npcs/${npc.id}/${filename}`;
    }

    console.log(`✅ NPC base image saved: ${apiPath}`);
    return apiPath;
  } catch (error) {
    console.error(`Error generating base image for NPC ${npc.name}:`, error);
    throw error;
  }
}

/**
 * Generate Player base image for visual game
 * Similar to NPC generation but for the player character
 */
export async function generateVisualPlayerImage(player, fileId, removeBg = true, presetId = null, pluginType = 'visual') {
  try {
    const gameContext = extractVisualGameContext(fileId || presetId);

    // Create player object in NPC-like format for prompt generation
    const playerAsNPC = {
      name: player.name,
      age: player.age || 25,
      appearance: player.appearance || '',
      personality: player.personality || ''
    };

    const prompt = generateVisualGamePrompt(gameContext, 'npc', playerAsNPC, null);

    console.log(`🎨 Generating base image for Player: ${player.name}`);
    const imageResult = await generateImage(prompt, '768x1344', 'standard'); // Vertical format for full-body

    // Create fileId-specific directory structure for players based on plugin type
    let fileIdDir;
    if (pluginType === 'world-interaction') {
      fileIdDir = path.join(__dirname, '..', '..', 'public', 'world_interaction', 'images', fileId || presetId || 'preset', 'players');
    } else {
      // Default to visual game
      fileIdDir = path.join(VISUAL_IMAGES_DIR, fileId || presetId || 'preset', 'players');
    }

    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = 'base.png';
    const filepath = path.join(fileIdDir, filename);

    // Process and save the image (handles both URL and base64)
    await processImageResult(fileId, imageResult, filepath, 800);

    // Remove background if requested
    if (removeBg) {
      const noBgData = await removeBgFromImage(filepath, ak, sk);
      if (noBgData) {
        // Save the no-bg version as the main file
        fs.writeFileSync(filepath, noBgData);
        console.log('✅ Background removed and saved');
      }
    }

    // Generate correct API path based on fileId, presetId, and pluginType
    let apiPath;
    if (pluginType === 'world-interaction' && fileId) {
      apiPath = `/api/world-interaction/images/${fileId}/players/${filename}`;
    } else if (fileId) {
      apiPath = `/api/visual/images/${fileId}/players/${filename}`;
    } else if (presetId) {
      apiPath = `/api/visual/presets/${presetId}/images/players/${filename}`;
    } else {
      apiPath = `/api/visual/images/preset/players/${filename}`;
    }

    console.log(`✅ Player base image saved: ${apiPath}`);
    return apiPath;
  } catch (error) {
    console.error(`Error generating base image for Player ${player.name}:`, error);
    throw error;
  }
}


export async function generateNPCVariantImage(npcId, baseImagePath, variant, fileId, removeBg = true, presetId = null, pluginType = null) {
  try {

    // Determine plugin type: use explicit parameter or infer from baseImagePath
    let detectedPluginType = pluginType;
    if (!detectedPluginType) {
      if (baseImagePath.startsWith('/api/world-interaction/images')) {
        detectedPluginType = 'world-interaction';
      } else if (baseImagePath.startsWith('/api/visual/presets/')) {
        detectedPluginType = 'preset';
      } else {
        detectedPluginType = 'visual'; // Default
      }
    }

    // Convert API path to file path if needed
    let baseFilePath;
    let fileIdDir; // Declare outside to use later

    if (detectedPluginType === 'visual') {
      // Convert API path to file path
      const relativePath = baseImagePath.replace('/api/visual/images/', '');
      baseFilePath = path.join(VISUAL_IMAGES_DIR, relativePath);
      fileIdDir = path.join(VISUAL_IMAGES_DIR, fileId || presetId || 'preset', 'npcs', npcId);
    } else if (detectedPluginType === 'preset') {
      // Convert preset API path to file path
      const match = baseImagePath.match(/\/api\/visual\/presets\/([^\/]+)\/images\/(.+)/);
      if (match) {
        const [, presetIdFromPath, relativePath] = match;
        baseFilePath = path.join(process.cwd(), 'visual_saves', presetIdFromPath, relativePath);
        fileIdDir = path.join(process.cwd(), 'visual_saves', presetIdFromPath, 'npcs', npcId);
      } else {
        throw new Error(`Invalid preset image path: ${baseImagePath}`);
      }
    } else if (detectedPluginType === 'world-interaction') {
      const relativePath = baseImagePath.replace('/api/world-interaction/', '');
      baseFilePath = path.join(__dirname, '..', '..', 'public', 'world_interaction', relativePath);
      fileIdDir = path.join(__dirname, '..', '..', 'public', 'world_interaction', 'images', fileId || 'preset', 'npcs', npcId);
    }

    if (!fs.existsSync(baseFilePath)) {
      throw new Error(`Base image not found: ${baseFilePath}`);
    }

    console.log(`🎨 Generating variant image for NPC: ${npcId} (${variant.type}: ${variant.value})`);

    // Build variant-specific prompt
    let variantPrompt = `This is a character illustration variant. `;

    if (variant.type === 'expression') {
      variantPrompt += `Keep the same character, same pose, same outfit, same background. `;
      variantPrompt += `Only change the facial expression to: ${variant.value}. `;
      if (variant.description) {
        variantPrompt += `${variant.description}. `;
      }
    } else if (variant.type === 'clothing') {
      variantPrompt += `Keep the same character, same facial expression, same pose, same background. `;
      variantPrompt += `Only change the outfit to: ${variant.value}. `;
      if (variant.description) {
        variantPrompt += `${variant.description}. `;
      }
    } else if (variant.type === 'pose') {
      variantPrompt += `Keep the same character, same facial expression, same outfit, same background. `;
      variantPrompt += `Only change the pose to: ${variant.value}. `;
      if (variant.description) {
        variantPrompt += `${variant.description}. `;
      }
    }
    variantPrompt += 'Full-body vertical portrait, clean white background for easy cutout, detailed character design, high quality anime/visual novel style illustration. DO NOT INCLUDE ANY TEXT IN THE IMAGE.';

    // Use image-to-image generation with base image as reference
    const imageResult = await generateImageToImage(variantPrompt, baseFilePath, '768x1344');

    // Create directory structure
    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = `${variant.type}_${variant.value.replace(/\s+/g, '_')}.png`;
    const filepath = path.join(fileIdDir, filename);

    // Process and save the variant image (handles both URL and base64)
    await processImageResult(fileId, imageResult, filepath, 800);

    // Remove background if requested
    if (removeBg) {
      const noBgData = await removeBgFromImage(filepath, ak, sk);
      if (noBgData) {
        fs.writeFileSync(filepath, noBgData);
        console.log('✅ Background removed and saved');
      }
    }

    // Generate correct API path based on fileId, presetId, and pluginType
    let apiPath;
    if (fileId) {
      if (detectedPluginType === 'world-interaction') {
        apiPath = `/api/world-interaction/images/${fileId}/npcs/${npcId}/${filename}`;
      } else {
        apiPath = `/api/visual/images/${fileId}/npcs/${npcId}/${filename}`;
      }
    } else if (presetId) {
      // Preset game with specific presetId
      apiPath = `/api/visual/presets/${presetId}/images/npcs/${npcId}/${filename}`;
    } else {
      // Legacy preset path (not recommended)
      apiPath = `/api/visual/images/preset/npcs/${npcId}/${filename}`;
    }

    console.log(`✅ NPC variant image saved: ${apiPath}`);
    return apiPath;
  } catch (error) {
    console.error(`Error generating variant image for NPC ${npcId}:`, error);
    throw error;
  }
}

/**
 * Generate scene background image for visual game
 */
export async function generateVisualSceneImage(scene, fileId, presetId = null, pluginType = 'visual', isSubscene = false) {
  try {
    const gameContext = extractVisualGameContext(fileId || presetId);
    const prompt = generateVisualGamePrompt(gameContext, 'scene', scene);

    console.log(`🎨 Generating image for ${isSubscene ? 'subscene' : 'scene'}: ${scene.name}`);
    const imageResult = await generateImage(prompt, '1024x1792', 'standard');

    // Create fileId-specific directory structure based on plugin type and scene type
    let fileIdDir;
    const dirType = isSubscene ? 'subscenes' : 'scenes';

    if (pluginType === 'world-interaction') {
      fileIdDir = path.join(__dirname, '..', '..', 'public', 'world_interaction', 'images', fileId || presetId || 'preset', dirType);
    } else {
      // Default to visual game
      fileIdDir = path.join(VISUAL_IMAGES_DIR, fileId || presetId || 'preset', dirType);
    }

    if (!fs.existsSync(fileIdDir)) {
      fs.mkdirSync(fileIdDir, { recursive: true });
    }

    const filename = `${scene.id}.png`;
    const filepath = path.join(fileIdDir, filename);

    // Process and save the image (handles both URL and base64)
    await processImageResult(fileId, imageResult, filepath, 1000);

    // Generate correct API path based on fileId, presetId, pluginType, and scene type
    let apiPath;
    if (pluginType === 'world-interaction' && fileId) {
      apiPath = `/api/world-interaction/images/${fileId}/${dirType}/${filename}`;
    } else if (fileId) {
      apiPath = `/api/visual/images/${fileId}/${dirType}/${filename}`;
    } else if (presetId) {
      apiPath = `/api/visual/presets/${presetId}/images/${dirType}/${filename}`;
    } else {
      apiPath = `/api/visual/images/preset/${dirType}/${filename}`;
    }

    console.log(`✅ ${isSubscene ? 'Subscene' : 'Scene'} image saved: ${apiPath}`);
    return apiPath;
  } catch (error) {
    console.error(`Error generating image for ${isSubscene ? 'subscene' : 'scene'} ${scene.name}:`, error);
    throw error;
  }
}


export async function generateAllVisualGameImages(fileId = null, options = {}) {
  const {
    generateNPCs = true,
    generateScenes = true,
    generatePlayers = true, // Generate player character image
    generateVariants = false, // Generate differential NPC illustrations
    removeBg = true, // Remove background from NPC images
    updateJSON = true
  } = options;

  const results = {
    npcs: [],
    npcVariants: [],
    scenes: [],
    players: [],
    errors: []
  };

  try {
    // Load game data
    let worldSettingPath, npcSettingPath, sceneSettingPath;

    if (fileId) {
      // User uploaded game
      const tempDir = path.join(VISUAL_GAME_DATA_DIR, 'temp', fileId);
      worldSettingPath = path.join(tempDir, 'worldSetting.json');
      npcSettingPath = path.join(tempDir, 'npcSetting.json');
      sceneSettingPath = path.join(tempDir, 'sceneSetting.json');
    } else {
      // Preset game
      const presetDir = path.join(__dirname, '..', '..', 'visual_saves');
      worldSettingPath = path.join(presetDir, fileId,'worldSetting.json');
      npcSettingPath = path.join(presetDir, fileId, 'npcSetting.json');
      sceneSettingPath = path.join(presetDir, fileId, 'sceneSetting.json');
    }

    const worldSetting = JSON.parse(fs.readFileSync(worldSettingPath, 'utf-8'));
    const npcSetting = JSON.parse(fs.readFileSync(npcSettingPath, 'utf-8'));
    const sceneSetting = JSON.parse(fs.readFileSync(sceneSettingPath, 'utf-8'));

    // Generate player image
    const player = worldSetting.player || worldSetting.Player;
    if (generatePlayers && player) {
      console.log(`🎨 Generating player image...`);
      try {
        const playerImagePath = await generateVisualPlayerImage(player, fileId, removeBg);

        // Update player image path in worldSetting (handle both 'player' and 'Player' property names)
        if (worldSetting.player) {
          worldSetting.player.image = playerImagePath;
        } else if (worldSetting.Player) {
          worldSetting.Player.image = playerImagePath;
        }

        results.players.push({
          name: player.name,
          imagePath: playerImagePath,
          success: true
        });
        console.log(`✅ Player image generated: ${playerImagePath}`);
      } catch (error) {
        results.errors.push({
          type: 'player',
          name: player?.name || 'Player',
          error: error.message
        });
        results.players.push({
          name: player?.name || 'Player',
          success: false
        });
      }
    }

    // Generate scene images in parallel
    if (generateScenes && sceneSetting.scenes) {
      console.log(`🎨 Starting parallel generation of ${sceneSetting.scenes.length} scenes...`);
      const sceneTasks = sceneSetting.scenes.map(async (scene) => {
        try {
          const imagePath = await generateVisualSceneImage(scene, fileId);
          scene.image = imagePath;
          return { id: scene.id, name: scene.name, imagePath, success: true };
        } catch (error) {
          results.errors.push({ type: 'scene', id: scene.id, name: scene.name, error: error.message });
          return { id: scene.id, name: scene.name, success: false };
        }
      });
      results.scenes = await Promise.all(sceneTasks);
    }

    // Generate NPC base images in parallel
    if (generateNPCs && npcSetting.npcs) {
      console.log(`🎨 Starting parallel generation of ${npcSetting.npcs.length} NPCs...`);
      const npcTasks = npcSetting.npcs.map(async (npc) => {
        try {
          const baseImagePath = await generateVisualNPCImage(npc, fileId, removeBg);

          // Initialize images object if not exists
          if (!npc.images) {
            npc.images = {};
          }
          npc.images.base = baseImagePath;

          return { id: npc.id, name: npc.name, imagePath: baseImagePath, success: true };
        } catch (error) {
          results.errors.push({ type: 'npc', id: npc.id, name: npc.name, error: error.message });
          return { id: npc.id, name: npc.name, success: false };
        }
      });
      results.npcs = await Promise.all(npcTasks);
    }

    // Generate NPC variant images (differential illustrations) using base images
    if (generateVariants && npcSetting.npcs) {
      console.log(`🎨 Starting generation of NPC variants...`);
      const variantTasks = [];

      for (const npc of npcSetting.npcs) {
        // Check if NPC has variants defined and base image exists
        if (npc.variants && Array.isArray(npc.variants) && npc.images?.base) {
          for (const variant of npc.variants) {
            variantTasks.push(
              (async () => {
                try {
                  const variantImagePath = await generateNPCVariantImage(
                    npc.id,
                    npc.images.base,
                    variant,
                    fileId,
                    removeBg
                  );

                  // Store variant image path
                  if (!npc.images) {
                    npc.images = {};
                  }
                  const variantKey = `${variant.type}_${variant.value.replace(/\s+/g, '_')}`;
                  npc.images[variantKey] = variantImagePath;

                  return {
                    npcId: npc.id,
                    npcName: npc.name,
                    variant: variant.value,
                    variantType: variant.type,
                    imagePath: variantImagePath,
                    success: true
                  };
                } catch (error) {
                  results.errors.push({
                    type: 'npc_variant',
                    id: npc.id,
                    name: npc.name,
                    variant: variant.value,
                    error: error.message
                  });
                  return {
                    npcId: npc.id,
                    npcName: npc.name,
                    variant: variant.value,
                    success: false
                  };
                }
              })()
            );
          }
        }
      }

      results.npcVariants = await Promise.all(variantTasks);
    }

    console.log('✅ All parallel generation completed');

    // Update JSON files if requested
    if (updateJSON) {
      fs.writeFileSync(worldSettingPath, JSON.stringify(worldSetting, null, 2));
      fs.writeFileSync(npcSettingPath, JSON.stringify(npcSetting, null, 2));
      fs.writeFileSync(sceneSettingPath, JSON.stringify(sceneSetting, null, 2));
      console.log('✅ Updated JSON files with image paths');
      console.log(`📝 Updated ${results.players.length} player images, ${results.scenes.length} scene images, ${results.npcs.length} NPC base images, ${results.npcVariants.length} NPC variants`);
    }

    return results;
  } catch (error) {
    console.error('Error generating visual game images:', error);
    throw error;
  }
}

