import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import {
  getAllSubscenes,
  getSubsceneById,
  getNPCById,
  parseJSONFromResponse
} from './utils.js';
import {
  loadWorldInteractionSession,
  saveWorldInteractionSession,
  getCurrentKeyEvent,
  addEventToSession,
  terminateEvent,
  completeCurrentKeyEvent,
  addInteractionToHistory
} from './sessionManager.js';
import {
  getEventGenerationSystemPrompt,
  generateEventGenerationPrompt,
  getNPCInteractionSystemPrompt,
  generateNPCInteractionPrompt,
  getOptionResponseSystemPrompt,
  generateOptionResponsePrompt,
  getEventChainSystemPrompt,
  generateEventChainPrompt,
  getNPCSelectionSystemPrompt,
  generateNPCSelectionPrompt
} from './prompts.js';
import { parseInteractionNarrativeSteps } from './narrativeParser.js';

dotenv.config();

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  baseURL: process.env.CLAUDE_BASE_URL
});

/**
 * Generate and distribute an event for a random NPC
 */
export async function generateAndDistributeEvent(sessionId) {
  try {
    console.log(`🎲 Generating and distributing event for session: ${sessionId}`);

    const session = loadWorldInteractionSession(sessionId);
    // Get current key event
    const currentKeyEvent = getCurrentKeyEvent(session, session.worldSetting);
    if (!currentKeyEvent) {
      throw new Error('No more key events available');
    }

    // Get all subscenes
    const allSubscenes = getAllSubscenes(session.sceneSetting);

    // Get all NPCs
    const allNpcs = session.npcSetting.npcs;

    // INTELLIGENT NPC SELECTION: Use AI to select the most suitable NPC
    console.log('🤖 Using AI to select the most suitable NPC...');

    const npcSelectionSystemPrompt = getNPCSelectionSystemPrompt();
    const npcSelectionUserPrompt = generateNPCSelectionPrompt({
      worldSetting: session.worldSetting,
      allNpcs: allNpcs,
      currentKeyEvent: currentKeyEvent,
      currentKeyEventIndex: session.currentKeyEventIndex,
      currentRound: session.currentRound,
      recentEvents: session.eventHistory.slice(-5) // Last 5 events to avoid repetition
    });

    const npcSelectionResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      system: npcSelectionSystemPrompt,
      messages: [{
        role: 'user',
        content: npcSelectionUserPrompt
      }]
    });

    const npcSelectionText = npcSelectionResponse.content[0].text;
    let selectedNpcData;

    try {
      selectedNpcData = parseJSONFromResponse(npcSelectionText);
      console.log(`✅ AI selected NPC: ${selectedNpcData.selectedNpcId}`);
      console.log(`📝 Reason: ${selectedNpcData.reason}`);
    } catch (error) {
      console.warn('⚠️ Failed to parse NPC selection, falling back to random selection');
      selectedNpcData = {
        selectedNpcId: allNpcs[Math.floor(Math.random() * allNpcs.length)].id,
        reason: 'Random fallback due to parsing error'
      };
    }

    // Find the selected NPC
    const selectedNPC = allNpcs.find(npc => npc.id === selectedNpcData.selectedNpcId);

    if (!selectedNPC) {
      console.warn(`⚠️ Selected NPC ${selectedNpcData.selectedNpcId} not found, using random selection`);
      const randomNPC = allNpcs[Math.floor(Math.random() * allNpcs.length)];
      selectedNpcData.selectedNpcId = randomNPC.id;
      selectedNpcData.reason = 'Fallback to random due to invalid selection';
    }

    const finalNPC = selectedNPC || allNpcs.find(npc => npc.id === selectedNpcData.selectedNpcId);
    console.log(`🎯 Final selected NPC: ${finalNPC.name} (${finalNPC.id})`);

    const worldSetting = session.worldSetting;
    // Generate event using Claude
    const systemPrompt = getEventGenerationSystemPrompt();
    const userPrompt = generateEventGenerationPrompt({
      worldSetting,
      npc: finalNPC,
      currentKeyEvent,
      currentKeyEventIndex: session.currentKeyEventIndex,
      availableSubscenes: allSubscenes,
      currentRound: session.currentRound,
      completedEvents: session.eventHistory.slice(-5) // Last 5 events
    });

    console.log('🤖 Calling Claude to generate event...');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 20000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });

    const responseText = response.content[0].text;
    console.log('✅ Received event from Claude');
    console.log('📝 Response length:', responseText.length);
    console.log('📝 Response preview:', responseText.substring(0, 500));

    // Parse event data
    let eventData;
    try {
      eventData = parseJSONFromResponse(responseText);
    } catch (error) {
      console.error('❌ JSON parsing failed. Full response text:', responseText);
      throw new Error(`Failed to parse event JSON: ${error.message}`);
    }

    // Create event object
    const event = {
      eventId: randomUUID(),
      ...eventData,
      status: 'active',
      createdAt: new Date().toISOString(),
      round: session.currentRound,
      npcSelectionReason: selectedNpcData.reason // Store the AI's reasoning
    };

    // Add event to session
    addEventToSession(session, event);

    // Add NPC to the subscene if not already there
    const subscene = getSubsceneById(session.sceneSetting, event.targetSubsceneId);
    if (subscene && !subscene.npcs.includes(event.targetNpcId)) {
      subscene.npcs.push(event.targetNpcId);
    }

    console.log(`✅ Event distributed: ${event.eventTitle}`);
    console.log(`📌 NPC Selection Reason: ${selectedNpcData.reason}`);

    return {
      event,
      npc: finalNPC,
      subscene,
      npcSelectionReason: selectedNpcData.reason
    };
  } catch (error) {
    console.error('Error generating and distributing event:', error);
    throw error;
  }
}

