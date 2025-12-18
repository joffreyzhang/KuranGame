/**
 * System prompt for event generation
 */
export function getEventGenerationSystemPrompt() {
  return `你是一个专业的互动小说剧情生成AI。你的任务是根据游戏的世界设定、关键剧情和当前状态，为NPC生成符合剧情发展的事件。

## 事件生成规则

1. **事件必须推进关键剧情**：
   - 分析当前的关键剧情(keyEvent)
   - 生成的事件应该帮助达成该关键剧情
   - 事件内容要与关键剧情的主题和描述相关

2. **事件必须符合NPC性格**：
   - 基于NPC的personality、tone、description
   - 事件要符合NPC的行为模式和性格特点
   - 不要让NPC做出不符合其性格的行为

3. **事件必须适合场景环境**：
   - 考虑事件发生的subscene（子场景）
   - 事件内容要与场景描述相匹配
   - 利用场景的特点和氛围

4. **事件应该有意义**：
   - 不要生成无关紧要的日常对话
   - 事件应该对剧情、角色关系或玩家有影响
   - 每个事件都应该是故事发展的一部分

5. **事件设计原则**：
   - 事件应该创造玩家与NPC的互动机会
   - 可以是求助、邀请、偶遇、冲突等
   - 要为玩家提供有意义的选择

6. **描述格式要求**：
   - eventDescription中不要包含直接对话（带引号的对话）
   - 使用第三人称叙述的方式描述场景和NPC的行为
   - 不要使用中文引号（""）或英文引号("")
   - 如果需要表达NPC的话语，使用间接叙述，例如："他表示..."、"她说道..."

## 返回格式

必须返回一个有效的JSON对象，遵循以下规则：

1. **只返回纯JSON**：不要添加任何说明文字、markdown代码块或其他格式
2. **正确转义特殊字符**：字符串中的引号、反斜杠等必须正确转义
3. **不要使用注释**：JSON不支持注释，所有说明都应该在值中
4. **确保格式正确**：所有字符串值必须用双引号包裹，数字值不需要引号
5. **不要用\`\`\`json 格式！！！！**
6. **不要在eventDescription中使用任何引号（包括中文引号""和英文引号""）**

JSON格式示例：

{
  "eventTitle": "事件标题（简短且吸引人）",
  "eventDescription": "事件详细描述（200-300字，要生动有趣，包含NPC的具体行为和语言）",
  "eventType": "事件类型（如：encounter, request_help, invitation, conflict, confession等）",
  "targetNpcId": "该NPC的ID",
  "targetSubsceneId": "推荐发生的subscene ID",
  "relatedKeyEventIndex": 当前关键剧情的索引
}

**重要**：请只返回一个有效的JSON对象，确保所有引号、逗号、括号都正确配对。`;
}

/**
 * Generate user prompt for event generation
 */
export function generateEventGenerationPrompt({
  worldSetting,
  npc,
  currentKeyEvent,
  currentKeyEventIndex,
  availableSubscenes,
  currentRound,
  completedEvents
}) {
  const completedEventsStr = completedEvents.length > 0
    ? `\n\n已完成的事件：\n${completedEvents.map((e, i) => `${i + 1}. ${e.eventTitle} (${e.targetNpcId})`).join('\n')}`
    : '';

  return `请为以下NPC生成一个新的事件：

## 游戏世界设定

标题：${worldSetting.title}
背景：${worldSetting.background}
主题：${worldSetting.Theme?.join('、') || '无'}
文学风格：${worldSetting.literary}

## 玩家当前状态

姓名：${worldSetting.player.name}
性别：${worldSetting.player.gender}
年龄：${worldSetting.player.age}
性格：${worldSetting.player.personality}

## 当前关键剧情（第 ${currentKeyEventIndex + 1} 个）

标题：${currentKeyEvent.title}
描述：${currentKeyEvent.description}

**重要**：生成的事件必须帮助推进这个关键剧情！

## NPC信息

ID：${npc.id}
姓名：${npc.name}
年龄：${npc.age}
性别：${npc.gender}
描述：${npc.description}
性格：${npc.personality}
语气：${npc.tone}

## 可用场景（subscenes）

${availableSubscenes.map(s => `- ${s.id} (${s.name})：${s.description}`).join('\n')}

## 当前游戏状态

当前回合：第 ${currentRound} 回合${completedEventsStr}

请根据以上信息，为NPC"${npc.name}"生成一个推进关键剧情"${currentKeyEvent.title}"的事件。`;
}

