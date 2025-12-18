/**
 * Parse narrative steps from NPC interaction response
 * This follows the same format as visualGameService.js
 * @param {string} response - The LLM response text
 * @param {object} npc - The current NPC (for backward compatibility)
 * @param {array} npcList - List of all NPCs to lookup speaker names correctly
 */
export function parseInteractionNarrativeSteps(response, npc, npcList = []) {
  const steps = [];
  const lines = response.split('\n');

  let currentStep = null;
  let currentChoice = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Narration
    if (trimmedLine.startsWith('[NARRATION:')) {
      if (currentStep) steps.push(currentStep);
      currentStep = {
        type: 'narration',
        content: trimmedLine.replace(/^\[NARRATION:\s*/, '').replace(/\]$/, '').trim()
      };
    }
    // Dialogue (NPC only in this context)
    else if (trimmedLine.startsWith('[DIALOGUE:')) {
      if (currentStep) steps.push(currentStep);
      const match = trimmedLine.match(/^\[DIALOGUE:\s*([^,]+),\s*"([^"]+)"\s*\]/);
      if (match) {
        const speakerId = match[1].trim();
        const dialogueContent = match[2].trim();

        // Find the correct NPC by speakerId
        const speakerNpc = npcList.find(n => n.id === speakerId) || npc;
        const speakerName = speakerNpc ? speakerNpc.name : speakerId;

        currentStep = {
          type: 'dialogue',
          npcId: speakerId,
          content: dialogueContent,
          speakerName: speakerName,
          npcImages: speakerNpc ? (speakerNpc.images || {}) : {},
          activeImage: speakerNpc ? (speakerNpc.images?.base || null) : null
        };
      }
    }
    // Choice start
    else if (trimmedLine.startsWith('[CHOICE:')) {
      if (currentStep) steps.push(currentStep);
      currentChoice = {
        type: 'choice',
        title: trimmedLine.replace(/^\[CHOICE:\s*/, '').replace(/\]$/, '').trim(),
        description: '',
        options: []
      };
      currentStep = currentChoice;
    }
    // Option
    else if (trimmedLine.startsWith('[OPTION:') && currentChoice) {
      const optionText = trimmedLine.replace(/^\[OPTION:\s*/, '').replace(/\]$/, '').trim();
      currentChoice.options.push({
        optionId: `option_${currentChoice.options.length + 1}`,
        text: optionText,
        type: 'unknown',
        consequence: ''
      });
    }
    // End choice
    else if (trimmedLine === '[END_CHOICE]' && currentChoice) {
      steps.push(currentChoice);
      currentStep = null;
      currentChoice = null;
    }
    // Description text for choice
    else if (currentChoice && trimmedLine && !trimmedLine.startsWith('[')) {
      currentChoice.description += (currentChoice.description ? ' ' : '') + trimmedLine;
    }
    // Continuation of current step
    else if (currentStep && !currentChoice && trimmedLine && !trimmedLine.startsWith('[')) {
      currentStep.content += ' ' + trimmedLine;
    }
  }

  // Push last step if exists
  if (currentStep && !currentChoice) {
    steps.push(currentStep);
  }

  return {
    steps,
    totalSteps: steps.length
  };
}
