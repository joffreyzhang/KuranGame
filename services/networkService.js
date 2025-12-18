import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadGameData } from './gameInitializationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GAME_DATA_DIR = path.join(__dirname, '..', 'public', 'game_data');
const GAME_SAVES_DIR = path.join(__dirname, '..', 'game_saves');

/**
 * Get the path to the scenes JSON file for a session
 */
function getScenesFilePath(sessionId) {
  // First try game_saves directory (session-specific)
  const savesPath = path.join(GAME_SAVES_DIR, sessionId, `scenes_${sessionId}.json`);
  if (fs.existsSync(savesPath)) {
    return savesPath;
  }

  // Then try public/game_data directory
  const dataPath = path.join(GAME_DATA_DIR, sessionId, `scenes_${sessionId}.json`);
  if (fs.existsSync(dataPath)) {
    return dataPath;
  }

  return null;
}

/**
 * Load scenes data for a session
 */
function loadScenesData(sessionId) {
  const filePath = getScenesFilePath(sessionId);
  if (!filePath) {
    console.warn(`⚠️ Scenes file not found for session: ${sessionId}`);
    return null;
  }

  try {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileData);
  } catch (error) {
    console.error(`Error loading scenes data for session ${sessionId}:`, error);
    return null;
  }
}

/**
 * Save scenes data for a session
 */
function saveScenesData(sessionId, scenesData) {
  const filePath = getScenesFilePath(sessionId);
  if (!filePath) {
    console.warn(`⚠️ Cannot save scenes data - file path not found for session: ${sessionId}`);
    return false;
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(scenesData, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error saving scenes data for session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Sync player's network relationships to scene NPC data
 * Updates the relationship value for each NPC in the scenes JSON file
 */
export function syncNetworkToScenes(sessionId, network) {
  console.log('🔄 Syncing network relationships to scene data...');

  const scenesData = loadScenesData(sessionId);
  if (!scenesData) {
    console.warn('⚠️ No scenes data found, cannot sync relationships');
    return false;
  }

  let synced = false;

  // Iterate through all scenes
  for (const [sceneId, sceneData] of Object.entries(scenesData)) {
    if (!sceneData.npcs || !Array.isArray(sceneData.npcs)) {
      continue;
    }

    // Update each NPC's relationship value
    sceneData.npcs.forEach(npc => {
      // Check if this NPC exists in the player's network
      if (network[npc.name]) {
        const newRelationship = network[npc.name].relationship || 0;
        if (npc.relationships !== newRelationship) {
          console.log(`  ✓ Updated ${npc.name} relationship: ${npc.relationships} → ${newRelationship}`);
          npc.relationships = newRelationship;
          synced = true;
        }
      }
    });
  }

  if (synced) {
    saveScenesData(sessionId, scenesData);
    console.log('✅ Network relationships synced to scene data');
  } else {
    console.log('⚠️ No relationship changes to sync');
  }

  return synced;
}

/**
 * Get the full relationship network for a player
 * Returns network data with NPC details from scenes
 */
export function getPlayerNetwork(sessionId, playerData) {
  console.log('🔍 Building player relationship network...');

  const network = playerData.network || {};
  const scenesData = loadScenesData(sessionId);

  if (!scenesData) {
    // Return basic network without NPC details
    return Object.entries(network).map(([npcName, npcData]) => ({
      name: npcName,
      relationship: npcData.relationship || 0
    }));
  }

  // Build enriched network with NPC details from scenes
  const enrichedNetwork = [];
  const processedNPCs = new Set();

  // Iterate through all scenes to find NPC details
  for (const [sceneId, sceneData] of Object.entries(scenesData)) {
    if (!sceneData.npcs || !Array.isArray(sceneData.npcs)) {
      continue;
    }

    sceneData.npcs.forEach(npc => {
      // Skip if we've already processed this NPC
      if (processedNPCs.has(npc.name)) {
        return;
      }

      // Get relationship value from player's network
      const relationshipData = network[npc.name];
      const relationship = relationshipData?.relationship || npc.relationships || 0;

      enrichedNetwork.push({
        id: npc.id,
        name: npc.name,
        age: npc.age,
        gender: npc.gender,
        job: npc.job,
        description: npc.description,
        icon: npc.icon,
        type: npc.type,
        relationship: relationship,
        scene: sceneId,
        sceneName: sceneData.name
      });

      processedNPCs.add(npc.name);
    });
  }

  console.log(`✅ Built network with ${enrichedNetwork.length} NPCs`);
  return enrichedNetwork;
}

/**
 * Get relationship network grouped by relationship level
 */
export function getNetworkByLevel(sessionId, playerData) {
  const network = getPlayerNetwork(sessionId, playerData);

  // Group by relationship levels
  const grouped = {
    allies: [],      // relationship >= 60
    friends: [],     // 30 <= relationship < 60
    neutral: [],     // -30 < relationship < 30
    unfriendly: [],  // -60 < relationship <= -30
    enemies: []      // relationship <= -60
  };

  network.forEach(npc => {
    const rel = npc.relationship;
    if (rel >= 60) {
      grouped.allies.push(npc);
    } else if (rel >= 30) {
      grouped.friends.push(npc);
    } else if (rel > -30) {
      grouped.neutral.push(npc);
    } else if (rel > -60) {
      grouped.unfriendly.push(npc);
    } else {
      grouped.enemies.push(npc);
    }
  });

  return grouped;
}