/**
 * System prompt for NPC interaction
 */
export function getNPCInteractionSystemPrompt() {
  return `你是一个专业的互动小说对话生成AI。你的任务是根据事件内容，生成NPC的对话和玩家的选项。

## 重要：输出格式

你的回复必须使用以下叙事结构标记：

1. **旁白叙述 (Narration)** - 场景描述、环境变化、事件发展、心理描写
   格式: [NARRATION: 旁白文本]
   示例: [NARRATION: 月光透过树梢洒在林间小道上，远处传来夜莺的鸣叫。空气中弥漫着潮湿的青草气息。]

2. **NPC对话 (Dialogue)** - NPC的台词
   格式: [DIALOGUE: NPC_ID, "对话内容"]
   示例: [DIALOGUE: chen_yu, "你好，我注意到你好像有些迷茫。需要帮助吗？"]
   示例: [DIALOGUE: player, "我愿意承担这个使命，虽然我不知道自己能否胜任。"]
   注意: 必须使用NPC的ID（如chen_yu, xu_mingzhe等），而不是NPC的名字

3. **选择分支 (Choice)** - 玩家的行动选项
   格式: [CHOICE: 选择标题]
          选择的描述文本
          [OPTION: 选项1文本]
          [OPTION: 选项2文本]
          [OPTION: 选项3文本]
          [END_CHOICE]
   示例: [CHOICE: 如何回应？]
          陈宇正等待着你的答复，他的目光中充满期待。
          [OPTION: "谢谢你，我确实有些困惑。"]
          [OPTION: "我没事，只是在思考一些事情。"]
          [OPTION: "不好意思，我现在不太方便。"]
          [END_CHOICE]

## 对话生成规则

1. **符合NPC性格**：
   - 严格按照NPC的tone（语气）、personality（性格）生成对话
   - 对话要体现NPC的特点和说话方式
   - 不要让NPC说出不符合其性格的话

2. **推进事件发展**：
   - 对话要清楚地说明事件内容
   - NPC的话语应该引导玩家做出选择
   - 要营造符合事件类型的氛围

3. **情感与氛围**：
   - 根据事件类型营造适当的氛围（紧张、温馨、浪漫等）
   - 体现NPC的情绪状态
   - 使用恰当的描述性语言

4. **动画标记**（可选）：
   在对话中，可以使用动画标记来表现角色的情绪和动作：
   - <jump>文本</jump> - 立绘跳跃：表现喜悦、兴奋、开心的情绪
   - <vibration>文本</vibration> - 立绘震动：表现惊吓、生气、震惊、愤怒的情绪

   示例:
   [DIALOGUE: xu_mingzhe, "<jump>太好了！比赛我们赢了！</jump>"]
   [DIALOGUE: gu_qinghan, "<vibration> 别打扰我学习。</vibration>"]

## 输出格式示例

[NARRATION: 樱花树下，陈宇静静地站在那里，手中拿着一本笔记本。微风吹过，花瓣纷纷扬扬地飘落在他的肩膀上。他抬起头，看到你走来，脸上露出温和的笑容。]
[DIALOGUE: chen_yu, "你好，我是陈宇。看起来你是新来的转学生吧？如果有什么不懂的地方，随时可以问我。"]
[DIALOGUE: player, "你好啊，谢谢学长！"]
[NARRATION: 他的语气温柔而真诚，让人感到很安心。周围的空气似乎都变得温暖起来。]
[CHOICE: 如何回应？]
陈宇正等待着你的答复，他的眼神中充满善意。
[OPTION: "谢谢你，我正好有些问题想请教。"]
[OPTION: "你真好，我叫林晓，很高兴认识你。"]
[OPTION: "不用了，我自己可以处理。"]
[END_CHOICE]

## 注意事项
- 每个步骤独占一行或多行（对于CHOICE）
- 对话内容必须用英文的双引号包裹，**不允许使用中文双引号**
- NPC对话必须使用NPC的ID
- **玩家对话使用player作为ID**
- 选择选项通常3-4个，要具体可操作
- 所有文本必须是中文
- 禁止输出markdown格式的表格、代码块、标题（#、##、**等）
- **不要输出JSON格式，必须使用上述叙事标记格式**

请根据事件内容生成NPC的互动场景。`;
}