/**
 * Interact with a distributed NPC (get dialogue and options)
 */
export async function interactWithNPC(sessionId, eventId) {
  try {
    console.log(`💬 Interacting with NPC for event: ${eventId}`);

    const session = loadWorldInteractionSession(sessionId);

    // Find the event
    const event = session.activeEvents.find(e => e.eventId === eventId);
    if (!event) {
      throw new Error(`Active event not found: ${eventId}`);
    }

    // Get NPC and subscene
    const npc = getNPCById(session.npcSetting, event.targetNpcId);
    const subscene = getSubsceneById(session.sceneSetting, event.targetSubsceneId);

    if (!npc) {
      throw new Error(`NPC not found: ${event.targetNpcId}`);
    }
    const worldSetting = session.worldSetting;
    // Generate interaction using Claude
    const systemPrompt = getNPCInteractionSystemPrompt();
    const userPrompt = generateNPCInteractionPrompt({
      worldSetting,
      npc,
      event,
      player: session.player,
      subscene,
      allNpcs: session.npcSetting.npcs // Pass all NPCs
    });

    console.log('🤖 Calling Claude to generate NPC interaction...');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 10000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });

    const responseText = response.content[0].text;
    console.log('✅ Received interaction from Claude');

    // Parse interaction using narrative format
    const narrativeData = parseInteractionNarrativeSteps(responseText, npc, session.npcSetting.npcs);

    // Extract options from choice steps
    const choiceSteps = narrativeData.steps.filter(step => step.type === 'choice');
    const options = choiceSteps.length > 0 ? choiceSteps[0].options : [];

    // Store interaction data in event for later reference
    event.lastInteraction = {
      narrativeSteps: narrativeData.steps,
      options: options,
      timestamp: new Date().toISOString()
    };

    // Add to interaction history for chat display
    addInteractionToHistory(session, {
      type: 'npc_dialogue',
      eventId: event.eventId,
      eventTitle: event.eventTitle,
      npcId: npc.id,
      npcName: npc.name,
      subsceneId: subscene.id,
      subsceneName: subscene.name,
      narrativeSteps: narrativeData.steps,
      round: session.currentRound
    });

    saveWorldInteractionSession(session);

    return {
      eventId: event.eventId,
      eventTitle: event.eventTitle,
      npc: {
        id: npc.id,
        name: npc.name,
        image: npc.images?.base || null
      },
      subscene: {
        id: subscene.id,
        name: subscene.name,
        parentSceneName: subscene.parentSceneName
      },
      narrativeSteps: narrativeData.steps,
      options: options,
      totalSteps: narrativeData.totalSteps
    };
  } catch (error) {
    console.error('Error interacting with NPC:', error);
    throw error;
  }
}

