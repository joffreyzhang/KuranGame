import fs from 'fs';
import path from 'path';
import { IMAGES_DIR, loadGameFiles, getAllSubscenes, getFileDirectory, loadJSONFile, saveJSONFile } from './utils.js';
import {
  generateImage,
  processImageResult,
  generateVisualNPCImage,
  generateVisualPlayerImage,
  generateVisualSceneImage,
  generateNPCVariantImage as generateVisualNPCVariantImage
} from '../visual/imageGeneration.js';

/**
 * Generate world map image showing all scenes
 */
export async function generateWorldMapImage(fileId) {
  try {
    console.log(`🗺️ Generating world map for fileId: ${fileId}`);

    const { worldSetting, sceneSetting } = loadGameFiles(fileId, null);

    // Create prompt for world map
    const scenesList = sceneSetting.scenes.map(s => `${s.name}: ${s.description}`).join('\n');

    const prompt = `A beautiful top-down illustrated map showing all locations in a world.

World: ${worldSetting.title}

Locations to include on the map:
${scenesList}

Create an artistic game world map with all these locations with beautiful artistic details and a cohesive design that shows how all locations relate to each other spatially. Include decorative elements that match the theme. Top-down view, illustrated map style, high quality game art.`;

    console.log('🎨 Generating world map image...');

    const imageResult = await generateImage(prompt, '768x1344', 'standard');

    // Create directory for world interaction images
    const worldImagesDir = path.join(IMAGES_DIR, fileId);
    if (!fs.existsSync(worldImagesDir)) {
      fs.mkdirSync(worldImagesDir, { recursive: true });
    }

    const imagePath = path.join(worldImagesDir, 'world_map.png');

    // Process and save the image (handles both URL and base64)
    await processImageResult(fileId, imageResult, imagePath, 800);

    const apiPath = `/api/world-interaction/images/${fileId}/world_map.png`;

    // Save API path to worldSetting.json
    const fileDir = getFileDirectory(fileId);
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');
    worldSetting.worldMapImage = apiPath;
    saveJSONFile(worldSettingPath, worldSetting);

    console.log(`✅ World map generated and saved to worldSetting: ${apiPath}`);

    return apiPath;
  } catch (error) {
    console.error('Error generating world map:', error);
    throw error;
  }
}

/**
 * Generate scene image - delegates to visual/imageGeneration.js with pluginType
 */
export async function generateSceneImage(fileId, sceneId) {
  try {
    console.log(`🏞️ Generating scene image for: ${sceneId}`);

    const { sceneSetting } = loadGameFiles(fileId, null);
    const scene = sceneSetting.scenes.find(s => s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    // Use the visual function with world-interaction plugin type
    const apiPath = await generateVisualSceneImage(scene, fileId, null, 'world-interaction', false);

    // Save API path to sceneSetting.json
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex !== -1) {
      sceneSetting.scenes[sceneIndex].image = apiPath;
      saveJSONFile(sceneSettingPath, sceneSetting);
    }

    console.log(`✅ Scene image generated and saved to sceneSetting: ${apiPath}`);

    return apiPath;
  } catch (error) {
    console.error('Error generating scene image:', error);
    throw error;
  }
}

/**
 * Generate subscene image - delegates to visual/imageGeneration.js with pluginType
 */