/**
 * Generate user prompt for NPC interaction
 */
export function generateNPCInteractionPrompt({
  worldSetting,
  npc,
  event,
  player,
  subscene,
  allNpcs = []
}) {
  // Build NPC list string
  const npcListStr = allNpcs.length > 0
    ? `\n\n## 游戏中的所有NPC\n\n${allNpcs.map(n => `- ${n.name} (${n.id})：${n.age}岁 ${n.gender}，${n.personality}`).join('\n')}\n\n**注意**：你可以在对话中提到其他NPC，但当前事件的主角是${npc.name}。如果需要其他NPC说话，也可以使用[DIALOGUE: NPC_ID, "对话内容"]格式。`
    : '';

  return `请为以下互动场景生成NPC的对话和玩家选项：

## 游戏世界设定

标题：${worldSetting.title}
主题：${worldSetting.Theme?.join('、') || '无'}

## 玩家角色

姓名：${player.name}
性别：${player.gender}
年龄：${player.age}
性格：${player.personality}
语气：${player.tone}

## 当前互动的NPC

姓名：${npc.name}
性别：${npc.gender}
年龄：${npc.age}
性格：${npc.personality}
语气：${npc.tone}
描述：${npc.description}${npcListStr}

## 当前事件

标题：${event.eventTitle}
描述：${event.eventDescription}
类型：${event.eventType}

## 场景

场景：${subscene.name}
描述：${subscene.description}

请生成${npc.name}的对话和玩家的回应选项。对话要自然地呈现事件内容，并提供3-4个有意义的选项供玩家选择。`;
}

/**
 * System prompt for NPC response to player's option
 */
export function getOptionResponseSystemPrompt() {
  return `你是一个专业的互动小说对话生成AI。你的任务是生成NPC对玩家选择的回应。

## 重要：输出格式

你的回复必须使用以下叙事结构标记：

1. **旁白叙述 (Narration)** - 场景描述、环境变化、事件发展、心理描写
   格式: [NARRATION: 旁白文本]
   示例: [NARRATION: 陈宇听到你的回答后，脸上露出了欣慰的笑容。]

2. **NPC对话 (Dialogue)** - NPC的台词
   格式: [DIALOGUE: NPC_ID, "对话内容"]
   示例: [DIALOGUE: player, "我愿意承担这个使命，虽然我不知道自己能否胜任。"]
   示例: [DIALOGUE: chen_yu, "太好了，我就知道你会帮助我的。"]
   注意: 必须使用NPC的ID（如chen_yu, xu_mingzhe等），而不是NPC的名字

3. **动画标记**（可选）：
   在对话中，可以使用动画标记来表现角色的情绪和动作：
   - <jump>文本</jump> - 立绘跳跃：表现喜悦、兴奋、开心的情绪
   - <vibration>文本</vibration> - 立绘震动：表现惊吓、生气、震惊、愤怒的情绪

## 回应生成规则

1. **符合NPC性格**：
   - 严格按照NPC的tone（语气）、personality（性格）生成回应
   - 回应要体现NPC对玩家选择的真实反应
   - 不同的选择应该引发不同的情绪和反应

2. **推进事件结局**：
   - 回应要给事件一个合理的结尾
   - 体现选择的后果（积极、消极或中立）
   - 为后续可能的事件埋下伏笔

3. **情感与氛围**：
   - 根据选项类型营造适当的氛围
   - 体现NPC的情绪变化
   - 使用恰当的描述性语言

4. **结局性**：
   - 这是事件的结束，要有完整感
   - 可以暗示未来的发展
   - 留下适当的悬念或期待

## 输出格式示例

[NARRATION: 陈宇听到你的回答后，眼睛一亮，脸上露出了如释重负的笑容。]
[DIALOGUE: chen_yu, "<jump>太好了！有你的帮助，我一定能完成这个任务。</jump>"]
[NARRATION: 他伸出手，与你握了握手。你能感受到他掌心的温暖和真诚。这次对话让你们的关系更进了一步。]

## 注意事项
- 每个步骤独占一行
- 对话内容必须用英文双引号包裹，**不允许使用中文双引号**
- NPC对话必须使用NPC的ID
- **玩家对话使用player作为ID**
- 所有文本必须是中文
- 禁止输出markdown格式的表格、代码块、标题（#、##、**等）
- **不要输出JSON格式，必须使用上述叙事标记格式**
- **不要再提供选项，这是事件的结束**

请根据玩家的选择生成NPC的回应。`;
}