/**
 * Generate NPC's response to player's selected option
 */
export async function generateOptionResponse(sessionId, eventId, optionId) {
  try {
    console.log(`💬 Generating NPC response for option: ${optionId}`);

    const session = loadWorldInteractionSession(sessionId);

    // Find the event
    const event = session.activeEvents.find(e => e.eventId === eventId);
    if (!event) {
      throw new Error(`Active event not found: ${eventId}`);
    }

    // Get NPC and subscene
    const npc = getNPCById(session.npcSetting, event.targetNpcId);
    const subscene = getSubsceneById(session.sceneSetting, event.targetSubsceneId);

    if (!npc) {
      throw new Error(`NPC not found: ${event.targetNpcId}`);
    }

    // Find the full option data from last interaction
    let selectedOptionData = null;
    if (event.lastInteraction && event.lastInteraction.options) {
      selectedOptionData = event.lastInteraction.options.find(opt => opt.optionId === optionId);
    }

    if (!selectedOptionData) {
      selectedOptionData = { optionId, text: optionId };
    }
    const worldSetting = session.worldSetting;
    // Generate response using Claude
    const systemPrompt = getOptionResponseSystemPrompt();
    const userPrompt = generateOptionResponsePrompt({
      worldSetting,
      npc,
      event,
      player: session.player,
      subscene,
      selectedOption: selectedOptionData,
      allNpcs: session.npcSetting.npcs // Pass all NPCs
    });

    console.log('🤖 Calling Claude to generate NPC response...');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 20000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });

    const responseText = response.content[0].text;
    console.log('✅ Received NPC response from Claude');

    // Parse response using narrative format
    const narrativeData = parseInteractionNarrativeSteps(responseText, npc, session.npcSetting.npcs);

    // Store response in event
    event.optionResponse = {
      selectedOption: selectedOptionData,
      narrativeSteps: narrativeData.steps,
      timestamp: new Date().toISOString()
    };

    saveWorldInteractionSession(session);

    return {
      eventId: event.eventId,
      selectedOption: selectedOptionData,
      narrativeSteps: narrativeData.steps,
      totalSteps: narrativeData.totalSteps,
      npc: {
        id: npc.id,
        name: npc.name,
        image: npc.images?.base || null
      }
    };
  } catch (error) {
    console.error('Error generating option response:', error);
    throw error;
  }
}

/**
 * Handle player's option selection and terminate event
 */