export async function generateSubsceneImage(fileId, sceneId, subsceneId) {
  try {
    console.log(`🎯 Generating subscene image for: ${subsceneId}`);

    const { sceneSetting } = loadGameFiles(fileId, null);
    const scene = sceneSetting.scenes.find(s => s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const subscene = scene.subscenes?.find(s => s.id === subsceneId);

    if (!subscene) {
      throw new Error(`Subscene not found: ${subsceneId}`);
    }

    // Use the visual function with world-interaction plugin type and isSubscene=true
    const apiPath = await generateVisualSceneImage(subscene, fileId, null, 'world-interaction', true);

    // Save API path to sceneSetting.json
    const fileDir = getFileDirectory(fileId);
    const sceneSettingPath = path.join(fileDir, 'sceneSetting.json');
    const sceneIndex = sceneSetting.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex !== -1) {
      const subsceneIndex = sceneSetting.scenes[sceneIndex].subscenes?.findIndex(s => s.id === subsceneId);
      if (subsceneIndex !== -1) {
        sceneSetting.scenes[sceneIndex].subscenes[subsceneIndex].image = apiPath;
        saveJSONFile(sceneSettingPath, sceneSetting);
      }
    }

    console.log(`✅ Subscene image generated and saved to sceneSetting: ${apiPath}`);

    return apiPath;
  } catch (error) {
    console.error('Error generating subscene image:', error);
    throw error;
  }
}

/**
 * Generate NPC image - delegates to visual/imageGeneration.js with pluginType
 */
export async function generateNPCImage(fileId, npcId) {
  try {
    console.log(`👤 Generating NPC image for: ${npcId}`);

    const { npcSetting } = loadGameFiles(fileId, null);

    // Find NPC in the game data
    const npc = npcSetting.npcs?.find(n => n.id === npcId);

    if (!npc) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    // Use the visual function with world-interaction plugin type
    const apiPath = await generateVisualNPCImage(npc, fileId, false, null, 'world-interaction');

    // Save API path to npcSetting.json
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');
    const npcIndex = npcSetting.npcs.findIndex(n => n.id === npcId);
    if (npcIndex !== -1) {
      if (!npcSetting.npcs[npcIndex].images) {
        npcSetting.npcs[npcIndex].images = {};
      }
      npcSetting.npcs[npcIndex].images.base = apiPath;
      saveJSONFile(npcSettingPath, npcSetting);
    }

    console.log(`✅ NPC image generated and saved to npcSetting: ${apiPath}`);

    return apiPath;
  } catch (error) {
    console.error('Error generating NPC image:', error);
    throw error;
  }
}

/**
 * Generate NPC variant image - delegates to visual/imageGeneration.js with pluginType
 */
export async function generateNPCVariantImage(fileId, npcId, variant) {
  try {
    console.log(`👤 Generating NPC variant image for: ${npcId} (${variant.type}: ${variant.value})`);

    const { npcSetting } = loadGameFiles(fileId, null);

    // Find NPC in the game data
    const npc = npcSetting.npcs?.find(n => n.id === npcId);

    if (!npc) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    // Check if base image exists
    if (!npc.images || !npc.images.base) {
      throw new Error(`Base image not found for NPC: ${npcId}. Generate base image first.`);
    }

    // Use the visual function with world-interaction plugin type
    const apiPath = await generateVisualNPCVariantImage(
      npcId,
      npc.images.base,
      variant,
      fileId,
      false, // removeBg
      null, // presetId
      'world-interaction' // pluginType
    );

    // Save API path to npcSetting.json
    const fileDir = getFileDirectory(fileId);
    const npcSettingPath = path.join(fileDir, 'npcSetting.json');
    const npcIndex = npcSetting.npcs.findIndex(n => n.id === npcId);
    if (npcIndex !== -1) {
      if (!npcSetting.npcs[npcIndex].images) {
        npcSetting.npcs[npcIndex].images = {};
      }
      const variantKey = `${variant.type}_${variant.value.replace(/\s+/g, '_')}`;
      npcSetting.npcs[npcIndex].images[variantKey] = apiPath;
      saveJSONFile(npcSettingPath, npcSetting);
    }

    console.log(`✅ NPC variant image generated and saved to npcSetting: ${apiPath}`);

    return apiPath;
  } catch (error) {
    console.error('Error generating NPC variant image:', error);
    throw error;
  }
}

/**
 * Generate player character image - delegates to visual/imageGeneration.js with pluginType
 */