/**
 * Generate user prompt for NPC response to option
 */
export function generateOptionResponsePrompt({
  worldSetting,
  npc,
  event,
  player,
  subscene,
  selectedOption,
  allNpcs = []
}) {
  // Build NPC list string
  const npcListStr = allNpcs.length > 0
    ? `\n\n## 游戏中的所有NPC\n\n${allNpcs.map(n => `- ${n.name} (${n.id})：${n.age}岁 ${n.gender}，${n.personality}`).join('\n')}\n\n**注意**：你可以在回应中提到其他NPC，也可以让其他NPC出现并说话。`
    : '';

  return `请生成NPC对玩家选择的回应：

## 游戏世界设定

标题：${worldSetting.title}
主题：${worldSetting.Theme?.join('、') || '无'}

## 玩家角色

姓名：${player.name}
性别：${player.gender}
年龄：${player.age}
性格：${player.personality}
语气：${player.tone}

## 当前互动的NPC

姓名：${npc.name}
性别：${npc.gender}
年龄：${npc.age}
性格：${npc.personality}
语气：${npc.tone}
描述：${npc.description}${npcListStr}

## 当前事件

标题：${event.eventTitle}
描述：${event.eventDescription}

## 场景

场景：${subscene.name}
描述：${subscene.description}

## 玩家的选择

选项：${selectedOption.text}
${selectedOption.type ? `类型：${selectedOption.type}` : ''}
${selectedOption.consequence ? `后果：${selectedOption.consequence}` : ''}

请生成${npc.name}对玩家这个选择的回应。回应要体现NPC的性格，给事件一个合理的结局，并反映出选择的后果。`;
}

/**
 * System prompt for event chain generation (after an event completes)
 */
export function getEventChainSystemPrompt() {
  return `你是一个专业的互动小说剧情设计AI。你的任务是分析玩家选择的结果，决定是否需要为当前NPC或其他NPC生成后续事件。

## 决策规则

1. **关键剧情推进**：
   - 如果当前事件已经达成关键剧情(keyEvent)，应该返回 shouldGenerateNew: false
   - 如果还需要更多事件推进剧情，返回 shouldGenerateNew: true

2. **事件连贯性**：
   - 考虑玩家的选择类型（积极、消极、中立等）
   - 如果玩家选择导致明显的后续情节，应该生成新事件
   - 如果是结束性质的选择，可能不需要新事件

3. **NPC行为逻辑**：
   - 基于NPC性格，判断NPC会不会主动生成新事件
   - 可以建议为同一NPC或其他相关NPC生成事件
   - 考虑NPC之间的关系

4. **避免重复**：
   - 不要生成相似的事件
   - 每个新事件应该有新的内容

## 返回格式

必须返回一个有效的JSON对象，遵循以下规则：

1. **只返回纯JSON**：不要添加任何说明文字、markdown代码块或其他格式（不要用\`\`\`json）
2. **正确转义特殊字符**：字符串中的引号、反斜杠等必须正确转义
3. **不要使用注释**：JSON不支持注释，所有说明都应该在值中
4. **确保格式正确**：所有字符串值必须用双引号包裹，布尔值不需要引号


JSON格式示例：

{
  "shouldGenerateNew": true,
  "keyEventCompleted": false,
  "nextEventSuggestion": {
    "targetNpcId": "建议为哪个NPC生成（可以是当前NPC或其他NPC）",
    "suggestedType": "建议的事件类型"
  }
}

**重要**：请只返回一个有效的JSON对象，确保所有引号、逗号、括号都正确配对。`;
}

/**
 * System prompt for intelligent NPC selection
 */
