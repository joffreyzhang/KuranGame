export function parseNarrativeSteps(responseText) {

  const steps = [];
  let currentIndex = 0;
  let shouldGenerateMission = false; // Track if mission should be generated

  // Split the response into lines for processing
  const lines = responseText.split('\n');
  let inChoice = false;
  let currentChoice = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      continue;
    }

    // Detect [MISSION: true/false] tag
    const missionMatch = line.match(/^\[MISSION:\s*(true|false)\]$/i);
    if (missionMatch) {
      shouldGenerateMission = missionMatch[1].toLowerCase() === 'true';
      continue; // Don't add this as a step, just flag it
    }

    // Detect [NARRATION: ...] format
    const narrationMatch = line.match(/^\[NARRATION:\s*(.+?)\]$/);
    if (narrationMatch) {
      steps.push({
        id: `step_${currentIndex++}`,
        type: 'narration',
        text: narrationMatch[1].trim()
      });
      continue;
    }

    // Detect [DIALOGUE: character_id, "text"] format
    const dialogueMatch = line.match(/^\[DIALOGUE:\s*([^,]+),\s*"(.+?)"\]$/);
    if (dialogueMatch) {
      const characterId = dialogueMatch[1].trim();
      const text = dialogueMatch[2].trim();
      steps.push({
        id: `step_${currentIndex++}`,
        type: 'dialogue',
        characterId,
        text
      });
      continue;
    }

    // Detect [HINT: text] with optional changes
    const hintMatch = line.match(/^\[HINT:\s*(.+?)\]$/);
    if (hintMatch) {
      const hintText = hintMatch[1].trim();
      const step = {
        id: `step_${currentIndex++}`,
        type: 'hint',
        text: hintText,
        changes: [],
        relationshipChanges: [],
        itemChanges: []
      };

      // Look ahead for [CHANGE: ...] markers
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j].trim();

        // Match attribute change: [CHANGE: 角色名字, 属性名, +/-数值]
        const attrChangeMatch = nextLine.match(/^\[CHANGE:\s*([^,]+),\s*([^,]+),\s*([+-]?\d+)\]$/);

        // Match relationship change: [CHANGE: RELATIONSHIP, NPC名字, +/-数值]
        const relChangeMatch = nextLine.match(/^\[CHANGE:\s*RELATIONSHIP,\s*([^,]+),\s*([+-]?\d+)\]$/);

        // Match item change: [CHANGE: 道具名称, 获得/丢失, 数量]
        const itemChangeMatch = nextLine.match(/^\[CHANGE:\s*([^,]+),\s*(获得|丢失),\s*(\d+)\]$/);

        if (attrChangeMatch) {
          // Attribute change
          step.changes.push({
            characterId: attrChangeMatch[1].trim(),
            attribute: attrChangeMatch[2].trim(),
            delta: parseInt(attrChangeMatch[3])
          });
          i = j; // Skip processed lines
          j++;
        } else if (relChangeMatch) {
          // Relationship change
          step.relationshipChanges.push({
            npcName: relChangeMatch[1].trim(),
            delta: parseInt(relChangeMatch[2])
          });
          i = j; // Skip processed lines
          j++;
        } else if (itemChangeMatch) {
          // Item change
          step.itemChanges.push({
            itemName: itemChangeMatch[1].trim(),
            action: itemChangeMatch[2].trim(), // 获得 or 丢失
            quantity: parseInt(itemChangeMatch[3])
          });
          i = j; // Skip processed lines
          j++;
        } else {
          break;
        }
      }

      steps.push(step);
      continue;
    }

    // Detect [CHOICE: title] format
    const choiceMatch = line.match(/^\[CHOICE:\s*(.+?)\]$/);
    if (choiceMatch) {
      inChoice = true;
      currentChoice = {
        id: `step_${currentIndex++}`,
        type: 'choice',
        title: choiceMatch[1].trim(),
        text: '',
        options: []
      };
      continue;
    }

    // Detect [OPTION: text] format within a choice
    const optionMatch = line.match(/^\[OPTION:\s*(.+?)\]$/);
    if (optionMatch && inChoice && currentChoice) {
      currentChoice.options.push({
        text: optionMatch[1].trim(),
        nextId: `choice_${currentChoice.options.length + 1}`
      });
      continue;
    }

    // Detect [END_CHOICE] to close the choice block
    if (line === '[END_CHOICE]' && inChoice) {
      if (currentChoice && currentChoice.options.length > 0) {
        steps.push(currentChoice);
      }
      inChoice = false;
      currentChoice = null;
      continue;
    }

    // If we're in a choice and it's not a special marker, it's the choice description text
    if (inChoice && currentChoice && !line.startsWith('[')) {
      currentChoice.text += (currentChoice.text ? ' ' : '') + line;
      continue;
    }

    // Regular text - treat as narration if not caught by other patterns
    if (!line.startsWith('[')) {
      // Check if this looks like dialogue (contains quotes and attribution)
      const naturalDialogueMatch = line.match(/^([^:：]+)[：:]?"(.+?)"$/);
      if (naturalDialogueMatch) {
        const characterId = naturalDialogueMatch[1].trim();
        const text = naturalDialogueMatch[2].trim();
        steps.push({
          id: `step_${currentIndex++}`,
          type: 'dialogue',
          characterId,
          text
        });
      } else {
        // Treat as narration
        steps.push({
          id: `step_${currentIndex++}`,
          type: 'narration',
          text: line
        });
      }
    }
  }

  // Close any open choice block
  if (inChoice && currentChoice && currentChoice.options.length > 0) {
    steps.push(currentChoice);
  }

  return {
    steps,
    totalSteps: steps.length,
    shouldGenerateMission // Include mission flag in return value
  };
}