export async function generatePlayerImage(fileId) {
  try {
    console.log(`🎮 Generating player image for fileId: ${fileId}`);

    const { worldSetting } = loadGameFiles(fileId, null);

    // Get player data
    const player = worldSetting.player || worldSetting.Player;

    if (!player) {
      throw new Error('Player data not found in worldSetting');
    }

    // Use the visual function with world-interaction plugin type
    const apiPath = await generateVisualPlayerImage(player, fileId, false, null, 'world-interaction');

    // Save API path to worldSetting.json
    const fileDir = getFileDirectory(fileId);
    const worldSettingPath = path.join(fileDir, 'worldSetting.json');
    if (!worldSetting.player.images) {
      worldSetting.player.images = {};
    }
    worldSetting.player.imagePath = apiPath;
    saveJSONFile(worldSettingPath, worldSetting);

    console.log(`✅ Player image generated and saved to worldSetting: ${apiPath}`);

    return apiPath;
  } catch (error) {
    console.error('Error generating player image:', error);
    throw error;
  }
}

/**
 * Generate all images for world interaction game
 */
export async function generateAllWorldInteractionImages(fileId) {
  const results = {
    worldMap: null,
    scenes: [],
    subscenes: [],
    npcs: [],
    player: null,
    errors: []
  };

  try {
    const { worldSetting, sceneSetting, npcSetting } = loadGameFiles(fileId, null);

    // Generate world map
    console.log('🗺️ Generating world map...');
    try {
      results.worldMap = await generateWorldMapImage(fileId);
    } catch (error) {
      results.errors.push({ type: 'worldMap', error: error.message });
    }

    // Generate scene images in parallel
    console.log(`🏞️ Generating ${sceneSetting.scenes.length} scene images...`);
    const scenePromises = sceneSetting.scenes.map(async (scene) => {
      try {
        const apiPath = await generateSceneImage(fileId, scene.id);
        return { sceneId: scene.id, sceneName: scene.name, imagePath: apiPath, success: true };
      } catch (error) {
        results.errors.push({ type: 'scene', sceneId: scene.id, error: error.message });
        return { sceneId: scene.id, sceneName: scene.name, success: false };
      }
    });
    results.scenes = await Promise.all(scenePromises);

    // Generate subscene images in parallel
    const allSubscenes = getAllSubscenes(sceneSetting);
    console.log(`🎯 Generating ${allSubscenes.length} subscene images...`);

    const subscenePromises = allSubscenes.map(async (subscene) => {
      try {
        const apiPath = await generateSubsceneImage(fileId, subscene.parentSceneId, subscene.id);
        return {
          subsceneId: subscene.id,
          subsceneName: subscene.name,
          parentSceneId: subscene.parentSceneId,
          imagePath: apiPath,
          success: true
        };
      } catch (error) {
        results.errors.push({
          type: 'subscene',
          subsceneId: subscene.id,
          parentSceneId: subscene.parentSceneId,
          error: error.message
        });
        return { subsceneId: subscene.id, subsceneName: subscene.name, success: false };
      }
    });
    results.subscenes = await Promise.all(subscenePromises);

    // Generate player image
    console.log('🎮 Generating player image...');
    try {
      results.player = await generatePlayerImage(fileId);
    } catch (error) {
      results.errors.push({ type: 'player', error: error.message });
    }

    // Generate NPC images in parallel
    const npcs = npcSetting.npcs || [];
    console.log(`👥 Generating ${npcs.length} NPC images...`);

    const npcPromises = npcs.map(async (npc) => {
      try {
        const apiPath = await generateNPCImage(fileId, npc.id);
        return {
          npcId: npc.id,
          npcName: npc.name,
          imagePath: apiPath,
          success: true
        };
      } catch (error) {
        results.errors.push({
          type: 'npc',
          npcId: npc.id,
          error: error.message
        });
        return { npcId: npc.id, npcName: npc.name, success: false };
      }
    });
    results.npcs = await Promise.all(npcPromises);

    console.log('✅ All image generation completed');
    console.log(`📊 Results: World Map: ${results.worldMap ? 'Success' : 'Failed'}, Scenes: ${results.scenes.filter(s => s.success).length}/${results.scenes.length}, Subscenes: ${results.subscenes.filter(s => s.success).length}/${results.subscenes.length}, Player: ${results.player ? 'Success' : 'Failed'}, NPCs: ${results.npcs.filter(n => n.success).length}/${results.npcs.length}`);

    return results;
  } catch (error) {
    console.error('Error generating world interaction images:', error);
    throw error;
  }
}

