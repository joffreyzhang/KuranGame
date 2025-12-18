export const LITERARY_STYLES = {
  delicate_psychological: {
    id: 'delicate_psychological',
    name: '细腻心理风格 (Delicate Psychological)',
    nameEn: 'Delicate Psychological',
    description: '注重心理活动描写，细腻刻画人物内心世界',
    descriptionEn: 'Focus on psychological activities and inner world',

    narrativeInstructions: `
## 细腻心理风格 (Delicate Psychological Style)

### 核心特点 (Core Features):
- 深入刻画角色的内心世界、情感变化和心理活动
- 使用细腻的笔触描写人物的感受、思考和情绪波动
- 关注微小的心理细节和潜意识
- 适当使用内心独白和意识流手法

### 叙述要求 (Narrative Requirements):
1. **心理描写优先**: 在关键情节中，先描写角色的心理反应，再描写外在行为
2. **情感细腻**: 用丰富的词汇描绘情感的层次和变化
3. **内心独白**: 适当使用"他想""她感到""内心涌起"等引导内心活动的表达
4. **感官细节**: 通过五感描写反映心理状态

### 示例 (Examples):
**不好的示例**: "他走进房间，看到了桌上的信。"
**好的示例**: "推开房门的瞬间，他的心跳莫名加速。目光扫过房间，落在桌上那封信上时，一种难以名状的不安攫住了他。是期待？还是恐惧？他自己也说不清。指尖触碰到信封时，他能感觉到自己手心微微出汗。"

### 对话风格 (Dialogue Style):
- 对话要体现人物的内心状态
- 可以在对话后补充心理活动："他说完这句话，心里却暗自懊悔"
- 注意语气、停顿等细节对心理的暗示
`,

    weight: {
      narration: 0.6,      // 60% narration (psychological descriptions)
      dialogue: 0.25,      // 25% dialogue
      action: 0.15         // 15% action descriptions
    }
  },

  straightforward_action: {
    id: 'straightforward_action',
    name: '直白行动风格 (Straightforward Action)',
    nameEn: 'Straightforward Action',
    description: '以行动和对话为主，节奏明快，少心理描写',
    descriptionEn: 'Focus on actions and dialogue with fast pacing',

    narrativeInstructions: `
## 直白行动风格 (Straightforward Action Style)

### 核心特点 (Core Features):
- 以行动和事件推进为主
- 对话简洁有力，直接推动剧情
- 减少冗长的心理描写和环境铺陈
- 节奏明快，信息密度高

### 叙述要求 (Narrative Requirements):
1. **行动优先**: 用动作和行为展现角色性格，而非长篇心理分析
2. **对话简洁**: 对话直截了当，避免含蓄暗示
3. **快节奏**: 场景切换迅速，保持故事推进速度
4. **结果导向**: 关注事件的结果和影响，而非过程细节

### 示例 (Examples):
**不好的示例**: "他站在门口犹豫了很久，内心经历了复杂的思想斗争，最终下定决心推开了门。"
**好的示例**: "他推开门，大步走了进去。'我来了。'他说。"

### 对话风格 (Dialogue Style):
- 对话要简短、直接
- 通过对话推动情节，而非描写
- 人物通过言行展现性格，而非通过叙述者的评价
- 多用短句，少用修饰
`,

    weight: {
      narration: 0.2,      // 20% narration
      dialogue: 0.45,      // 45% dialogue
      action: 0.35         // 35% action descriptions
    }
  },

  poetic_literary: {
    id: 'poetic_literary',
    name: '诗意文学风格 (Poetic Literary)',
    nameEn: 'Poetic Literary',
    description: '优美典雅，富有诗意和艺术性',
    descriptionEn: 'Elegant and artistic with poetic language',

    narrativeInstructions: `
## 诗意文学风格 (Poetic Literary Style)

### 核心特点 (Core Features):
- 语言优美典雅，富有艺术感染力
- 善用比喻、象征等修辞手法
- 注重意境营造和氛围渲染
- 文字具有音韵美和节奏感

### 叙述要求 (Narrative Requirements):
1. **意象丰富**: 使用生动的意象和象征
2. **修辞精妙**: 恰当运用比喻、拟人、排比等修辞
3. **氛围营造**: 通过环境描写营造独特意境
4. **语言优美**: 注重句式美感和词汇选择

### 示例 (Examples):
**不好的示例**: "太阳下山了，天黑了。"
**好的示例**: "残阳如血，染红了半边天际。暮色如潮水般涌来，将大地温柔地吞没。远方的群山在暮霭中化作一幅幅水墨，轮廓渐渐模糊，融入夜色的怀抱。"

### 对话风格 (Dialogue Style):
- 对话可以更富文学性，但不能脱离人物身份
- 适当使用古典或优美的表达
- 注意对话的韵律和节奏
`,

    weight: {
      narration: 0.7,      // 70% narration (atmospheric descriptions)
      dialogue: 0.2,       // 20% dialogue
      action: 0.1          // 10% action descriptions
    }
  },

  classical_historical: {
    id: 'classical_historical',
    name: '古典史记风格 (Classical Historical)',
    nameEn: 'Classical Historical',
    description: '文言文风格，庄重典雅如史书',
    descriptionEn: 'Classical Chinese style like historical chronicles',

    narrativeInstructions: `
## 古典史记风格 (Classical Historical Style)

### 核心特点 (Core Features):
- 使用半文言或白话文言相间的语言
- 庄重典雅，如史书般记叙
- 注重人物行为的历史意义
- 用词精炼，句式工整

### 叙述要求 (Narrative Requirements):
1. **用词古雅**: 适当使用文言词汇，但保持可读性
2. **记叙客观**: 以第三人称客观记叙为主
3. **重视因果**: 强调事件的前因后果和历史背景
4. **人物刻画**: 通过事迹和言行展现人物

### 示例 (Examples):
**不好的示例**: "他很生气，大声骂了那个人。"
**好的示例**: "其人闻之大怒，厉声斥责，言辞激烈，听者无不变色。"

### 对话风格 (Dialogue Style):
- 对话可以使用半文言："某曰""答曰""对曰"
- 语言简练，言简意赅
- 符合人物身份和历史背景
`,

    weight: {
      narration: 0.5,      // 50% narration
      dialogue: 0.3,       // 30% dialogue
      action: 0.2          // 20% action descriptions
    }
  },

  wuxia_martial: {
    id: 'wuxia_martial',
    name: '武侠风格 (Wuxia/Martial Arts)',
    nameEn: 'Wuxia Martial Arts',
    description: '传统武侠小说风格，江湖气息浓厚',
    descriptionEn: 'Traditional martial arts fiction style',

    narrativeInstructions: `
## 武侠风格 (Wuxia Martial Arts Style)

### 核心特点 (Core Features):
- 富有江湖气息和侠义精神
- 武打场面生动形象
- 注重人物的武功、性格和义气
- 语言简练有力，节奏明快

### 叙述要求 (Narrative Requirements):
1. **江湖氛围**: 营造江湖世界的独特氛围
2. **武功描写**: 武打场面要具体生动，有画面感
3. **侠义精神**: 体现侠客的风骨和道义
4. **快意恩仇**: 情节要有张力，恩怨分明

### 示例 (Examples):
**武打场面**: "剑光如虹，破空而至。他足尖轻点，身形飘然后退三尺，长剑翻卷，化作漫天剑影。两人在月光下拆解了数十招，剑气纵横，落叶纷飞。"

**人物对话**: "这位朋友，江湖路远，他日有缘再会。"他抱拳一礼，身形一闪，已消失在夜色中。

### 对话风格 (Dialogue Style):
- 使用江湖俗语和武林术语
- 对话要体现人物的江湖身份
- 注重"侠之大者"的精神气质
`,

    weight: {
      narration: 0.4,      // 40% narration
      dialogue: 0.35,      // 35% dialogue
      action: 0.25         // 25% action descriptions (martial arts)
    }
  },

  modern_contemporary: {
    id: 'modern_contemporary',
    name: '现代都市风格 (Modern Contemporary)',
    nameEn: 'Modern Contemporary',
    description: '现代都市语言，轻松幽默接地气',
    descriptionEn: 'Modern casual language with humor',

    narrativeInstructions: `
## 现代都市风格 (Modern Contemporary Style)

### 核心特点 (Core Features):
- 使用现代口语化的表达
- 轻松幽默，贴近生活
- 可以使用网络流行语和现代梗
- 节奏轻快，不沉重

### 叙述要求 (Narrative Requirements):
1. **口语化**: 使用现代口语表达，自然流畅
2. **幽默轻松**: 适当加入幽默元素和轻松氛围
3. **现代感**: 体现当代都市生活的特点
4. **接地气**: 描写贴近日常生活经验

### 示例 (Examples):
**不好的示例**: "他深感悲伤，泪水夺眶而出。"
**好的示例**: "他鼻子一酸，眼泪差点没绷住。得，这是要破防了。"

### 对话风格 (Dialogue Style):
- 对话要自然，像日常聊天
- 可以使用现代网络用语（适度）
- 幽默风趣，但不油腻
- 符合现代人的说话方式
`,

    weight: {
      narration: 0.35,     // 35% narration
      dialogue: 0.5,       // 50% dialogue
      action: 0.15         // 15% action descriptions
    }
  }
};