/**
 * Extract player status changes from parsed steps
 * @param {Array} steps - Parsed narrative steps
 * @returns {Object} - Aggregated status changes
 */
export function extractStatusChanges(steps) {
  const changes = {
    attributes: {},
    items: [],
    relationships: {}
  };

  steps.forEach(step => {
    if (step.type === 'hint') {
      // Handle attribute changes
      if (step.changes && step.changes.length > 0) {
        step.changes.forEach(change => {
          if (change.characterId === '玩家' || change.characterId === 'player' || change.characterId === 'hero') {
            // Aggregate player attribute changes
            if (!changes.attributes[change.attribute]) {
              changes.attributes[change.attribute] = 0;
            }
            changes.attributes[change.attribute] += change.delta;
          } else {
            // Track NPC relationship changes (legacy format)
            if (!changes.relationships[change.characterId]) {
              changes.relationships[change.characterId] = 0;
            }
            changes.relationships[change.characterId] += change.delta;
          }
        });
      }

      // Handle relationship changes (new format)
      if (step.relationshipChanges && step.relationshipChanges.length > 0) {
        step.relationshipChanges.forEach(relChange => {
          if (!changes.relationships[relChange.npcName]) {
            changes.relationships[relChange.npcName] = 0;
          }
          changes.relationships[relChange.npcName] += relChange.delta;
        });
      }

      // Handle item changes (new format)
      if (step.itemChanges && step.itemChanges.length > 0) {
        step.itemChanges.forEach(itemChange => {
          changes.items.push({
            name: itemChange.itemName,
            action: itemChange.action, // 获得 or 丢失
            quantity: itemChange.quantity
          });
        });
      }
    }
  });

  return changes;
}

/**
 * Convert old format response to new step format (backwards compatibility)
 * @param {string} responseText - Old format response
 * @returns {Object} - Steps in new format
 */
export function convertLegacyToSteps(responseText) {
  console.log('🔄 Converting legacy format to steps...');

  const steps = [];
  let currentIndex = 0;

  // Split into paragraphs
  const paragraphs = responseText.split('\n\n').filter(p => p.trim());

  paragraphs.forEach(paragraph => {
    const trimmed = paragraph.trim();

    // Check for action markers (old format)
    if (trimmed.includes('[ACTION:')) {
      const actionMatches = trimmed.matchAll(/\[ACTION:\s*(.+?)\]/g);
      const options = [];
      let choiceText = trimmed.replace(/\[ACTION:.+?\]/g, '').trim();

      for (const match of actionMatches) {
        options.push({
          text: match[1].trim(),
          nextId: `action_${options.length + 1}`
        });
      }

      if (options.length > 0) {
        steps.push({
          id: `step_${currentIndex++}`,
          type: 'choice',
          title: '接下来的行动',
          text: choiceText || '你该如何行动？',
          options
        });
      }
    } else {
      // Treat as narration
      steps.push({
        id: `step_${currentIndex++}`,
        type: 'narration',
        text: trimmed
      });
    }
  });

  return {
    steps,
    totalSteps: steps.length
  };
}

export default {
  parseNarrativeSteps,
  extractStatusChanges,
  convertLegacyToSteps
};