/**
 * Generate all scenes and subscenes images
 */
export async function generateAllScenesAndSubscenesImages(fileId) {
  const results = {
    scenes: [],
    subscenes: [],
    errors: []
  };

  try {
    const { sceneSetting } = loadGameFiles(fileId, null);

    // Generate scene images in parallel
    console.log(`🏞️ Generating ${sceneSetting.scenes.length} scene images...`);
    const scenePromises = sceneSetting.scenes.map(async (scene) => {
      try {
        const apiPath = await generateSceneImage(fileId, scene.id);
        return { sceneId: scene.id, sceneName: scene.name, imagePath: apiPath, success: true };
      } catch (error) {
        results.errors.push({ type: 'scene', sceneId: scene.id, error: error.message });
        return { sceneId: scene.id, sceneName: scene.name, success: false };
      }
    });
    results.scenes = await Promise.all(scenePromises);

    // Generate subscene images in parallel
    const allSubscenes = getAllSubscenes(sceneSetting);
    console.log(`🎯 Generating ${allSubscenes.length} subscene images...`);

    const subscenePromises = allSubscenes.map(async (subscene) => {
      try {
        const apiPath = await generateSubsceneImage(fileId, subscene.parentSceneId, subscene.id);
        return {
          subsceneId: subscene.id,
          subsceneName: subscene.name,
          parentSceneId: subscene.parentSceneId,
          imagePath: apiPath,
          success: true
        };
      } catch (error) {
        results.errors.push({
          type: 'subscene',
          subsceneId: subscene.id,
          parentSceneId: subscene.parentSceneId,
          error: error.message
        });
        return { subsceneId: subscene.id, subsceneName: subscene.name, success: false };
      }
    });
    results.subscenes = await Promise.all(subscenePromises);

    console.log('✅ All scene and subscene image generation completed');
    console.log(`📊 Results: Scenes: ${results.scenes.filter(s => s.success).length}/${results.scenes.length}, Subscenes: ${results.subscenes.filter(s => s.success).length}/${results.subscenes.length}`);

    return results;
  } catch (error) {
    console.error('Error generating scene and subscene images:', error);
    throw error;
  }
}

/**
 * Generate all NPC images
 */
export async function generateAllNPCImages(fileId) {
  const results = {
    npcs: [],
    errors: []
  };

  try {
    const { npcSetting } = loadGameFiles(fileId, null);

    // Generate NPC images in parallel
    const npcs = npcSetting.npcs || [];
    console.log(`👥 Generating ${npcs.length} NPC images...`);

    const npcPromises = npcs.map(async (npc) => {
      try {
        const apiPath = await generateNPCImage(fileId, npc.id);
        return {
          npcId: npc.id,
          npcName: npc.name,
          imagePath: apiPath,
          success: true
        };
      } catch (error) {
        results.errors.push({
          type: 'npc',
          npcId: npc.id,
          error: error.message
        });
        return { npcId: npc.id, npcName: npc.name, success: false };
      }
    });
    results.npcs = await Promise.all(npcPromises);

    console.log('✅ All NPC image generation completed');
    console.log(`📊 Results: NPCs: ${results.npcs.filter(n => n.success).length}/${results.npcs.length}`);

    return results;
  } catch (error) {
    console.error('Error generating NPC images:', error);
    throw error;
  }
}