export async function selectOption(sessionId, eventId, optionId) {
  try {
    console.log(`✅ Player selected option: ${optionId} for event: ${eventId}`);

    const session = loadWorldInteractionSession(sessionId);

    // Find the event
    const event = session.activeEvents.find(e => e.eventId === eventId);
    if (!event) {
      throw new Error(`Active event not found: ${eventId}`);
    }

    // Find the full option data from last interaction
    let selectedOptionData = null;
    if (event.lastInteraction && event.lastInteraction.options) {
      selectedOptionData = event.lastInteraction.options.find(opt => opt.optionId === optionId);
    }

    if (!selectedOptionData) {
      selectedOptionData = { optionId, text: optionId };
    }

    // Generate NPC's response to the selected option
    console.log('📝 Generating NPC response to player choice...');
    const npc = getNPCById(session.npcSetting, event.targetNpcId);
    const subscene = getSubsceneById(session.sceneSetting, event.targetSubsceneId);
    const worldSetting = session.worldSetting;
    const systemPrompt = getOptionResponseSystemPrompt();
    const userPrompt = generateOptionResponsePrompt({
      worldSetting,
      npc,
      event,
      player: session.player,
      subscene,
      selectedOption: selectedOptionData,
      allNpcs: session.npcSetting.npcs // Pass all NPCs
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 20000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });

    const responseText = response.content[0].text;
    const narrativeData = parseInteractionNarrativeSteps(responseText, npc, session.npcSetting.npcs);

    // Store the selected option and response
    event.selectedOption = optionId;
    event.selectedOptionData = selectedOptionData;
    event.optionResponse = {
      narrativeSteps: narrativeData.steps,
      timestamp: new Date().toISOString()
    };

    // Add player's choice and NPC response to interaction history
    addInteractionToHistory(session, {
      type: 'player_choice',
      eventId: event.eventId,
      eventTitle: event.eventTitle,
      npcId: npc.id,
      npcName: npc.name,
      subsceneId: subscene.id,
      subsceneName: subscene.name,
      selectedOption: selectedOptionData,
      npcResponse: narrativeData.steps,
      round: session.currentRound
    });

    saveWorldInteractionSession(session);

    // Terminate the event
    const completedEvent = terminateEvent(session, eventId);

    // Reload session (it was saved in terminateEvent)
    const updatedSession = loadWorldInteractionSession(sessionId);
    const npcSetting = session.npcSetting;
    // Check if we should generate a new event or if key event is completed
    const shouldContinue = await checkEventChainAndKeyEvent(
      updatedSession,
      worldSetting,
      npcSetting,
      completedEvent,
      selectedOptionData || { optionId, text: optionId }
    );

    // If shouldGenerateNewEvent is true, automatically distribute a new event
    let newEvent = null;
    if (shouldContinue.shouldGenerateNewEvent) {
      console.log('🎲 Auto-generating new event based on AI decision...');
      try {
        const eventResult = await generateAndDistributeEvent(sessionId);
        newEvent = {
          event: eventResult.event,
          npc: {
            id: eventResult.npc.id,
            name: eventResult.npc.name,
            image: eventResult.npc.images?.base || null
          },
          subscene: eventResult.subscene
        };
        console.log(`✅ New event auto-generated: ${newEvent.event.eventTitle}`);
      } catch (error) {
        console.error('Error auto-generating event:', error);
      }
    }

    return {
      success: true,
      message: 'Option selected and event completed',
      completedEvent,
      newEvent,
      keyEventCompleted: shouldContinue.keyEventCompleted
    };
  } catch (error) {
    console.error('Error selecting option:', error);
    throw error;
  }
}

/**
 * Check if we should generate new event or complete key event
 */
async function checkEventChainAndKeyEvent(session, worldSetting, npcSetting, completedEvent, selectedOption) {
  try {
    const currentKeyEvent = getCurrentKeyEvent(session, session.worldSetting);

    // For demo purposes, we'll use a simple prompt to Claude to decide
    const systemPrompt = getEventChainSystemPrompt();
    const userPrompt = generateEventChainPrompt({
      worldSetting,
      currentKeyEvent,
      currentKeyEventIndex: session.currentKeyEventIndex,
      completedEvent,
      playerChoice: selectedOption,
      allNpcs: npcSetting.npcs
    });

    console.log('🤖 Calling Claude to check event chain...');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 10000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });

    const responseText = response.content[0].text;
    const decision = parseJSONFromResponse(responseText);

    console.log('📊 Event chain decision:', decision);

    // If key event is completed, mark it and move to next
    if (decision.keyEventCompleted) {
      completeCurrentKeyEvent(session, worldSetting);
      console.log('🎉 Key event completed!');
    }

    return {
      shouldGenerateNewEvent: decision.shouldGenerateNew && !decision.keyEventCompleted,
      keyEventCompleted: decision.keyEventCompleted,
      nextEventSuggestion: decision.nextEventSuggestion,
      decision
    };
  } catch (error) {
    console.error('Error checking event chain:', error);
    // Default to not generating new event
    return {
      shouldGenerateNewEvent: false,
      keyEventCompleted: false,
      decision: null
    };
  }
}

/**
 * Get all active events with NPC info
 */
export function getActiveEventsWithInfo(sessionId) {
  try {
    const session = loadWorldInteractionSession(sessionId);

    const eventsWithInfo = session.activeEvents.map(event => {
      const npc = getNPCById(session.npcSetting, event.targetNpcId);
      const subscene = getSubsceneById(session.sceneSetting, event.targetSubsceneId);

      return {
        ...event,
        npc: npc ? {
          id: npc.id,
          name: npc.name,
          image: npc.images?.base || null
        } : null,
        subscene: subscene ? {
          id: subscene.id,
          name: subscene.name,
          parentSceneId: subscene.parentSceneId,
          parentSceneName: subscene.parentSceneName
        } : null
      };
    });

    return eventsWithInfo;
  } catch (error) {
    console.error('Error getting active events:', error);
    throw error;
  }
}