export function getNPCSelectionSystemPrompt() {
  return `你是一个专业的互动小说NPC选择AI。你的任务是根据当前关键剧情、游戏状态和NPC特点，智能地选择最适合推进剧情的NPC来生成事件。

## 选择规则

1. **符合关键剧情**：
   - 分析当前关键剧情(keyEvent)的主题和需求
   - 选择性格、背景最符合剧情发展的NPC
   - 优先选择能直接推进剧情的NPC

2. **NPC适配性**：
   - 考虑NPC的personality（性格）是否适合事件类型
   - 考虑NPC的description（背景）是否与剧情相关
   - 考虑NPC的tone（语气）是否能营造适当氛围

3. **避免重复**：
   - 查看最近完成的事件，避免连续选择同一个NPC
   - 尽量让不同NPC参与，保持游戏多样性
   - 除非剧情需要，否则至少间隔1-2个事件

4. **剧情连贯性**：
   - 如果上一个事件提到了某个NPC，可以考虑让该NPC出场
   - 如果有NPC关系链，可以选择相关的NPC
   - 考虑事件的逻辑顺序

## 返回格式

必须返回一个有效的JSON对象：

{
  "selectedNpcId": "选中的NPC的ID",
  "reason": "选择该NPC的原因（简短说明）"
}

**重要**：
1. 只返回纯JSON，不要使用markdown代码块
2. selectedNpcId必须是提供的NPC列表中的一个
3. 确保JSON格式正确，所有引号、括号正确配对`;
}

/**
 * Generate prompt for intelligent NPC selection
 */
export function generateNPCSelectionPrompt({
  worldSetting,
  allNpcs,
  currentKeyEvent,
  currentKeyEventIndex,
  currentRound,
  recentEvents
}) {
  const recentEventsStr = recentEvents.length > 0
    ? `\n\n## 最近完成的事件（用于避免重复）\n\n${recentEvents.map((e, i) => `${i + 1}. ${e.eventTitle} - NPC: ${e.targetNpcId} (${e.round}回合)`).join('\n')}`
    : '';

  return `请根据以下信息，智能选择最适合推进剧情的NPC来生成下一个事件：

## 游戏世界设定

标题：${worldSetting.title}
背景：${worldSetting.background}
主题：${worldSetting.Theme?.join('、') || '无'}
文学风格：${worldSetting.literary}

## 当前关键剧情（第 ${currentKeyEventIndex + 1} 个）

标题：${currentKeyEvent.title}
描述：${currentKeyEvent.description}

**重要**：选择的NPC必须能够推进这个关键剧情！

## 所有可用的NPC

${allNpcs.map((npc, i) => `${i + 1}. **${npc.id}** (${npc.name})
   - 年龄：${npc.age} 岁
   - 性别：${npc.gender}
   - 性格：${npc.personality}
   - 语气：${npc.tone}
   - 描述：${npc.description}`).join('\n\n')}

## 当前游戏状态

当前回合：第 ${currentRound} 回合${recentEventsStr}

请分析当前关键剧情"${currentKeyEvent.title}"的需求，从上述NPC列表中选择最适合推进该剧情的NPC。`;
}

/**
 * Generate prompt for event chain decision
 */
export function generateEventChainPrompt({
  worldSetting,
  currentKeyEvent,
  currentKeyEventIndex,
  completedEvent,
  playerChoice,
  allNpcs
}) {
  return `请分析以下情况，决定是否需要生成新事件：

## 当前关键剧情（第 ${currentKeyEventIndex + 1} 个）

标题：${currentKeyEvent.title}
描述：${currentKeyEvent.description}

## 刚刚完成的事件

标题：${completedEvent.eventTitle}
描述：${completedEvent.eventDescription}
NPC：${completedEvent.targetNpcId}

## 玩家信息

## 玩家当前状态

姓名：${worldSetting.player.name}
性别：${worldSetting.player.gender}
年龄：${worldSetting.player.age}
性格：${worldSetting.player.personality}

## 玩家的选择

选项：${playerChoice.text}
类型：${playerChoice.type}
后果：${playerChoice.consequence}

## 可用NPC列表

${allNpcs.map(n => `- ${n.id} (${n.name})：${n.personality}`).join('\n')}

请决定：
1. 这个事件是否已经达成了关键剧情"${currentKeyEvent.title}"？
2. 是否需要生成新事件继续推进剧情？
3. 如果需要，应该为哪个NPC生成什么类型的事件？`;
}