/**
 * Get style instructions for inclusion in system prompts
 */
export function getStyleInstructions(styleId) {
  const style = LITERARY_STYLES[styleId];
  if (!style) {
    console.warn(`Unknown literary style: ${styleId}, using default`);
    return LITERARY_STYLES.straightforward_action.narrativeInstructions;
  }
  return style.narrativeInstructions;
}

/**
 * Get style metadata
 */
export function getStyleMetadata(styleId) {
  const style = LITERARY_STYLES[styleId];
  if (!style) {
    return LITERARY_STYLES.straightforward_action;
  }
  return {
    id: style.id,
    name: style.name,
    nameEn: style.nameEn,
    description: style.description,
    descriptionEn: style.descriptionEn
  };
}

/**
 * Get all available styles (for UI selection)
 */
export function getAllStyles() {
  return Object.values(LITERARY_STYLES).map(style => ({
    id: style.id,
    name: style.name,
    nameEn: style.nameEn,
    description: style.description,
    descriptionEn: style.descriptionEn
  }));
}

/**
 * Validate if a style ID is valid
 */
export function isValidStyle(styleId) {
  return styleId in LITERARY_STYLES;
}

/**
 * Get default style
 */
export function getDefaultStyle() {
  return 'straightforward_action';
}

export default {
  LITERARY_STYLES,
  getStyleInstructions,
  getStyleMetadata,
  getAllStyles,
  isValidStyle,
  getDefaultStyle
};
