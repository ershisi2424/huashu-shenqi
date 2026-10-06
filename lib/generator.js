import scriptData from "../data/scripts.json" with { type: "json" };

const { scenarios, personalities, default_scenario, variables } = scriptData;

/* =========================================================
   真人化后处理器 v2  —— 把"作文式模板"变成"像人发的微信"
   新增（相比 v1）：
     a) 统一的「去标点堆叠清理器」→ 修复 "✨！" "🥺~！" 这种机器味
     b) 语义重复词（谢谢谢谢 / 嗯嗯嗯 / 好好好 / 嘿嘿 / 哈哈哈哈）
     c) 思维停顿前缀（那个… / 哦对了 / 呃… / 害）
     d) 极端短变体：10% 概率直接退回 2~5 字 + 1 表情的超短回复
     e) 长度多样：不同位置的空格换行策略随机化，避免每条都是"结构类似长消息"
     f) 话术强度 (intensity)：warmup=保守距离 / daily=日常 / heatup=升温
   ========================================================= */

const SOFT_TYPOS = [
  ["好的", "好哒"], ["好的", "好滴"],
  ["知道", "造"], ["什么", "啥"],
  ["怎么", "咋"], ["这样", "酱紫"],
  ["不要", "表"], ["喜欢", "稀饭"],
  ["朋友", "盆友"], ["难过", "蓝瘦"],
  ["睡觉", "碎觉"], ["可爱", "阔耐"],
];

const MOOD_PARTICLES = ["哈", "嘛", "哦", "啦", "呢", "呗", "诶", "唔", "咯", "喽", "啊", "喔"];

const TINY_EMOJI = [
  "🌸","💫","✨","🥺","😜","😝","🫠","🤭","😏","🫶","💭","🌙","☀️","🤍","👉👈",
  "🥰","💖","🫡","🤤","🥲","😇","🤠","🤐","😘","🤗","💘","🩷","🌷","☁️","🍻"
];

const PAUSE_STARTERS = ["那个…", "哦对了，", "呃…", "害，", "其实吧，", "怎么说呢…", "嗯~…", "哎，"];

const CHAR_REPEAT = [
  ["谢谢", "谢谢谢谢"], ["嗯嗯", "嗯嗯嗯"], ["好好好", "好好好"], ["哈哈", "哈哈哈哈"],
  ["哎呀", "哎呀哎呀"], ["宝贝", "宝贝宝贝"], ["哥哥", "哥哥哥"], ["好嘞", "好嘞好嘞"],
  ["在的", "在的在的"], ["收到", "收到收到"],
];

/* =========================================================
   🆕🆕🆕 方言识别器 v1 —— 判断大哥是普通话还是其他地区
   支持：普通话 / 粤语 / 东北话 / 四川话 / 湖南话 / 上海话 / 台湾腔 / 北京话
   思路：按方言特征词打分，分高的为该方言
   ========================================================= */
const DIALECT_PROFILES = [
  {
    key: "cantonese",
    label: "粤语",
    emoji: "🇭🇰",
    region: "广东/香港/澳门",
    features: ["咩", "嘅", "啦", "喇", "嗰", "喺", "唔", "冇", "睇", "佢", "点解", "做咩", "乜", "嘢", "谂", "靓", "番", "返", "嗌", "嘥", "嬲", "掂", "搞掂", "饮茶", "食饭", "返工", "放工", "几钱", "边个", "边度", "点样", "乜嘢", "咁", "唔系", "系咪", "畀", "俾", "嗱", "嘅啦", "喺咁", "搞掂晒"],
    particles: ["啦", "嘅", "咩", "喇", "嗰"],
  },
  {
    key: "northeast",
    label: "东北话",
    emoji: "🥶",
    region: "东北三省",
    features: ["嘎哈", "干哈", "咋", "咋地", "咋办", "咋整", "整", "贼", "老", "贼拉", "忽悠", "扒拉", "唠嗑", "嘚瑟", "磨叽", "扯犊子", "犊子", "嘎嘎", "贼好", "埋汰", "磕碜", "憋屈", "闹心", "刺挠", "膈应", "稀罕", "瞅", "扯", "杠", "哽", "麻溜", "旮旯", "得劲", "够呛", "咋样", "咋的", "呗", "哈", "啊"],
    particles: ["呗", "哈", "咋", "啊"],
  },
  {
    key: "sichuan",
    label: "四川话",
    emoji: "🌶️",
    region: "四川/重庆",
    features: ["啥子", "做啥子", "搞啥子", "要得", "巴适", "安逸", "嘛", "撒", "咯", "噻", "啰", "莫", "莫得", "没得", "娃儿", "崽儿", "弄", "耍", "搞", "雄起", "撇", "瓜", "瓜娃子", "日白", "摆龙门阵", "龙门阵", "晓得", "晓不得", "咋个", "啷个", "恁个", "郎个", "杂个", "多个", "莫弄", "搞起", "整起", "勒个", "那个"],
    particles: ["嘛", "撒", "咯", "噻", "啰"],
  },
  {
    key: "hunan",
    label: "湖南话",
    emoji: "🍜",
    region: "湖南",
    features: ["么子", "么子咯", "咯", "啵", "哒", "嗦", "恰", "恰饭", "嬲", "霸蛮", "策", "灵泛", "撮", "搞么子", "搞咯", "是咯", "好咯", "哒咯", "冒得", "莫得", "冇得", "策神", "宝气", "韵味", "冇", "嗯咯", "哦咯"],
    particles: ["咯", "啵", "哒", "嗦"],
  },
  {
    key: "shanghai",
    label: "上海话",
    emoji: "🏙️",
    region: "上海/江浙",
    features: ["侬", "侬好", "伐", "嘞", "啥", "啥物事", "哪能", "哪能介", "老好", "蛮好", "勿", "勿要", "勿好", "勿可以", "辰光", "辰光到了", "嘎", "嘎许多", "老", "蛮", "帮帮忙", "作啥", "作孽", "轧闹猛", "伐啦", "好伐", "阿好", "阿是", "一歇", "一歇歇", "钞票", "铜钿", "困觉", "白相", "吃力", "拎不清", "戆", "十三点"],
    particles: ["伐", "嘞", "咯"],
  },
  {
    key: "taiwanese",
    label: "台湾腔",
    emoji: "🦝",
    region: "台湾",
    features: ["哎呀", "真的假的", "超", "有夠", "超有", "超讚", "超棒", "齁", "吼", "捏", "厚", "啦", "勒", "欸", "醬", "醬子", "醬膏", "宣", "我想", "人家", "不要醬", "醬子唷", "厚~", "齁~", "啦~", "欸~", "真的超", "也太好", "也太", "就是", "就醬", "你很奇怪耶", "厚", "少来", "哎呀你", "不錯", "讚", "棒棒"],
    particles: ["啦", "勒", "欸", "吼", "齁"],
  },
  {
    key: "beijing",
    label: "北京话",
    emoji: "🏯",
    region: "北京",
    features: ["儿", "儿化", "今儿", "明儿", "昨儿", "哪儿", "这儿", "那儿", "怎么着", "您", "您哪", "瞅", "瞧", "嘛", "呗", "得嘞", "甭", "胡同", "门儿", "事儿", "咱", "咱家", "咱俩", "哥们儿", "姐们儿", "爷们儿", "大老爷们", "拍砖", "侃", "侃大山", "贫", "贫嘴", "拿不上", "拿不出手", "折腾", "瞎掰", "蒙人", "搋"],
    particles: ["嘛", "呗", "儿", "得嘞"],
  },
  {
    key: "shandong",
    label: "山东话",
    emoji: "🥟",
    region: "山东",
    // 修复：去掉普通话单字（你/整/弄/啊/呀/嘛/啦/咯/呗/嗞/傻/行/管/痴/怪）
    //       这些单字在普通话里也极常见，会让普通话被误判成山东话
    // 加几个山东独占强特征词：俺娘/俺爹/俺滴娘/杠赛了/潮巴/拉呱/拾掇/捣鼓
    features: ["俺", "俺们", "俺滴娘", "俺娘", "俺爹", "亲娘", "娘哎", "额娘", "恁", "咋着", "咋办", "咋整", "咋回事", "咋嘀", "咋样", "咋弄", "啥玩意儿", "么个", "么着", "么样", "么办法", "么回事", "么嘀", "孬", "孬种", "恣", "恣儿", "舒坦", "带劲", "中不了", "中了", "管事", "拉呱", "扒瞎", "扯淡", "胡扯", "捣鼓", "拾掇", "摆治", "作践", "白搭", "没辙", "中用", "管用", "好使", "得劲", "够劲", "来劲", "起劲儿", "有劲", "可了不得了", "了不得", "怪好", "怪累", "怪难受", "杠赛了", "杠好", "杠厉害", "倍儿", "倍儿爽", "倍儿好", "真愣", "愣头青", "潮巴", "傻不拉几", "憨子"],
    particles: ["呗", "啦", "咯", "啊", "呀", "嘛"],
  },
];

/**
 * 🆕 识别消息的方言
 * 返回 { dialect, label, emoji, region, score, particles }
 * 默认普通话（mandarin）
 *
 * 评分规则（修复单字/公共词误判）：
 *   1) 单字（length < 2）特征词不再加分（防止普通话"你/啊/呀"凑分误判成方言）
 *   2) 公共词（同时出现在 ≥2 个方言特征表里的词）打 0.5 折，弱化交叉污染
 *   3) 必须至少有 1 个 ≥2 字的"强独占特征词"命中，否则即便总分够 3 也判普通话
 *   4) 总分门槛提高到 4 分
 */
function detectDialect(message) {
  const msg = message || "";

  // 预计算每个特征词出现在几个方言里（≥2 即公共词）
  const featureCount = new Map();
  for (const p of DIALECT_PROFILES) {
    for (const f of p.features) {
      featureCount.set(f, (featureCount.get(f) || 0) + 1);
    }
  }

  const scores = DIALECT_PROFILES.map(p => {
    let s = 0;
    let strongUniqueHits = 0; // ≥2字 + 仅本方言有的强独占词命中数
    for (const f of p.features) {
      if (!msg.includes(f)) continue;
      if (f.length < 2) continue; // 单字一律不加分（防普通话单字凑分）
      const cnt = featureCount.get(f) || 1;
      if (cnt === 1) {
        // 独占词：满分
        s += 2;
        strongUniqueHits += 1;
      } else {
        // 公共词：只加 0.5 分（弱化交叉污染）
        s += 0.5;
      }
    }
    return { ...p, score: s, strongUniqueHits };
  });

  // 门槛：总分 ≥3 且至少 1 个独占强特征词命中
  // （独占词门槛是关键，避免公共词"咋/啥"凑分误判；分值门槛从 4 降到 3，
  //  让"咋回事"(0.5公共) + "俺娘"(2独占) = 2.5 这种典型山东话也能识别）
  const top = scores
    .filter(x => x.score >= 3 && x.strongUniqueHits >= 1)
    .sort((a, b) => b.score - a.score);
  if (top.length === 0) {
    // 兜底：短消息（≤25字）+ 含"咋回事"这种强山东口语词 + 没有其它方言独占
    // 只做轻量适配（加语气词），不做词汇替换（防误替换）
    if (msg.length <= 25 && /咋回事/.test(msg)) {
      return {
        key: "shandong_light",
        label: "山东话(轻)",
        emoji: "🥟",
        region: "山东",
        particles: ["呗", "啦", "咯", "啊", "呀", "嘛"],
        score: 0.5,
        strongUniqueHits: 0,
        light: true, // 标记：只加语气词，不做词汇替换
      };
    }
    return {
      dialect: "mandarin",
      label: "普通话",
      emoji: "🗣️",
      region: "标准中文",
      particles: ["呀", "呢", "哦", "嘛", "啦"],
    };
  }
  return top[0];
}

/**
 * 🆕 按方言微调回复语气词 + 词汇替换
 * 三层处理：
 *   1) 普通话词 → 方言词替换（啥→啥子/什么→啥 等）
 *   2) 在每句末尾（不只最后一句）插入方言语气词
 *   3) 概率提升，让方言味儿更明显
 */
const DIALECT_WORD_REPLACE = {
  // 山东话词汇替换（中文不能用 \b 词边界，直接匹配字符）
  shandong: [
    [/什么/g, "啥"], [/怎么/g, "咋"], [/为什么/g, "为啥"],
    [/不行/g, "中不了"], [/可以/g, "中"], [/很好/g, "杠好"],
    [/很累/g, "怪累"], [/特别/g, "杠"], [/舒服/g, "舒坦"],
    [/厉害/g, "杠厉害"], [/现在/g, "这会儿"], [/我们/g, "俺们"],
    [/我妈/g, "俺娘"], [/爸爸/g, "俺爹"], [/饿了/g, "饥荒了"],
    [/高兴/g, "恣"], [/特别好/g, "杠赛了"], [/随便/g, "胡乱"],
    [/弄/g, "捣鼓"], [/收拾/g, "拾掇"],
  ],
  // 东北话词汇替换
  dongbei: [
    [/什么/g, "啥"], [/怎么/g, "咋"], [/很好/g, "贼好"],
    [/特别/g, "贼"], [/不行/g, "不中"], [/舒服/g, "得劲"],
    [/厉害/g, "嘎嘎厉害"], [/喜欢/g, "稀罕"], [/聊天/g, "唠嗑"],
    [/妈妈/g, "妈"], [/爸爸/g, "爸"], [/赶紧/g, "赶紧地"],
  ],
  // 四川话词汇替换
  sichuan: [
    [/什么/g, "啥子"], [/怎么/g, "咋个"], [/可以/g, "要得"],
    [/不行/g, "不得行"], [/很好/g, "巴适"], [/特别/g, "硬是"],
    [/舒服/g, "安逸"], [/厉害/g, "凶"], [/喜欢/g, "欢喜"],
  ],
  // 粤语词汇替换
  yueyu: [
    [/什么/g, "乜"], [/怎么/g, "点解"], [/可以/g, "得"],
    [/不行/g, "唔得"], [/很好/g, "好正"], [/喜欢/g, "中意"],
    [/吃饭/g, "食饭"], [/睡觉/g, "瞓觉"],
  ],
};

function applyDialectTone(text, dialect) {
  if (!text || !dialect || dialect.key === "mandarin" || !dialect.key) return text;
  const particles = dialect.particles || [];
  if (particles.length === 0) return text;

  // 第 1 步：词汇替换（80% 概率触发，让方言味儿更明显）
  // 轻量模式（light:true，如"咋回事早上没吃饭吗"短句判定的山东话轻量模式）跳过词汇替换，
  //   只加语气词，避免误替换
  if (!dialect.light && Math.random() < 0.8) {
    const wordMap = DIALECT_WORD_REPLACE[dialect.key] || [];
    for (const [re, rep] of wordMap) {
      text = text.replace(re, rep);
    }
  }

  // 第 2 步：每个完整句子末尾加方言语气词（60% 概率，分散到多句更自然）
  const pick = () => particles[Math.floor(Math.random() * particles.length)];
  const addParticle = (sentence) => {
    if (!sentence || Math.random() > 0.6) return sentence;
    const m = sentence.match(/([。！？!?~]+)$/);
    if (m) {
      return sentence.slice(0, -m[1].length) + pick() + m[1];
    }
    // 没有标点的句子也加
    return sentence + pick();
  };
  // 按句号/感叹/问号 拆句，逐句加词，再拼回
  text = text.split(/(\n+)/).map(seg => {
    if (/^\s*$/.test(seg)) return seg;
    // 行内再按句末标点切，逐句加
    return seg.split(/([。！？!?~]+)/).map((piece, i, arr) => {
      // 偶数位是正文，奇数位是标点
      if (i % 2 === 0 && piece) return addParticle(piece);
      return piece;
    }).join("");
  }).join("");

  return text;
}

const PERSONALITY_STYLE = {
  gentle:     { emojiChance: 0.30, particleChance: 0.45, chopChance: 0.35, typosChance: 0.10, exBias: 0.10, waveBias: 0.15, repeatChance: 0.15, pauseChance: 0.08, ultraShortChance: 0.04 },
  tsundere:   { emojiChance: 0.10, particleChance: 0.20, chopChance: 0.55, typosChance: 0.02, exBias: 0.55, waveBias: 0.00, repeatChance: 0.03, pauseChance: 0.15, ultraShortChance: 0.08 },
  lively:     { emojiChance: 0.60, particleChance: 0.55, chopChance: 0.20, typosChance: 0.15, exBias: 0.70, waveBias: 0.10, repeatChance: 0.35, pauseChance: 0.05, ultraShortChance: 0.03 },
  coquettish: { emojiChance: 0.55, particleChance: 0.70, chopChance: 0.25, typosChance: 0.05, exBias: 0.10, waveBias: 0.90, repeatChance: 0.28, pauseChance: 0.04, ultraShortChance: 0.02 },
  humorous:   { emojiChance: 0.45, particleChance: 0.40, chopChance: 0.40, typosChance: 0.12, exBias: 0.40, waveBias: 0.05, repeatChance: 0.22, pauseChance: 0.25, ultraShortChance: 0.08 },
  mature:     { emojiChance: 0.08, particleChance: 0.15, chopChance: 0.60, typosChance: 0.01, exBias: 0.00, waveBias: 0.00, repeatChance: 0.02, pauseChance: 0.20, ultraShortChance: 0.05 },
  sharp:      { emojiChance: 0.05, particleChance: 0.10, chopChance: 0.65, typosChance: 0.01, exBias: 0.80, waveBias: 0.00, repeatChance: 0.02, pauseChance: 0.18, ultraShortChance: 0.08 },
  sweet:      { emojiChance: 0.72, particleChance: 0.78, chopChance: 0.12, typosChance: 0.06, exBias: 0.20, waveBias: 0.78, repeatChance: 0.30, pauseChance: 0.03, ultraShortChance: 0.02 },
};

/* 强度档位对参数的乘数：warmup 收敛、daily 中性、heatup 放大 */
const INTENSITY_MULT = {
  warmup:  { emoji: 0.55, particle: 0.70, chop: 1.15, typos: 0.70, ex: 0.70, wave: 0.55, repeat: 0.40, pause: 1.10, ultraShort: 0.50 },
  daily:   { emoji: 1.00, particle: 1.00, chop: 1.00, typos: 1.00, ex: 1.00, wave: 1.00, repeat: 1.00, pause: 1.00, ultraShort: 1.00 },
  heatup:  { emoji: 1.35, particle: 1.25, chop: 0.75, typos: 1.20, ex: 1.30, wave: 1.35, repeat: 1.60, pause: 0.80, ultraShort: 0.40 },
};

function rand(n) { return Math.random() < Math.max(0, Math.min(1, n)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** 统一去标点堆叠：把 "~！~" "✨！" "？！" 这类清成一个主标点 */
function cleanupPunctuation(str) {
  let s = str;
  // 1) 表情/字母后紧跟的单独叹号/问号直接删除，避免"✨！🥺！"
  s = s.replace(/([\p{Extended_Pictographic}\p{Emoji_Presentation}a-zA-Z])\s*[!！]+/gu, "$1");
  s = s.replace(/([\p{Extended_Pictographic}\p{Emoji_Presentation}a-zA-Z])\s*[?？]+/gu, "$1");
  // 2) ~ 波浪号最多保留 2 个
  s = s.replace(/~~+/g, "~~");
  // 3) ！？ 最多 2 个
  s = s.replace(/！！！+/g, "！！");
  s = s.replace(/！！！+/g, "！！");
  s = s.replace(/\?\?\?+/g, "？？");
  s = s.replace(/？？？+/g, "？？");
  // 4) ，，或，。 这种合并成单个
  s = s.replace(/，，+/g, "，");
  s = s.replace(/，。/g, "。");
  s = s.replace(/。。+/g, "。");
  // 5) 表情前后多余的空格：表情之间 1 空格
  s = s.replace(/([\p{Extended_Pictographic}\p{Emoji_Presentation}])\s{2,}(?=[\p{Extended_Pictographic}\p{Emoji_Presentation}])/gu, "$1 ");
  // 6) 句首标点：",/，/。" 开头删掉
  s = s.replace(/^[，,。.\s]+/, "");
  return s.trim();
}

/**
 * 关系维护安全层：保留亲切感，但去掉金钱诱导、虚假随时陪伴和排他性承诺。
 */
export function applyEngagementSafety(text) {
  return String(text || "")
    .replace(/(下次|以后).{0,8}(还|继续|记得).{0,5}(刷|送礼|上票|打赏)/g, "下次来聊聊天就好")
    .replace(/(给我|帮我).{0,6}(刷|上票|续灯牌)/g, "来直播间陪我聊聊天")
    .replace(/你随时找我[\s，,]*我(肯定|一定|永远)在/g, "你想聊的时候可以来找我 有空我会认真回")
    .replace(/(永远|一辈子).{0,10}(只属于|只陪|只爱)你/g, "我会认真珍惜我们的每次聊天")
    .trim();
}

/**
 * 真人化主入口
 * @param {"warmup"|"daily"|"heatup"} intensity
 * @param {{message?:string, crossLine?:boolean}} opts 额外控制：原话消息用于保护关键信息段
 */
export function humanizeText(text, personalityKey = "gentle", intensity = "daily", opts = {}) {
  const base = PERSONALITY_STYLE[personalityKey] || PERSONALITY_STYLE.gentle;
  const mult = INTENSITY_MULT[intensity] || INTENSITY_MULT.daily;
  const style = {
    emojiChance:      base.emojiChance      * mult.emoji,
    particleChance:   base.particleChance   * mult.particle,
    chopChance:       base.chopChance       * mult.chop,
    typosChance:      base.typosChance      * mult.typos,
    exBias:           base.exBias           * mult.ex,
    waveBias:         base.waveBias         * mult.wave,
    repeatChance:     base.repeatChance     * mult.repeat,
    pauseChance:      base.pauseChance      * mult.pause,
    ultraShortChance: base.ultraShortChance * mult.ultraShort,
  };

  // 🆕 提取消息的关键片段，用于砍段保护（避免砍掉回应消息的段落）
  const protectChunks = opts.message ? splitChunks(opts.message) : [];

  let result = text;

  // 0) 超短回复变体：仅在原文 >=15 字 + 原话 <=12 字 时才允许退化，越界场景禁止
  //    （长消息用超短回复 = 答非所问，所以禁掉）
  const msgShort = !opts.message || opts.message.length <= 12;
  if (text.length >= 15 && msgShort && !opts.crossLine && rand(style.ultraShortChance)) {
    const ultraShortPool = {
      tsundere: ["嗯", "行吧", "知道了", "随便", "别闹", "哦", "不", "不行"],
      sharp:    ["切", "滚", "别扯", "得了", "拉倒", "呵呵", "说人话"],
      humorous: ["哈哈哈哈", "笑死", "离谱", "我真的", "栓Q", "你牛"],
      mature:   ["嗯", "收到", "了解", "好的", "辛苦了"],
      gentle:   ["好呀", "嗯嗯", "在的", "怎么啦", "好的呀"],
      lively:   ["哇！", "收到！", "哈哈", "好嘞", "来啦"],
      coquettish:["嗯~", "好嘛~", "知道啦~", "收到~", "讨厌~"],
      sweet:    ["么么哒", "宝贝~", "爱你哦", "收到啦~"],
    };
    const pool = ultraShortPool[personalityKey] || ultraShortPool.gentle;
    let short = pick(pool);
    // 超短 + 偶尔双字重复
    if (rand(0.3) && short.length <= 3) short = short + short;
    // 加 1 个表情概率
    if (rand(style.emojiChance * 0.9)) short = short + " " + pick(TINY_EMOJI);
    return cleanupPunctuation(short);
  }

  // 1) 轻微错别字替换
  for (const [from, to] of SOFT_TYPOS) {
    if (rand(style.typosChance * 0.2) && result.includes(from)) {
      result = result.replace(from, to);
      break;
    }
  }

  // 2) 切段 + 砍段（破坏三段式工整感）
  //    🆕 关键改进：砍段前先识别"回应消息的段落"（含消息关键词的段），
  //    这些段绝对不砍，避免砍掉关键信息导致答非所问
  let parts = result.split(/\n+/).map(s => s.trim()).filter(Boolean);

  // 找出"必须保留"的段落索引（含消息关键片段的段）
  const mustKeepIdx = new Set();
  if (protectChunks.length > 0 && parts.length > 1) {
    parts.forEach((p, i) => {
      const hit = protectChunks.some(c => c.length >= 3 && p.includes(c));
      if (hit) mustKeepIdx.add(i);
    });
  }

  if (parts.length > 1 && rand(style.chopChance) && intensity !== "warmup") {
    // 只在"可砍段"（非 mustKeep）里挑一个砍
    const choppable = parts.map((_, i) => i).filter(i => !mustKeepIdx.has(i));
    if (choppable.length > 0 && parts.length - choppable.length >= 1) {
      // 至少保留 1 段，否则不砍
      if (rand(0.65) && choppable.includes(parts.length - 1)) {
        parts.pop();
      } else {
        const pick = choppable[Math.floor(Math.random() * choppable.length)];
        parts.splice(pick, 1);
      }
    }
  }
  // 强度=heatup 时，额外加一个"多留一段"的保护，让升温话术更有温度
  if (intensity === "heatup" && parts.length >= 2 && rand(0.35)) {
    // 什么都不砍，保持更完整的情感
  }

  // 3) 性格专属标点：撒娇 ~ / 活泼毒舌 ！ / 逗号打断句号
  parts = parts.map(line => {
    let s = line;
    if (rand(style.waveBias)) {
      s = s.replace(/([嘛哦啦呢呗啊哒啦])[\。\.！!？?]?$/g, "$1~");
    }
    if (rand(style.exBias) && !/[!！~]$/.test(s)) {
      if (s.endsWith("。")) s = s.slice(0, -1) + "！";
      else if (rand(0.45)) s = s + "！";
    }
    if (rand(0.15) && (s.match(/。/g) || []).length >= 2) {
      s = s.replace(/。/, "，");
    }
    return s;
  });

  // 3.5) 语义重复词（谢谢谢谢 / 嗯嗯嗯 / 好好好）
  if (rand(style.repeatChance)) {
    const targetIdx = Math.floor(Math.random() * parts.length);
    for (const [from, to] of CHAR_REPEAT) {
      if (parts[targetIdx] && parts[targetIdx].includes(from)) {
        parts[targetIdx] = parts[targetIdx].replace(from, to);
        break;
      }
    }
  }

  // 3.6) 思维停顿前缀（那个… / 哦对了 / 害）—— 冷启动一句
  if (parts.length > 0 && rand(style.pauseChance)) {
    const chosen = pick(PAUSE_STARTERS);
    parts[0] = chosen + parts[0].replace(/^(那个|哦对了|呃|害|其实吧|怎么说呢|嗯~|哎)?[，,、…]?/, "");
  }

  // 4) 语气词插入（随机选一句；如果这句末尾已经有表情字符，就不加后缀语气词；前缀如果原句已有语气词也跳过）
  if (parts.length > 0 && rand(style.particleChance)) {
    const idx = Math.floor(Math.random() * parts.length);
    const orig = parts[idx];
    if (!orig) { /* no-op */ }
    else {
      const lineHasTrailingEmoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]$/u.test(orig.trim());
      const startsWithParticle = MOOD_PARTICLES.some(p => orig.startsWith(p) || orig.startsWith("哎呀") || orig.startsWith("嗯嗯") || orig.startsWith("哦哦"));
      const preferPrefix = startsWithParticle ? false : (lineHasTrailingEmoji ? true : rand(0.4));
      const p = pick(MOOD_PARTICLES);
      if (preferPrefix) {
        parts[idx] = p + "，" + orig.replace(/^(诶|嗯|哦|啊|哼|哇|嗨)?[，,]?/, "");
      } else {
        const tail = orig.match(/([。！!？?，,~]+)$/);
        if (tail) {
          parts[idx] = orig.slice(0, -tail[1].length) + p + tail[1];
        } else {
          parts[idx] = orig + p;
        }
      }
    }
  }

  // 5) 拼回字符串（长度多样化：不是永远"几句就几行"）
  if (parts.length === 1) {
    result = parts[0];
  } else if (parts.length === 2) {
    result = parts.join(rand(0.35) ? "\n" : " ");
  } else {
    // 3 段以上：45% 全不换行、25% 只在最后换一次行、30% 全换行
    const r = Math.random();
    if (r < 0.45) result = parts.join(" ");
    else if (r < 0.70) result = parts.slice(0, -1).join(" ") + "\n" + parts[parts.length - 1];
    else result = parts.join("\n");
  }

  // 6) 随机加 1~2 个小 emoji
  if (rand(style.emojiChance)) {
    result += " " + pick(TINY_EMOJI);
    if (rand(style.emojiChance * 0.25)) result += pick(TINY_EMOJI);
  }

  return cleanupPunctuation(result);
}

/* =========================================================
   否定词保护：命中"不/没/别+敏感动词"时，强行降级场景
   ========================================================= */
const NEGATION_GUARD = [
  // ⚠️ 修复 false positive：
  // 之前 /(不|没|别)…{0,3}(喜欢|爱|想)/ 会误中 "睡不[着] 想…" / "不舒服 想你" / "不开心 想你" 这类
  // 修复：① 先判断"长否定短语"（并不是/并没有/假的/才不…）② 短"不/没"必须：否定字符后 0~4 字 直接 跟 情感动词，中间不能有 「着/过/开/用/忙/饿/顺/在/够/对/舒/服/困/累」等日常"不X"字
  {
    blocker: /(不是真的|并没有|并不是|假的|才不|别当真|别以为|当我真|当我傻).{0,6}(喜欢|爱|想你|梦到|惦记|牵挂|喜欢你|爱你|表白|对象|做我(女|男)?朋友|嫁给我|在一起)/,
    then: "comfort",
  },
  {
    blocker: /[^\p{L}](不|没)(?![着过开用忙饿顺在够对舒困累服方便巧安好心])(?=[^\p{L}]{0,4}(喜欢|爱|想你|喜欢你|爱你|梦到|惦记|牵挂|表白|对象|做我朋友|嫁给我|在一起))/u,
    then: "comfort",
  },
  { blocker: /(不|别|别发|不给|没有|不能).{0,3}(照片|图|视频|看看你|露)/, then: "reject" },
];

export function applyNegationGuard(message, proposedScenario) {
  for (const rule of NEGATION_GUARD) {
    if (rule.blocker.test(message)) {
      return rule.then;
    }
  }
  return proposedScenario;
}

/**
 * 从用户消息中提取变量值
 * {user} - 用户名（从消息中提取昵称，或者用默认）
 * {gift} - 礼物名
 * {amount} - 数量
 * {topic} - 话题/地点
 */
export function extractVariables(message) {
  const vars = { ...variables };

  // 提取用户名：匹配常见昵称格式
  const namePatterns = [
    /我叫([^\s,，。.!！?？]{1,8})/,
    /我是([^\s,，。.!！?？]{1,8})/,
    /([^\s,，。.!！?？]{1,10})来了/,
    /@([^\s,，。.!！?？]{1,10})/,
  ];
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      vars["{user}"] = match[1];
      break;
    }
  }

  // 提取礼物名
  const giftMatch = message.match(
    /(送了?|打赏|投喂|礼物)\s*(一个|一份|一些)?\s*([^\s,，。.!！?？]{1,8})/
  );
  if (giftMatch && giftMatch[3]) {
    vars["{gift}"] = giftMatch[3];
  }

  // 提取数量
  const amountMatch = message.match(/(\d+)\s*(个|份|次)/);
  if (amountMatch) {
    vars["{amount}"] = amountMatch[1];
  }

  // 提取地点/话题
  const topicMatch = message.match(
    /(在|来自|我是.*?人).*?([^\s,，。.!！?？]{2,6})/
  );
  if (topicMatch && topicMatch[2]) {
    vars["{topic}"] = topicMatch[2];
  }

  return vars;
}

/**
 * 意图正则：对关键意图做高优先级识别，优先于关键词打分
 * 用于处理"发张照片看看""在吗想你了"这类组合句
 */
const INTENT_RULES = [
  // ⚠️ 告白场景：优先级最高！比拒绝/感谢都高
  // 匹配"我爱你/我喜欢你/做我女朋友/做我对象/我爱死你了/爱你"
  {
    scenario: "confession",
    regex:
      /(我|真的|超级|太|最)(爱|喜欢)你|爱你$|我爱你$|做我(女|男)?朋友|做我对象|做(你|我)(男|女)朋友|表白|当我女朋友|嫁给我|能不能在一起|我想和你在?一起|能不能做我|我要和你在?一起/,
  },
  // 拒绝越界（硬拒绝类：借钱/裸露/脱/开房/约炮/私密照/开价/包养）— 优先级 2，走 reject 场景"硬刚型"话术
  {
    scenario: "reject",
    regex: new RegExp([
      "借(我|点|一下|.{0,4}(万|块|元|钱))",
      "(差|缺|需要|用).{0,5}(点|些|个)?(钱|万|块|元)",
      "周转.{0,12}(钱|万|块|元|不开)",
      "没钱了.{0,12}(给|借|帮|先)",
      "帮.{0,3}(我|咱).{0,3}(钱|块|万)",
      "能借.{0,6}(钱|万|块)",
      "有钱吗",
      "发.{0,4}(红包|钱)",
      "打.{0,4}钱",
      "裸.{1,3}(照|聊|体)",
      "脱.{0,2}(衣服|光)",
      "开房", "陪(我)?一晚", "约.{0,2}(一晚|炮)", "陪(睡|夜)",
      "私.{0,2}密.{0,2}照", "发骚", "视频.{0,2}(裸|聊|脱)",
      "看看.{0,4}(腿|胸|逼|JB|内裤|三点|骚)", "三点式", "内裤",
      "开价|多少钱.{0,6}(一晚|一次|包)|价格|报价",
      "包养|包月.{0,4}(多少钱|价格)|包周",
      "来一发|打一炮",
      "你值.{0,6}钱|出.{0,4}价|面.{0,4}交",
    ].join("|")),
  },
  // 🆕 发照片/视频/露脸（普通大哥委婉型）— 走 send_pic 场景（温柔婉拒），不能和 reject 混
  {
    scenario: "send_pic",
    regex:
      /(发|来|给我|想看|要).{0,5}(张|个|条|几)?(照片|自拍|相片|图片|图|视频)|(拍|录).{0,4}(张|个|段)?(照片|视频|自拍)|露.{0,3}(脸|肩|腰|身材)|看看你长|长什么(样子|样)|给我看看你|(你|本人)的(照片|视频|自拍)|素颜.{0,4}(看看|发|来)/,
  },
  // 🆕 PK拉票（第1场直播核心）
  {
    scenario: "pk_support",
    regex: /打PK|血条|(帮|上|守|偷|压|拉).{0,3}(塔|票|一波|过去)|加成|散票|拉票|PK(赢|输|了)|帮打.{0,6}PK|助力PK/,
  },
  // 🆕 下播感谢（大哥说刚帮下播/下播了）
  {
    scenario: "after_stream",
    regex:
      /(我|你|刚|准备|要|终于|总算).{0,3}(下(播|班)|关播|收工|播(完|结束))了|刚(下播|关播|收工)|下播啦.{0,10}(谢|晚安|想你|吃点啥)|直播(结束|完了)了/,
  },
  // 🆕 生日祝福（必须在 festival 前面，不然被覆盖）
  {
    scenario: "birthday",
    regex:
      /(今天|明天|我|哥|你|他)(.{0,5})生日|生日(快乐|快樂|到|过|愿望|许愿|礼物|蛋糕)|过生日|大寿|周岁(快乐|生日)|(几岁|多大)生日|吹蜡烛|生辰(快乐|生日)/,
  },
  // 🆕 深夜点歌（必须在 late_night/comfort 之前，不然被「失眠」覆盖）
  {
    scenario: "late_night_song",
    regex:
      /(给|帮|来|点|放|唱).{0,4}(我|你|我们|哥|一首|一首.{1,10}歌)?(歌|首歌|首.{1,8}|首听|首你唱)|(点|来|唱|放)一首.{0,20}(歌|听|唱)|想听歌|想听你(声音|唱|唱歌)|点了首|唱什么歌|歌名|点歌/,
  },
  // 感谢打赏：转账/红包/送礼物/上票刷礼（直播核心）
  {
    scenario: "gift_thanks",
    regex:
      /(转|发|打|刷|送|上|投|砸).{0,5}(钱|红包|心意|辛苦费|礼物|礼物|票|嘉年华|火箭|抖音|一号|游艇|跑车|城堡|花海|穿云箭)|(送|打赏|投喂|破费)了?|给你(刷|打赏|转|发)|(收|领)一下|打赏记录|上榜(一|二|三)|榜(一|二|三)/,
  },
  // 暧昧维护：想你/喜欢你/梦到/牵挂 —— 优先于打招呼
  {
    scenario: "ambiguous",
    regex: /(想|喜|爱)你|想你|梦到我|梦到|牵挂|惦记|念念不忘|好想|怎么不理我|在吗.{0,4}(想|喜欢)|想见你|(叫|喊|当|做|我).{0,2}(媳妇|老婆|宝贝|宝宝|亲爱的|爱人|娘子|太太|女友|女朋友|对象|妻子)|(媳妇|老婆|宝贝|宝宝|亲爱的).{0,2}(来|过来|在|亲|抱|呀|啊)|疼你|宠你|乖.{0,2}哦|不许走|要乖/,
  },
  // 节日祝福：xx快乐（⚠️ 注意：生日已从这里移除，走 birthday 场景）
  {
    scenario: "festival",
    regex: /(新年|春节|圣诞|元旦|中秋|国庆|情人节|七夕|跨年|除夕|端午|元宵|节日|周年|纪念日).{0,2}(快乐|好|到了)|新年快樂|新年好/,
  },
  // 哄人安抚：不开心/难过/委屈/生气（⚠️ 注意：失眠/孤独 不在这里，在 late_night）
  {
    scenario: "comfort",
    regex: /(不|好)(开心|高兴|舒服)|难过|心情不好|委屈|想哭|生气|吃醋|闹脾气|你变了|不在乎我|为什么.{0,2}不理我|被(骂|坑|骗|欺负)了.{0,10}(好烦|好难过|气死|不想干)|顶不住.{0,6}(压力|了)/,
  },
  // 回访跟进：好久不见/失联/人呢
  {
    scenario: "follow_up",
    regex: /好久不见|没.{0,2}(动静|消息)|怎么不找|想我了?吗|还记不记得|去哪了|消失|失联|还认识我吗/,
  },
  // 邀约见面：出来/见个面/喝茶
  {
    scenario: "invitation",
    regex: /见.{0,2}面|出来(玩|坐|吃|喝)?|约.{0,2}(饭|茶|咖啡)|什么时候有空|聚聚|碰个面|喝(茶|咖啡)/,
  },
  // 工作生活：加班/项目/老板/业绩
  {
    scenario: "work_life",
    regex: /加班|项目|老板|客户|开会|出差|业绩|赚钱|升职|压力大|工作忙|事业|生意|公司|团队|做生意/,
  },
  // 约饭美食：吃什么/饿死/想吃/肚子饿
  {
    scenario: "food",
    regex: /吃(什么|了没|了么|点|个)?|饿(死|了|得慌|不|坏|惨)|想(吃|吃点|吃啥)|肚子饿|没吃|没吃饭|美食|好吃|奶茶|咖啡|宵夜|外卖|吃货|饿坏|饿惨|饿瘪|饿晕|挨饿|饿到/,
  },
  // 周末安排：周末/假期/放假
  {
    scenario: "weekend",
    regex: /周末|假期|放假|去哪玩|打算|计划|出去(玩|浪)|宅(家|在家)|看电影|逛街|旅游/,
  },
  // 深夜谈心：睡不着/失眠/凌晨（⚠️ 注意：点歌不在这里，走 late_night_song）
  {
    scenario: "late_night",
    regex: /睡不(着|觉)|失眠|凌晨|深夜|一个人|孤独|寂寞|夜深|想聊天|陪我说话|无聊(?!.{0,10}(歌|点歌|唱歌))/,
  },
  // 回答个人问题：年龄/感情/联系方式
  {
    scenario: "personal_qa",
    regex: /(多大了?|几岁|哪里人|单身|有(男朋友|对象)|结婚|身高|体重|做什么的|真名|叫什么|微信|联系方式|手机号)/,
  },
  // 倾听吐槽：倒霉/烦死/气死/不想干
  {
    scenario: "complaint",
    regex: /倒霉|烦死|气死|不公平|被坑|奇葩|倒苦水|不想干|受不了|郁闷|遇到(烂人|奇葩)/,
  },
  // 回应夸奖：好看/漂亮/可爱
  {
    scenario: "compliment",
    regex: /(好|真|太|挺)?(看|漂亮|可爱|帅|迷人|有气质)|声音好听|好听|温柔|棒|优秀|厉害|赞/,
  },
  // 日常关怀：早安/晚安/下班/天气
  {
    scenario: "daily_care",
    regex: /(早|晚)安|起了|睡了|吃(饭|了|了没|了么)|下班|上班|累不累|辛苦|降温|下雨|注意身体|好好休息|天气/,
  },
  // 打招呼开场：在吗/忙吗/能聊聊
  {
    scenario: "greeting",
    regex: /^(在吗|在不在|忙吗|hi|hello|哈喽|嗨|能聊聊|打(个)?招呼|闪一下)/,
  },
];

/**
 * 🆕 组合规则匹配：当消息同时命中多个关键词组合时，强制归为指定场景
 * 例如："转了520 想你了" → 同时命中 ["转","520"] → gift_thanks（而不是 ambiguous）
 * @param {string} message 大哥原话
 * @returns {string|null} 匹配到的场景key，或 null
 */
function matchCombinationRules(message) {
  const lowerMsg = message.toLowerCase();
  let bestMatch = null;
  let bestPriority = 0;

  for (const rule of SCENARIO_COMBINATION_RULES) {
    // 检查该规则的所有关键词是否都出现在消息中
    let allHits = true;
    for (const kw of rule.keywords) {
      if (!lowerMsg.includes(kw.toLowerCase())) {
        allHits = false;
        break;
      }
    }
    if (allHits) {
      // 如果多个规则都命中，选优先级最高的
      if (rule.priority > bestPriority) {
        bestPriority = rule.priority;
        bestMatch = rule.scenario;
      }
    }
  }

  return bestMatch;
}

/**
 * 根据消息内容匹配最合适的场景
 * 0) 否定词保护（防止"我不喜欢你"被当暧昧）
 * 0b) 🆕 组合规则匹配（关键词组合强制锁定场景，如"转+520"=打赏）
 * 1) 先用意图正则做高优先级识别（处理组合句）
 * 2) 再用关键词打分做兜底，得分最高者胜出
 * 3) 都没命中则用 general 通用兜底
 */
export function matchScenario(message) {
  const lowerMsg = message.toLowerCase();

  // 0) 先跑否定词保护，拿到一个"被否定时的锁定场景"。命中任何一条，
  //    后面的正则/打分结果就必须让位于它（解决"我不喜欢你"被当暧昧的问题）
  const lockedByNegation = (() => {
    for (const rule of NEGATION_GUARD) {
      if (rule.blocker.test(message)) return rule.then;
    }
    return null;
  })();
  if (lockedByNegation) return lockedByNegation;

  // 🆕 0b) 组合规则匹配（优先级最高！解决"转了520想你了"被误判为暧昧的问题）
  //    当消息同时命中多个关键词组合时，强制归为指定场景
  const combinationMatch = matchCombinationRules(message);
  if (combinationMatch) return combinationMatch;

  // 1) 收集所有正则匹配（不再第一个匹配就返回）
  //    这样"饿死我了 媳妇来"可以同时命中 food 和 ambiguous，再用打分决定
  const regexMatches = [];
  for (const rule of INTENT_RULES) {
    if (rule.regex.test(message) || rule.regex.test(lowerMsg)) {
      regexMatches.push(rule.scenario);
    }
  }

  // 2) 关键词打分（QUOTE_WEIGHTS + scenario.keywords + 🆕组合规则得分）
  const scores = {};
  for (const [key, scenario] of Object.entries(scenarios)) {
    if (!scenario.keywords || scenario.keywords.length === 0) {
      scores[key] = 0;
      continue;
    }
    scores[key] = 0;
    for (const keyword of scenario.keywords) {
      if (lowerMsg.includes(keyword.toLowerCase())) {
        scores[key] += keyword.length >= 3 ? 2 : 1;
      }
    }
  }

  // 2b) 也把 QUOTE_WEIGHTS 的得分加进去
  for (const w of QUOTE_WEIGHTS) {
    for (const word of w.words) {
      if (lowerMsg.includes(word.toLowerCase())) {
        scores[w.scenario] = (scores[w.scenario] || 0) + w.weight * (word.length >= 3 ? 1.2 : 1);
      }
    }
  }

  // 🆕 2c) 组合规则也给打分加分（即使没完全命中，部分关键词也给加成）
  for (const rule of SCENARIO_COMBINATION_RULES) {
    let hitCount = 0;
    for (const kw of rule.keywords) {
      if (lowerMsg.includes(kw.toLowerCase())) hitCount++;
    }
    if (hitCount > 0) {
      // 命中越多关键词，得分越高
      const bonus = hitCount * rule.priority * 0.5;
      scores[rule.scenario] = (scores[rule.scenario] || 0) + bonus;
    }
  }

  // 3) 如果只有一个正则匹配 → 直接用（最常见的情况）
  if (regexMatches.length === 1) return regexMatches[0];

  // 4) 如果有多个正则匹配 → 用打分最高的那个
  if (regexMatches.length > 1) {
    let best = regexMatches[0];
    let bestScore = scores[best] || 0;
    for (const s of regexMatches) {
      const sc = scores[s] || 0;
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    return best;
  }

  // 5) 没有正则匹配 → 用打分最高的场景
  let bestScenario = default_scenario;
  let bestScore = 0;
  for (const [key, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestScenario = key;
    }
  }

  return bestScore > 0 ? bestScenario : default_scenario;
}

/**
 * 从数组中随机取一个元素
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 🆕 模板质量打分（主播友好度 0-100）
 * 评估维度：
 *  - 长度适中（30~150字最佳）
 *  - 无违禁词（滚/栓Q/操/SB 等）
 *  - 有情感回应（不能太机械）
 *  - 有变量占位符（{user}等个性化）
 *  - 语气自然（无标点堆叠）
 *  - 结构完整（有头有尾）
 */
const TOXIC_WORDS = [
  "滚", "栓Q", "操", "SB", "傻逼", "神经病", "有病", "脑子", "白痴",
  "讨厌", "滚开", "闭嘴", "废物", "垃圾", "混蛋", "王八蛋", "混账",
  "不要脸", "下流", "无耻", "贱人", "骚货", "婊子",
];

const QUALITY_BONUS_WORDS = [
  "哥", "宝", "亲爱的", "宝贝", "你", "我", "咱们", "一起", "好不好",
  "记得", "记性", "用心", "真的", "一直", "永远", "乖乖", "好好",
  "听着", "我懂", "理解", "陪", "抱抱", "别难过", "没事",
];

function scoreTemplateQuality(template) {
  if (!template || typeof template !== "string") return 0;
  let score = 60; // 基准分

  // 1) 长度评估（权重 20）
  const len = template.length;
  if (len < 15) score -= 30; // 太短：没诚意
  else if (len < 30) score -= 10; // 偏短
  else if (len >= 30 && len <= 150) score += 10; // 黄金区间
  else if (len > 150 && len <= 250) score += 5; // 可接受
  else if (len > 250) score -= 15; // 太长：像作文

  // 2) 违禁词检测（权重 30）
  for (const word of TOXIC_WORDS) {
    if (template.includes(word)) {
      score -= 20; // 每个违禁词扣20，可以叠加
      break; // 只扣一次，避免过度惩罚
    }
  }

  // 3) 情感回应词（权重 15）
  let bonusHits = 0;
  for (const word of QUALITY_BONUS_WORDS) {
    if (template.includes(word)) bonusHits++;
  }
  score += Math.min(bonusHits * 2, 15);

  // 4) 个性化变量（权重 10）
  const variableCount = (template.match(/\{[a-z_]+\}/g) || []).length;
  score += variableCount * 5;

  // 5) 标点堆叠检测（权重 10）
  const stackedPunct = template.match(/[!！]{2,}|[?？]{2,}|[~～]{2,}/g);
  if (stackedPunct) score -= 5;

  // 6) 结构完整度（权重 5）
  // 有多个句子 = 结构更完整
  const sentences = template.split(/[。！？!?\n]/).filter(s => s.trim().length > 3);
  if (sentences.length >= 2) score += 5;

  // 7) 自然口语化检测
  if (/[，,].*[，,]/.test(template)) score += 3; // 有逗号分隔 = 自然
  if (/[嘛哈哦啦呢呗诶唔咯喽啊喔]/.test(template)) score += 2; // 语气词 = 亲切

  return Math.max(0, Math.min(100, score));
}

/**
 * 🆕 场景组合规则：关键词组合匹配提升识别准确率
 * 当消息同时命中 A+B 关键词时，强制归为指定场景
 * 解决"转了520想你了"被误判为暧昧的问题
 */
const SCENARIO_COMBINATION_RULES = [
  // 打赏感谢类
  { name: "打赏", keywords: ["转", "520"], scenario: "gift_thanks", priority: 10 },
  { name: "打赏", keywords: ["转", "1314"], scenario: "gift_thanks", priority: 10 },
  { name: "打赏", keywords: ["发", "红包"], scenario: "gift_thanks", priority: 10 },
  { name: "打赏", keywords: ["刷", "礼物"], scenario: "gift_thanks", priority: 10 },
  { name: "打赏", keywords: ["刷", "嘉年华"], scenario: "gift_thanks", priority: 10 },
  { name: "打赏", keywords: ["上", "票"], scenario: "gift_thanks", priority: 8 },
  { name: "打赏", keywords: ["打赏"], scenario: "gift_thanks", priority: 8 },
  { name: "打赏", keywords: ["投喂"], scenario: "gift_thanks", priority: 8 },
  { name: "打赏", keywords: ["破费"], scenario: "gift_thanks", priority: 6 },

  // 越界拒绝类
  { name: "借钱", keywords: ["借", "钱"], scenario: "reject", priority: 9 },
  { name: "借钱", keywords: ["借", "万"], scenario: "reject", priority: 9 },
  { name: "借钱", keywords: ["周转"], scenario: "reject", priority: 8 },
  { name: "约炮", keywords: ["开价"], scenario: "reject", priority: 9 },
  { name: "约炮", keywords: ["包养"], scenario: "reject", priority: 9 },
  { name: "索要照片", keywords: ["发", "照片"], scenario: "send_pic", priority: 8 },
  { name: "索要照片", keywords: ["发", "视频"], scenario: "send_pic", priority: 8 },
  { name: "索要照片", keywords: ["看看", "你"], scenario: "send_pic", priority: 7 },

  // 告白类
  { name: "告白", keywords: ["做", "女朋友"], scenario: "confession", priority: 9 },
  { name: "告白", keywords: ["做", "对象"], scenario: "confession", priority: 9 },
  { name: "告白", keywords: ["嫁给我"], scenario: "confession", priority: 10 },
  { name: "告白", keywords: ["在一起"], scenario: "confession", priority: 8 },
  { name: "告白", keywords: ["追你"], scenario: "confession", priority: 8 },

  // PK拉票
  { name: "PK", keywords: ["PK", "帮"], scenario: "pk_support", priority: 8 },
  { name: "PK", keywords: ["血条"], scenario: "pk_support", priority: 9 },
  { name: "PK", keywords: ["守塔"], scenario: "pk_support", priority: 8 },

  // 深夜点歌
  { name: "点歌", keywords: ["点", "歌"], scenario: "late_night_song", priority: 9 },
  { name: "点歌", keywords: ["唱", "一首"], scenario: "late_night_song", priority: 8 },

  // 下播
  { name: "下播", keywords: ["下播"], scenario: "after_stream", priority: 8 },

  // 生日
  { name: "生日", keywords: ["生日"], scenario: "birthday", priority: 8 },

  // 吃饭
  { name: "吃饭", keywords: ["饿", "吃"], scenario: "food", priority: 7 },
  { name: "吃饭", keywords: ["没", "吃饭"], scenario: "food", priority: 8 },
];

/**
 * 🆕 按消息相关性加权挑模板（解决"答非所问"）
 * 三层理解：
 *  0) 模板质量打分：优先选高质量模板
 *  1) 意图动作匹配：消息含「借钱/想睡/约见面/表白」等动作词 → 模板必须回应这个动作
 *  2) 实体词命中：消息含「嘉年华/3万/张总」→ 模板含同实体或泛化词
 *  3) 语义片段命中：2~4 字片段重叠度
 * 综合打分，top-k 池随机
 */
function splitChunks(msg) {
  // 去掉常见停用词 + 标点，切成 2~4 字片段
  const clean = msg.replace(/[，。！？!?,.\s]/g, "");
  const chunks = new Set();
  for (let i = 0; i < clean.length - 1; i++) {
    for (let n = 2; n <= 4 && i + n <= clean.length; n++) {
      const seg = clean.slice(i, i + n);
      // 跳过纯数字、过短无意义词
      if (/^\d+$/.test(seg)) continue;
      chunks.add(seg);
    }
  }
  return Array.from(chunks);
}

/**
 * 🆕🆕🆕 意图动作识别器
 * 从大哥原话里抽出"动作意图词"——他到底想让主播干什么
 * 返回一组动作标签 + 对应的"主播回应关键词池"
 * 模板命中"回应关键词池"的任意一个，就视为"语义对齐"
 */
const INTENT_ACTIONS = [
  {
    action: "借钱",
    triggers: [/借.{0,6}钱/, /周转.{0,6}(不开|困难|不开)/, /能借.{0,4}(钱|万|块)/, /差.{0,4}钱/, /需要.{0,4}(万|块|钱)/, /有钱吗/],
    // 模板里出现这些词 = 在回应"借钱"动作
    replyHints: ["借", "钱", "周转", "不借", "不能借", "没有", "帮不上", "手头", "不好意思", "确实", "难处"],
    weight: 3,
  },
  {
    action: "约炮/性交易",
    triggers: [/开房/, /约炮/, /陪睡/, /陪夜/, /开价/, /多少钱.{0,4}(一晚|一次)/, /包养/],
    replyHints: ["原则", "不行", "不可能", "想得美", "做梦", "滚", "别想", "休想", "越界", "底线", "尊重", "不是那种"],
    weight: 3,
  },
  {
    action: "索要私照",
    triggers: [/发.{0,4}(照片|自拍|素颜|私照)/, /发.{0,4}视频/, /看看你/, /露脸/, /脱/, /裸/],
    replyHints: ["照片", "视频", "直播间", "私下", "不方便", "不喜欢", "看直播", "镜头", "现场"],
    weight: 3,
  },
  {
    action: "表白告白",
    triggers: [/我喜欢你/, /我爱你/, /做我女朋友/, /做我对象/, /在一起/, /嫁给我/, /追你/, /表白/],
    replyHints: ["喜欢", "在一起", "答应", "愿意", "女朋友", "对象", "朋友", "慢热", "时间", "了解", "考察", "试用期", "拒绝", "不可能", "矜持"],
    weight: 3,
  },
  {
    action: "线下邀约",
    triggers: [/见个面/, /见面/, /出来玩/, /约饭/, /喝茶/, /咖啡/, /有空出来/, /一起吃/, /周末.{0,4}(有空|出来|约)/],
    replyHints: ["见面", "出来", "吃饭", "喝茶", "咖啡", "约", "再说", "不方便", "以后", "下次", "直播间", "先聊"],
    weight: 2,
  },
  {
    action: "刷礼物",
    triggers: [/给你刷/, /刷了/, /打赏/, /投喂/, /送你/, /给你转/, /心意/, /破费/, /嘉年华/, /火箭/, /游艇/, /跑车/, /穿云箭/],
    replyHints: ["刷", "礼物", "心意", "破费", "心疼", "记在", "身体", "感谢", "谢啦", "谢谢", "别太累", "下次"],
    weight: 2,
  },
  {
    action: "吃饭/饿了",
    triggers: [/饿(死|了|得慌|坏|惨|瘪|晕|到)?/, /没吃饭/, /没吃/, /吃了没/, /吃了吗/, /想吃/, /吃点/, /肚子饿/, /饿得慌/, /饿坏/, /饿惨/],
    replyHints: ["吃饭", "饿着", "饿了", "快去", "吃点", "没吃饭", "赶紧", "饿坏", "饿惨", "饿肚子", "吃饭去", "吃点东西", "别饿着", "好好吃饭"],
    weight: 3,
  },
  {
    action: "PK拉票",
    triggers: [/PK/, /打PK/, /血条/, /上票/, /守塔/, /偷塔/, /加成/, /散票/, /压过去/, /助力/],
    replyHints: ["PK", "血条", "上票", "守塔", "偷塔", "票", "加成", "助力", "守", "塔"],
    weight: 2,
  },
  {
    action: "点歌",
    triggers: [/点歌/, /唱首歌/, /给我唱/, /想听你唱/, /来一首/, /点一首/],
    replyHints: ["唱", "歌", "点歌", "来一首", "歌名", "想听", "点", "唱什么"],
    weight: 2,
  },
  {
    action: "求安慰",
    triggers: [/不开心/, /难过/, /委屈/, /想哭/, /心情不好/, /郁闷/, /压力大/, /顶不住/, /难受/, /被欺负/],
    replyHints: ["听着", "我懂", "理解", "陪", "抱抱", "别难过", "没事", "慢慢", "心疼", "陪你说", "情绪"],
    weight: 2,
  },
  {
    action: "吐槽抱怨",
    triggers: [/倒霉/, /烦死/, /气死/, /被坑/, /奇葩/, /受不了/, /不想干/, /苦水/, /不公平/, /操蛋/],
    replyHints: ["听着", "气", "吐槽", "发泄", "陪你骂", "理解", "奇葩", "过分", "同款", "握爪"],
    weight: 2,
  },
  {
    action: "生日",
    triggers: [/生日/, /过生日/, /生日快乐/, /蛋糕/, /许愿/, /吹蜡烛/],
    replyHints: ["生日", "快乐", "蛋糕", "许愿", "蜡烛", "岁", "礼物", "祝福"],
    weight: 2,
  },
  {
    action: "节日",
    triggers: [/新年快乐/, /春节/, /圣诞/, /元旦/, /中秋/, /国庆/, /情人节/, /七夕/, /跨年/, /除夕/, /端午/, /元宵/, /节日快乐/],
    replyHints: ["节日", "快乐", "同乐", "祝福", "阖家", "安康"],
    weight: 2,
  },
  {
    action: "深夜陪伴",
    triggers: [/睡不着/, /失眠/, /凌晨/, /深夜/, /一个人/, /孤独/, /寂寞/, /无聊/, /陪我说话/, /还没睡/, /你睡了吗/],
    replyHints: ["睡", "陪", "聊", "夜晚", "凌晨", "一个人", "孤独", "寂寞", "陪你", "别怕", "在的"],
    weight: 2,
  },
  {
    action: "日常关心",
    triggers: [/早安/, /晚安/, /吃了吗/, /吃了没/, /下班/, /上班/, /累不累/, /辛苦/, /注意身体/],
    replyHints: ["早", "晚安", "吃", "下班", "上班", "累", "辛苦", "身体", "注意"],
    weight: 1,
  },
  {
    action: "打听隐私",
    triggers: [/多大了/, /几岁/, /哪里人/, /有对象吗/, /单身吗/, /结婚了吗/, /身高/, /真名/, /叫什么/, /微信多少/, /联系方式/, /电话/],
    replyHints: ["不方便", "不能说", "保密", "隐私", "私人", "不告诉", "多大", "单身", "年龄", "名字", "微信"],
    weight: 2,
  },
  {
    action: "工作生活",
    triggers: [/加班/, /老板/, /客户/, /开会/, /出差/, /业绩/, /项目/, /公司/, /升职/, /赚钱/, /生意/, /失业/],
    replyHints: ["加班", "老板", "客户", "开会", "出差", "业绩", "项目", "公司", "升职", "赚钱", "生意", "失业", "辛苦", "理解"],
    weight: 1,
  },
];

/**
 * 🆕 提取消息的意图动作
 */
function extractIntents(message) {
  const found = [];
  for (const it of INTENT_ACTIONS) {
    for (const re of it.triggers) {
      if (re.test(message)) {
        found.push(it);
        break;
      }
    }
  }
  return found;
}

/**
 * 🆕 提取消息的实体（金额/礼物名/称呼）
 */
function extractEntities(message) {
  const entities = [];
  // 金额
  const amountMatch = message.match(/(\d+(?:\.\d+)?)\s*(万|千|百|块|元|大洋|RMB|￥)/g);
  if (amountMatch) entities.push(...amountMatch);
  // 礼物名
  const giftMatch = message.match(/嘉年华|火箭|游艇|跑车|城堡|花海|穿云箭|棒棒糖|爱心|亲吻/g);
  if (giftMatch) entities.push(...giftMatch);
  return entities;
}

function pickByRelevance(templates, message, vars = {}) {
  if (!templates || templates.length === 0) return null;
  if (templates.length === 1) return templates[0];

  // 🆕 预先计算每个模板的质量分（缓存避免重复计算）
  const qualityCache = new Map();
  const getQuality = (t) => {
    if (!qualityCache.has(t)) {
      qualityCache.set(t, scoreTemplateQuality(t));
    }
    return qualityCache.get(t);
  };

  // 🆕 第 0 层：先过滤掉极低质量模板（质量分 < 30 的直接排除）
  // 但保留至少 2 个模板，避免全被过滤
  const highQualityTemplates = templates.filter(t => getQuality(t) >= 30);
  const workingTemplates = highQualityTemplates.length >= 2 ? highQualityTemplates : templates;

  // 🆕🆕🆕 第 1 层：意图动作匹配
  const intents = extractIntents(message);
  const entities = extractEntities(message);

  const chunks = splitChunks(message);
  if (chunks.length === 0 && intents.length === 0) {
    // 无关键词 → 按质量分加权随机选
    const weights = workingTemplates.map(t => getQuality(t));
    return weightedRandom(workingTemplates, weights);
  }

  // 给每个模板打分（四维度加权 + 质量分加成）
  const scored = workingTemplates.map(t => {
    let s = 0;
    let intentHit = false;

    // 维度 A：意图动作匹配（权重最高）
    for (const it of intents) {
      // 模板命中该动作的"回应关键词池"任意一个 = 语义对齐
      const hitReply = it.replyHints.some(h => t.includes(h));
      if (hitReply) {
        s += it.weight * 4;
        intentHit = true;
      }
    }

    // 维度 B：实体词命中
    for (const e of entities) {
      if (t.includes(e)) s += 3;
      // 数字实体（如 3万）即使没原样出现，模板含"钱/万/块"也算半命中
      const num = e.match(/\d+/);
      if (num && (t.includes("钱") || t.includes("万") || t.includes("块"))) s += 1;
    }

    // 维度 C：2~4 字语义片段命中
    for (const c of chunks) {
      if (t.includes(c)) s += c.length >= 3 ? 2 : 1;
      // 变量替换后的命中也算
      for (const v of Object.values(vars)) {
        if (v && t.replace("{user}", v).replace("{brother}", v).includes(c)) {
          s += 1;
          break;
        }
      }
    }

    // 🆕 维度 D：模板质量分加成（0-100 分归一化到 0-10 加成）
    const qualityScore = getQuality(t);
    s += (qualityScore / 10); // 最高 +10 分

    return { t, s, intentHit, quality: qualityScore };
  });

  const maxScore = Math.max(...scored.map(x => x.s));

  // 🆕 如果有意图识别，且至少一个模板命中意图，则只在"命中意图"的模板池里选
  if (intents.length > 0) {
    const intentMatched = scored.filter(x => x.intentHit);
    if (intentMatched.length > 0) {
      // 在意图匹配池里，再按总分 top-k 随机
      const maxIntent = Math.max(...intentMatched.map(x => x.s));
      const threshold = Math.max(1, Math.ceil(maxIntent * 0.5));
      const topK = intentMatched.filter(x => x.s >= threshold).map(x => x.t);
      // 🆕 用质量分加权随机，而不是纯随机
      if (topK.length > 0) {
        const weights = topK.map(t => getQuality(t));
        return weightedRandom(topK, weights);
      }
      return pickRandom(intentMatched.map(x => x.t));
    }
    // 意图识别了但没有模板命中意图关键词 → 回退到总分 top-k
    // （说明模板库可能不够全，但仍要避免完全随机）
  }

  if (maxScore === 0) {
    // 没有任何模板命中 → 走按质量分加权随机，偏向中等长度
    const nat = workingTemplates.filter(t => t.length >= 30 && t.length <= 140);
    const pool = nat.length ? nat : workingTemplates;
    const weights = pool.map(t => getQuality(t));
    return weightedRandom(pool, weights);
  }

  // 取分数 >= 60% 最高分的模板作为 top-k 池
  const threshold = Math.max(1, Math.ceil(maxScore * 0.6));
  const topK = scored.filter(x => x.s >= threshold).map(x => x.t);
  if (topK.length > 0) {
    const weights = topK.map(t => getQuality(t));
    return weightedRandom(topK, weights);
  }
  return pickRandom(workingTemplates);
}

/**
 * 🆕 加权随机选择：高质量模板被选中的概率更高
 */
function weightedRandom(arr, weights) {
  if (!arr || arr.length === 0) return null;
  if (arr.length === 1) return arr[0];

  // 确保权重为正数
  const safeWeights = weights.map(w => Math.max(1, w));
  const total = safeWeights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= safeWeights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1]; // fallback
}

/**
 * 用变量替换模板中的占位符
 */
function fillTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value);
  }
  return result;
}

/**
 * 为指定性格生成单条回复（支持手动覆盖场景 & 话术强度）
 */
export function generateOne(message, personalityKey, scenarioOverride = null, intensity = "daily") {
  const detectedScenarioKey = matchScenario(message);
  const scenarioKey = scenarioOverride || detectedScenarioKey;
  const scenario = scenarios[scenarioKey];
  if (!scenario) return null;
  const vars = extractVariables(message);

  const personality = personalities[personalityKey];
  if (!personality) return null;

  const templates = scenario.templates[personalityKey];
  if (!templates || templates.length === 0) return null;

  const template = pickByRelevance(templates, message, vars);
  const rawText = fillTemplate(template, vars);
  const text = applyEngagementSafety(humanizeText(rawText, personalityKey, intensity, { message }));

  return {
    personality: personalityKey,
    label: personality.label,
    emoji: personality.emoji,
    scenarioKey,
    scenario: scenario.label,
    intensity,
    text,
  };
}

/**
 * 为选中的性格批量生成回复
 * @param {string} message
 * @param {string[]} selectedPersonalities
 * @param {string|null} scenarioOverride
 * @param {"warmup"|"daily"|"heatup"} intensity
 */
export function generateReplies(message, selectedPersonalities, scenarioOverride = null, intensity = "daily") {
  if (!message || !message.trim() || selectedPersonalities.length === 0) {
    return [];
  }

  const results = [];
  const MAX_COUNT = 3; // 多选性格最多显示 3 条（用户要求）

  // 单选：直接 1 条（不再补其他）
  if (selectedPersonalities.length === 1) {
    const one = generateOne(message, selectedPersonalities[0], scenarioOverride, intensity);
    if (one) results.push(one);
    return results.slice(0, MAX_COUNT);
  }

  // 选 2 个性格：2 主卡 + 1 混搭卡 = 恰好 3 条
  if (selectedPersonalities.length === 2) {
    for (const personalityKey of selectedPersonalities) {
      const one = generateOne(message, personalityKey, scenarioOverride, intensity);
      if (one) results.push(one);
    }
  }

  // 选 ≥3 个性格：不再重复主卡，改成 1 主卡 + 2 条不同组合混搭
  // （避免回复全是同一套主模板，真正显示出"多选的层次感"）
  if (selectedPersonalities.length >= 3) {
    const firstKey = selectedPersonalities[0];
    const one = generateOne(message, firstKey, scenarioOverride, intensity);
    if (one) results.push(one);
  }

  // 混搭卡组合（最多补足到 MAX_COUNT=3）
  let combos = [];
  if (selectedPersonalities.length === 2) {
    combos.push([selectedPersonalities[0], selectedPersonalities[1]]);
  } else if (selectedPersonalities.length >= 3) {
    // 从选中的性格里，抽 2 组不一样的性格对 做混搭
    combos.push([selectedPersonalities[0], selectedPersonalities[1]]);
    combos.push([selectedPersonalities[0], selectedPersonalities[2]]);
    if (selectedPersonalities[2] !== selectedPersonalities[1] && selectedPersonalities[3]) {
      // 如果用户选了 4+ 个，再加 1 组 主 × 第 4 性格（防重复）
      combos.pop();
      combos.push([selectedPersonalities[0], selectedPersonalities[2]]);
      combos.push([selectedPersonalities[1], selectedPersonalities[3]]);
    }
  }

  const detectedScenarioKey = matchScenario(message);
  const scenarioKey = scenarioOverride || detectedScenarioKey;
  const scenario = scenarios[scenarioKey];
  const vars = extractVariables(message);

  for (const [primaryKey, voiceKey] of combos) {
    if (results.length >= MAX_COUNT) break;
    const templates = scenario?.templates?.[primaryKey];
    const p1 = personalities[primaryKey];
    const p2 = personalities[voiceKey];
    if (templates && templates.length > 0 && p1 && p2 && primaryKey !== voiceKey) {
      const rawText = fillTemplate(pickByRelevance(templates, message, vars), vars);
      const text = humanizeText(rawText, voiceKey, intensity, { message });
      results.push({
        personality: `${primaryKey}+${voiceKey}`,
        label: `${p1.label}·${p2.label}混搭`,
        emoji: `${p1.emoji}${p2.emoji}`,
        scenarioKey,
        scenario: scenario.label,
        intensity,
        text,
        isBlend: true,
      });
    }
  }

  return results.slice(0, MAX_COUNT);
}

/** 话术统计（给 footer 用） */
export function getStats() {
  let totalTemplates = 0;
  let highQualityCount = 0;
  const scenarioKeys = Object.keys(scenarios);
  for (const sk of scenarioKeys) {
    const tpl = scenarios[sk].templates;
    for (const pk of Object.keys(tpl)) {
      const arr = Array.isArray(tpl[pk]) ? tpl[pk] : [];
      totalTemplates += arr.length;
      for (const t of arr) {
        if (scoreTemplateQuality(t) >= 60) highQualityCount++;
      }
    }
  }
  return {
    scenarios: scenarioKeys.length,
    personalities: Object.keys(personalities).length,
    templates: totalTemplates,
    highQualityTemplates: highQualityCount,
    qualityCoverage: totalTemplates > 0 ? Math.round((highQualityCount / totalTemplates) * 100) : 0,
    combinationRules: SCENARIO_COMBINATION_RULES.length,
  };
}

/** 场景列表给 UI 下拉用 */
export function getScenarioList() {
  return Object.entries(scenarios).map(([key, val]) => ({
    key,
    label: val.label,
  }));
}

export { personalities, scenarios };

/* ======================================================================
   🔥 1v1 大哥原话专属引擎（主播真正用的"把大哥粘进来→出8张卡"）
   - analyzeBrotherQuote(message, opts)：深度识别，返回 场景/意图/情绪/称呼/越界/建议
   - generateOnePerPersonality(message, opts)：一次返回 8 个性格各 1 条 1v1 专属回复
   - 支持称呼替换：opts.brotherName / opts.address（哥/宝/老板/X哥/...）
   - 支持主播名/昵称：opts.hostName
   ====================================================================== */

// 📌 称呼识别（从大哥原话的"自称/对主播称呼"里抓，反推我们该怎么回称呼）
//    ⚠️ 必须是"大哥视角"的语境：前面不能有 被/跟/和/找/骂/见/找老板 这类
const ADDRESS_PATTERNS = [
  // 大哥自称（我是/我叫/你叫我/以后叫我 + 称呼）
  { re: /(^|[^\p{L}])我(是|叫|们?就|以后就?)[^。!\s]{0,6}(哥|老板|总|爷|弟|兄弟|哥哥)/u, suggest_override: true },
  // 大哥对主播的称呼 → 反过来推断我们怎么叫他
  { re: /(?<![被跟和找骂见怼换跟])(?<![不把给对])妹妹|(?<![被跟和找骂见怼换跟])小妹|小([^\s,，。!！?？]{1,4})妹/, suggest: "哥" },
  { re: /(?<![被跟和找骂见怼换跟])(?<![不把给对])美女|小姐姐|仙女|妞/, suggest: "哥" },
  { re: /老婆|媳妇儿|媳妇|宝贝|宝宝|小宝/, suggest: "宝~", tone: "warm" },
  {
    // 老板/总：排除"被老板/跟老板/找老板/公司老板"这类词前面的动词语境
    re: /(^|[^\p{L}不把给对被跟和找骂见怼换跟公司])(老板|总|([^\s,，。!！?？]{1,4})总)(?=$|[^\p{L}总])/u,
    suggest: "老板",
  },
  { re: /(?<![被跟和找骂见怼换跟])(?<![不把给对])姐|姐姐/, suggest: "哥" },
  { re: /亲爱的|honey|darling|乖乖/, suggest: "亲爱的~", tone: "warm" },
];

// 📌 情绪/温度识别：0=冷,1=平,2=热,3=越界, -1=负情绪（抱怨/生气/难过）
const TONE_RULES = [
  { level: 3, tags: ["越界直白"], re: /开房|裸|脱|炮|骚|色|洗澡|床上|陪睡|陪夜|内裤|三点|奶|逼|jb|做爱|性交/ },
  { level: 2, tags: ["热情", "想进一步"], re: /爱你|喜欢你|想你|宝贝|宝宝|亲爱的|梦到你|想抱着|亲|抱|么么|啵|约会|见面/ },
  { level: -1, tags: ["生气", "抱怨"], re: /你变了|不理我|不重视|失望|骗我|忽悠|糊弄|套路|假|虚伪|伤心|寒心/ },
  { level: -2, tags: ["难过", "低落"], re: /难过|想哭|孤独|撑不住|要疯了|崩溃|绝望|无助|失眠|抑郁/ },
  { level: 1, tags: ["日常", "普通关心"], re: /在吗|吃了|早安|晚安|天气|累不累|辛苦|下班|上班|起了吗/ },
];

// 📌 56+ 关键词权重打分（原话专属引擎兜底，比通用打分更精准）
const QUOTE_WEIGHTS = [
  // 直播业务类（权重高，主播核心场景）
  { scenario: "pk_support", weight: 5, words: ["PK","打PK","pk","血条","上票","守塔","偷塔","加成","散票","拉票","压过去","秒了","助力"] },
  { scenario: "gift_thanks", weight: 5, words: ["给你刷了","刷了多少","刷礼物","送你","打赏","投喂","发了个红包","给你转","破费了","心意收到没","上了多少票","上榜一","榜一","榜二"] },
  { scenario: "after_stream", weight: 5, words: ["下播了","下播啦","刚下播","关播了","播完了","收工","直播结束","今天播了多久","下播吃什么","下播晚安"] },
  { scenario: "late_night_song", weight: 5, words: ["点歌","唱首歌","给我唱","唱歌","想听你唱","点了首","来一首","点一首","唱什么","歌名","你唱得好听"] },
  { scenario: "send_pic", weight: 5, words: ["照片","视频","露脸","自拍","看看你","长什么样","发张","发个照片","素颜","拍个视频","拍张照"] },
  { scenario: "birthday", weight: 5, words: ["生日","过生日","生日快乐","大寿","蛋糕","许愿","吹蜡烛","几岁","周岁","生辰"] },
  { scenario: "confession", weight: 6, words: ["我爱你","我喜欢你","做我女朋友","做我对象","表白","嫁给我","在一起","想追你","追你","你单身吗","我想你做我"] },
  { scenario: "reject", weight: 7, words: ["借钱","借我钱","能借点","需要钱","周转","借个","发照片","裸聊","脱","开房","约炮","陪我一晚","私照","看看腿","看看胸","骚","开价","多少钱","包养"] },
  { scenario: "ambiguous", weight: 3, words: ["想你","梦到","牵挂","惦记","喜欢你","想抱抱","想亲亲","好想","怎么不理我","在吗想你","想见你","想视频","想语音","媳妇","老婆","宝贝","宝宝","亲爱的","疼你","宠你","乖哦","不许走","要乖"] },
  { scenario: "invitation", weight: 4, words: ["见个面","见面","出来玩","约饭","喝茶","咖啡","什么时候有空","有空出来","一起吃个饭","坐坐","喝一杯","聚聚"] },
  { scenario: "comfort", weight: 4, words: ["不开心","难过","委屈","生气","吃醋","想哭","心情不好","郁闷","压力大","顶不住","难受","想哭了","被欺负了"] },
  { scenario: "complaint", weight: 4, words: ["倒霉","烦死","气死","被坑","奇葩","受不了","不想干","郁闷","苦水","不公平","操蛋","狗日","SB","傻逼","垃圾"] },
  { scenario: "follow_up", weight: 4, words: ["好久不见","去哪了","消失了","没消息","怎么不说话","还认识我吗","想我了吗","多久没来了","最近咋样"] },
  { scenario: "daily_care", weight: 2, words: ["早安","晚安","吃了吗","吃了没","下班","上班","累不累","辛苦","吃饭了吗","早饭","午饭","晚饭","吃点好的","别饿","注意身体"] },
  { scenario: "festival", weight: 4, words: ["新年快乐","春节","圣诞","元旦","中秋","国庆","情人节","七夕","跨年","除夕","端午","元宵","节日快乐","祝福"] },
  { scenario: "compliment", weight: 3, words: ["好看","漂亮","可爱","声音好听","唱歌好听","你真美","身材好","有气质","耐看","笑起来好看","你好瘦","眼睛好看"] },
  { scenario: "personal_qa", weight: 4, words: ["多大了","几岁","哪里人","有对象吗","单身吗","结婚了吗","身高","多少斤","真名","叫什么","微信多少","联系方式","电话","有男朋友吗"] },
  { scenario: "work_life", weight: 3, words: ["加班","老板","客户","开会","出差","业绩","项目","公司","升职","赚钱","生意","亏损","失业","换工作","面试","压力"] },
  { scenario: "food", weight: 2, words: ["吃什么","饿了","饿死","饿坏","饿惨","饿得慌","想吃","吃点","奶茶","好吃","美食","咖啡","宵夜","外卖","吃货","吃了啥","推荐吃","火锅","烧烤","麻辣烫","饿到","没吃","没吃饭","肚子饿","饿死我"] },
  { scenario: "weekend", weight: 2, words: ["周末","放假","假期","去哪玩","出去玩","宅家","看电影","逛街","旅游","计划","打算","周日","周六","五一","国庆假"] },
  { scenario: "late_night", weight: 3, words: ["睡不着","失眠","凌晨","深夜","一个人","孤独","寂寞","无聊","想聊天","陪我说话","还没睡","你睡了吗"] },
  { scenario: "greeting", weight: 1, words: ["在吗","在不在","忙吗","哈喽","嗨","hi","hello","闪一下","打招呼","能聊聊么","你好"] },
];

/**
 * 🧠 深度分析大哥原话（1v1 引擎的核心）
 * @param {string} message 大哥原话
 * @param {{brotherName?:string, address?:string, hostName?:string}} opts
 * @returns {{
 *   scenarioKey: string,
 *   scenarioLabel: string,
 *   toneLevel: number,
 *   toneTags: string[],
 *   emotionIntensity: number,    // 🆕 情绪强度 0-100
 *   interactStage: string,       // 🆕 互动阶段：陌生/熟络/暧昧/危险
 *   spendingPower: string,      // 🆕 消费力预测：低/中/高/超高
 *   replyDifficulty: string,    // 🆕 回复难度：简单/中等/困难/高危
 *   riskScore: number,           // 🆕 风险评分 0-100
 *   intent: string,              // 🆕 意图总结（一句话）
 *   suggestAddress: string,   // 建议主播怎么称呼对方
 *   suggestIntensity: string, // warmup/daily/heatup
 *   crossLine: boolean,       // 是否越界（借钱/索要私照/约炮等）
 *   crossLineType: string,    // 越界分类
 *   brotherType: string,      // 大哥画像：沉默榜一型 / 热情聊骚型 / 越界试探型 / 日常打卡型 / 失意求安慰型 / 维护型
 *   customVars: Record<string,string>,
 *   matchedWords: string[],
 *   replyHints: string[],     // 给主播的小贴士
 * }}
 */
export function analyzeBrotherQuote(message, opts = {}) {
  const msg = message || "";

  // 1) 先走高优先级的正则识别（复用通用引擎，更稳）
  const scenarioKey = matchScenario(msg);
  const scenarioLabel = scenarios[scenarioKey]?.label || scenarios[default_scenario].label;

  // 2) 情绪/越界判定（最大绝对值优先；同级时优先负面风险）
  let toneLevel = 0;
  let toneTags = [];
  for (const rule of TONE_RULES) {
    if (rule.re.test(msg)) {
      const stronger = Math.abs(rule.level) > Math.abs(toneLevel);
      const saferTie = Math.abs(rule.level) === Math.abs(toneLevel) && rule.level < toneLevel;
      if (stronger || saferTie) {
        toneLevel = rule.level;
        toneTags = [...rule.tags];
      }
    }
  }

  // 3) 越界二次识别：分类
  let crossLine = false;
  let crossLineType = "";
  if (/借(我|点)?钱|周转|差.{0,4}钱|需要.{0,4}万|需要.{0,4}块|没钱了.{0,10}(给|借|帮)|能借.{0,6}(钱|万|块)|有钱吗|发.{0,4}(红包|钱)|打.{0,4}钱/.test(msg)) {
    crossLine = true; crossLineType = "借钱要钱";
  } else if (/发.{0,4}(照片|视频|自拍|素颜|胸|腿)|露.{0,3}(脸|肩|腰|胸|腿)|裸|脱(了|掉|光|衣服)|露三点|三点式|内裤|私(照|密)|看看(你|身材|腿)|视频裸|裸聊/.test(msg)) {
    crossLine = true; crossLineType = "索要私照/视频";
  } else if (/开房|约炮|陪睡|陪夜|一晚上|过夜|床上|做爱|性交|睡一晚|来一发|打一炮/.test(msg)) {
    crossLine = true; crossLineType = "明确约炮/涉黄";
  } else if (/开价|多少钱|价格|报价|包养|包月|包周|一次.{0,4}多少钱|一晚.{0,4}多少|你值.{0,6}钱|出.{0,4}价|面.{0,4}交/.test(msg)) {
    crossLine = true; crossLineType = "涉黄交易(开价类)";
  } else if ((/加.{0,3}微信|留.{0,4}联系|手机号|电话/.test(msg)) && (/见面|出来玩|约|私下|出去|吃饭|喝.{0,2}一杯/.test(msg) || /开价|多少钱|包养/.test(msg))) {
    crossLine = true; crossLineType = "急着加私人联系方式(线下邀约)";
  } else if (/((地址|位置|在哪住|住哪|你家|公司地址|工作地|学校|具体位置).{0,20}(哪|？|\?))|((在哪|地址|位置)发我|给我.{0,4}(地址|位置))/.test(msg)) {
    crossLine = true; crossLineType = "打探地址/个人隐私";
  }

  // ⚠️ 越界场景强制覆盖场景key为 reject（借钱/约炮/开价）或 send_pic（要照片）
  // 这样确保 1v1 模式一定命中越界专用模板，而不是通用模板
  let finalScenarioKey = scenarioKey;
  if (crossLine) {
    if (crossLineType === "索要私照/视频") {
      finalScenarioKey = "send_pic";
    } else {
      finalScenarioKey = "reject";
    }
  }

  // 4) 称呼建议 —— 用户在高级设置里主动填的 address 优先级最高，不被自动识别覆盖
  let suggestAddress = opts.address || "哥";
  // 用户主动填了称呼 → 完全信任用户，跳过自动识别覆盖（但仍走一遍模式匹配以拾取情绪/语气）
  let overrideDone = !!opts.address;
  for (const p of ADDRESS_PATTERNS) {
    if (p.re.test(msg)) {
      if (p.suggest_override) {
        // 大哥自称：抓他后面的称呼词（哥/老板/总）做 主播的回应称呼（一般还是"哥"，只有说「我是X总/我是老板」才叫对应）
        const m = msg.match(p.re);
        const suffix = m && (m[3] || m[4] || m[0].slice(-2));
        if (!overrideDone) {
          if (/老板|总/.test(suffix || "")) suggestAddress = suffix?.includes("老板") ? "老板" : (suffix + "总").replace(/总总$/, "总");
          else suggestAddress = "哥";
        }
        overrideDone = true;
      } else if (!overrideDone) {
        suggestAddress = p.suggest;
      }
      if (p.tone === "warm" && toneLevel < 2) toneLevel = 2;
      break;
    }
  }
  // 如果大哥原话里带了更具体的："王哥""李哥""我是张总"就抓一下
  const nameHint = msg.match(/我是([^\s,，。!！?？]{1,6})/);
  if (nameHint && !opts.brotherName) opts = { ...opts, brotherName: nameHint[1] };

  // 5) 建议话术强度 —— 越界必须 warmup，其他按情绪判断
  let suggestIntensity = "daily";
  if (crossLine) {
    suggestIntensity = "warmup";
  } else if (toneLevel >= 2) {
    suggestIntensity = "heatup";
  } else if (toneLevel < 0) {
    suggestIntensity = "warmup";
  }
  // 越界时不允许手动切换成升温话术。
  if (opts.intensity && !crossLine) suggestIntensity = opts.intensity;

  // 6) 关键词打分兜底 → 大哥画像分类 & 命中词
  const score = {};
  const matchedWords = [];
  for (const w of QUOTE_WEIGHTS) {
    let s = 0;
    for (const word of w.words) {
      if (msg.includes(word)) {
        s += w.weight * (word.length >= 3 ? 1.2 : 1);
        matchedWords.push(word);
      }
    }
    if (s) score[w.scenario] = (score[w.scenario] || 0) + s;
  }

  // 7) 大哥画像（6 类）
  let brotherType = "日常打卡型";
  if (crossLine) brotherType = "越界试探型";
  else if (toneLevel >= 2 || scenarioKey === "confession" || scenarioKey === "ambiguous") brotherType = "热情聊骚型";
  else if (toneLevel <= -1 || scenarioKey === "comfort" || scenarioKey === "complaint") brotherType = "失意求安慰型";
  else if (scenarioKey === "gift_thanks" || scenarioKey === "pk_support" || scenarioKey === "after_stream") brotherType = "刷量维护型";
  else if (msg.length <= 8 && (msg.includes("在吗") || msg.includes("早") || msg.includes("晚安"))) brotherType = "沉默榜一型";
  else if (scenarioKey === "follow_up" || scenarioKey === "daily_care") brotherType = "维护回访型";

  // 8) 变量（模板 {user} 替换成建议称呼，{brotherName} 是大名）
  // 🆕 同时识别方言
  const dialect = detectDialect(msg);
  const customVars = {
    ...variables,
    "{user}": suggestAddress,
    "{brother}": opts.brotherName || suggestAddress,
    "{host}": opts.hostName || "我",
    "{address}": suggestAddress,
  };

  // ============================================================
  // 🆕 高级分析：情绪强度 / 互动阶段 / 消费力 / 难度 / 风险 / 意图
  // ============================================================

  // 8.1) 情绪强度 0-100（基于语气词数量、表情符号、感叹号、关键词）
  let emotionIntensity = 30; // 基准
  // 叹号/问号加成
  const exclaims = (msg.match(/[！!]/g) || []).length;
  emotionIntensity += Math.min(exclaims * 8, 25);
  // 表情符号加成
  const emojis = (msg.match(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu) || []).length;
  emotionIntensity += Math.min(emojis * 6, 18);
  // 情感关键词加成
  if (/超级|特别|非常|太|超|巨|无敌|极度|真心/.test(msg)) emotionIntensity += 12;
  if (/爱|喜欢|想你|宝|亲|抱/.test(msg)) emotionIntensity += 10;
  // 重复字加成（"嗯嗯""哈哈""谢谢谢谢"）
  if (/(.)\1{1,}/.test(msg)) emotionIntensity += 8;
  // 长度加成（消息越长，情绪投入越多）
  if (msg.length > 30) emotionIntensity += 6;
  if (msg.length > 60) emotionIntensity += 6;
  // 负面情绪也计入强度（生气/难过也算高情绪）
  if (toneLevel < 0) emotionIntensity += 15;
  // 越界=高强度
  if (crossLine) emotionIntensity = Math.max(emotionIntensity, 75);
  emotionIntensity = Math.min(emotionIntensity, 100);

  // 8.2) 互动阶段：陌生 / 熟络 / 暧昧 / 危险
  let interactStage = "熟络";
  if (crossLine) interactStage = "危险";
  else if (toneLevel >= 2 || scenarioKey === "confession" || scenarioKey === "ambiguous") interactStage = "暧昧";
  else if (scenarioKey === "greeting" || scenarioKey === "follow_up" || msg.length <= 8) interactStage = "陌生";
  else if (scenarioKey === "gift_thanks" || scenarioKey === "daily_care" || scenarioKey === "compliment") interactStage = "熟络";

  // 8.3) 消费力预测：低 / 中 / 高 / 超高
  let spendingPower = "中";
  if (/嘉年华|火箭|游艇|跑车|城堡|花海|穿云箭/.test(msg)) spendingPower = "超高";
  else if (/刷了|打赏|破费|心意|红包|转账|给你转|给你发/.test(msg)) spendingPower = "高";
  else if (/榜一|榜二|榜三|大哥|老板/.test(msg)) spendingPower = "高";
  else if (/借.{0,6}(钱|万|块)|周转|没钱|差钱|需要钱/.test(msg)) spendingPower = "低";
  else if (scenarioKey === "greeting" || scenarioKey === "compliment") spendingPower = "低";

  // 8.4) 回复难度：简单 / 中等 / 困难 / 高危
  let replyDifficulty = "中等";
  if (crossLine) replyDifficulty = "高危";
  else if (scenarioKey === "confession" || scenarioKey === "invitation" || scenarioKey === "personal_qa") replyDifficulty = "困难";
  else if (scenarioKey === "comfort" || scenarioKey === "complaint" || toneLevel < 0) replyDifficulty = "困难";
  else if (scenarioKey === "gift_thanks" || scenarioKey === "pk_support" || scenarioKey === "daily_care" || scenarioKey === "compliment") replyDifficulty = "简单";
  else if (scenarioKey === "greeting" || scenarioKey === "festival") replyDifficulty = "简单";

  // 8.5) 风险评分 0-100（综合：越界 + 负情绪 + 高强度 + 困难）
  let riskScore = 15; // 基准
  if (crossLine) riskScore += 55;
  if (toneLevel < 0) riskScore += 12;
  if (emotionIntensity >= 70) riskScore += 8;
  if (replyDifficulty === "困难") riskScore += 8;
  if (replyDifficulty === "高危") riskScore += 15;
  if (interactStage === "危险") riskScore += 10;
  riskScore = Math.min(riskScore, 100);

  // 8.6) 意图总结（一句话）
  const intentMap = {
    confession: "想确定关系，要主播表态",
    gift_thanks: "刷了礼物，求情绪价值回馈",
    pk_support: "PK 拉票/守塔，求助力",
    after_stream: "下播告别/邀约后续",
    ambiguous: "暧昧试探，想拉近关系",
    reject: "越界请求（钱/性/隐私），需果断拒绝",
    send_pic: "索要私人照片/视频，需婉拒",
    greeting: "开场打招呼，看主播是否在线",
    daily_care: "日常关心，维护关系",
    comfort: "求安慰，情绪低落",
    complaint: "吐槽发泄，求倾听",
    follow_up: "失联回访，想知道主播态度",
    invitation: "线下邀约，想见面",
    compliment: "夸奖主播，求回应",
    personal_qa: "打听个人信息，需谨慎",
    work_life: "聊工作生活，日常话题",
    food: "聊吃喝，日常话题",
    weekend: "聊周末安排，日常话题",
    late_night: "深夜倾诉，求陪伴",
    late_night_song: "点歌，求专属服务",
    festival: "节日祝福，维护关系",
    birthday: "生日，求专属祝福",
    general: "日常闲聊",
  };
  let intent = intentMap[finalScenarioKey] || "日常闲聊";
  if (crossLine) intent = `🚨 ${crossLineType}：${intent}`;

  // 9) 小贴士（主播操作建议）
  const replyHints = [];
  if (crossLine) {
    replyHints.push(`⚠️ 越界类型：${crossLineType}—— 优先用「温柔一刀/成熟直给/毒舌封死」3 张卡，不要用甜/撒娇/活泼，避免被误解为"有机会"`);
    replyHints.push("话术强度自动降到 warmup（保守距离档），避免推拉过火");
  }
  if (brotherType === "刷量维护型") {
    replyHints.push(`🎁 这类大哥吃"情绪价值"：回复里必须出现「记在心里」「你别太累」「身体第一」3 句中的至少 1 句`);
    replyHints.push("优先选 温柔/成熟/甜系 3 张，毒舌慎用");
  }
  if (brotherType === "热情聊骚型") {
    replyHints.push(`🔥 对方在"升温"——你可以 heatup 档，但必须留「但」字门：不给明确承诺，不接「老婆」称呼`);
    replyHints.push("推荐搭配：温柔卡（稳）+ 甜系卡（拉情绪）+ 傲娇卡（推拉）");
  }
  if (brotherType === "失意求安慰型") {
    replyHints.push(`🫂 先「接情绪」，再「说理解」，最后「给台阶」——不要一上来加油打气，越说越烦`);
    replyHints.push("推荐：温柔（主力）+ 成熟（靠谱）+ 幽默（破局）");
  }
  if (brotherType === "越界试探型") {
    replyHints.push("🚫 三不原则：不接话、不解释、不讨好—— 一次亮底，以后再敢提你就有底气冷他");
    replyHints.push("推荐：sharp 毒舌（必须有一张立规矩） + mature 成熟（讲原则）+ gentle 温柔（给台阶下）");
  }
  if (finalScenarioKey === "gift_thanks") replyHints.push("✅ 感谢 3 段式公式：①先心疼 ②再感谢 ③最后关心身体 = 下次他还刷");
  if (finalScenarioKey === "confession") replyHints.push(`✅ 告白 回复公式：先给情绪价值 + 再委婉拉距离 + 最后给一个「朋友级」的替代身份`);
  if (finalScenarioKey === "reject") replyHints.push(`✅ 拒绝公式：不指责 + 说原则 + 给一个「我不是针对你」的台阶`);
  if (finalScenarioKey === "send_pic") replyHints.push("✅ 婉拒私照模板：我不喜欢在私底下发 → 但你可以直播间看我呀 → 直播间给你专属镜头");
  if (replyHints.length === 0) replyHints.push("💡 常规场景：先用 1 条日常强度 + 1 条升温档 对比发送，观察大哥回复速度决定下一步");

  // 🆕 高级分析维度的小贴士
  if (riskScore >= 70) replyHints.unshift(`🔴 高风险(${riskScore}分)：建议先冷静，回复要克制，避免激化`);
  if (spendingPower === "超高") replyHints.push(`💎 超高消费力：务必重点维护，回复要带「专属感」「记得你的好」`);
  if (spendingPower === "低" && !crossLine) replyHints.push(`⚠️ 消费力低：保持礼貌但不要过度投入，避免被白嫖情绪`);
  if (emotionIntensity >= 80 && !crossLine) replyHints.push(`💪 对方情绪很高(${emotionIntensity}分)：可以 heatup 档回应，但留好退路`);
  if (interactStage === "陌生") replyHints.push(`🌱 还在陌生阶段：保持距离感，不要过度亲密，慢慢建立信任`);

  // 🆕 方言小贴士
  if (dialect.dialect !== "mandarin") {
    replyHints.push(`${dialect.emoji} 检测到${dialect.label}（${dialect.region}）：回复会自动适配同款语气词，更亲切`);
  }

  return {
    scenarioKey: finalScenarioKey,
    scenarioLabel: scenarios[finalScenarioKey]?.label || scenarioLabel,
    toneLevel,
    toneTags,
    emotionIntensity,
    interactStage,
    spendingPower,
    replyDifficulty,
    riskScore,
    intent,
    dialect,
    suggestAddress,
    suggestIntensity,
    crossLine,
    crossLineType,
    brotherType,
    customVars,
    matchedWords: Array.from(new Set(matchedWords)).slice(0, 12),
    replyHints,
  };
}

/**
 * 🆕 长消息（≥80 字 或 多段）专属分段回应
 * 给大哥写小作文时，回复也要：有结构 + 多段 + 不短句
 *
 * 三段结构：
 *   ① 头段："我看完你说的一大段了"——先承认认真看了，避免被当套模板
 *   ② 中段：针对大哥原话里的关键诉求点逐条回应（场景意图 + 关键词提取）
 *   ③ 尾段：情绪价值收尾（陪伴/肯定/未来承诺）
 *
 * @param {string} message 大哥原话
 * @param {Object} analysis analyzeBrotherQuote 的返回
 * @param {string} personality 性格 key（gentle/tsundere/...）
 * @param {Object} vars 模板变量
 * @param {Array<string>} templates 该性格下当前场景的模板池
 * @returns {string|null} 拼好的长回应；null 表示这个性格不适合长回应走原流程
 */
function buildLongMessageReply(message, analysis, personality, vars, templates) {
  if (!templates || templates.length === 0) return null;

  // 性格专属开头：先让大哥感觉"被认真听了"
  const OPENERS = {
    gentle:    ["{user} 我从头到尾看完了你这一段。", "{user} 你写这么多 我逐字看完了。"],
    tsundere:  ["看完了 你话还挺多。", "…这一大段 我看了。"],
    lively:    "{user} 我看完啦！你写这么多我哪敢怠慢～",
    coquettish:"{user}～你打这么多字 我都舍不得只回一句话。",
    humorous:  ["好家伙 这是写论文来了？我给满分。", "看完这一大段 我现在的反应是 哥你这文笔可以投稿了。"],
    mature:    "{user} 我认真看完了。慢慢回你。",
    sharp:     ["看完。该说的我都看完。", "话都让你说了 我看完。"],
    sweet:     "{user} 我看完啦 你写的每一句我都记着呢～",
  };
  // 尾段：情绪价值收尾
  const TAILS = {
    gentle:    ["你别一个人扛 我在呢。", "先这样 有空再细聊 我陪着你。"],
    tsundere:  ["行了 别多想。我说完了。", "我先不回太多 等你想清楚。"],
    lively:    ["你慢慢说我慢慢听 别急～", "记得 我一直在的 别一个人闷着！"],
    coquettish:["所以～你刚说的我都很认真在听 别再乱想啦。", "记得 多想我一点 别想那些乱七八糟的。"],
    humorous:  ["行了 别整这些 早点睡。", "我言尽于此 你看着办。"],
    mature:    ["具体的我们可以慢慢聊 不急。", "事情一步一步来 我陪你捋。"],
    sharp:     ["听明白没 没明白再问。", "直说 你别绕。"],
    sweet:     ["你写这么多 我心都软了 别一个人扛～", "记得不管怎样 我都在这里陪你呀～"],
  };

  // 中段：从原话里抽 2-3 个关键诉求点，每点配一句模板回应
  // 先把场景相关的模板按"是否能覆盖到关键词"排序，取前 3 条互不重复
  const msg = message || "";
  const keywords = (analysis.matchedWords || []).slice(0, 6);
  // 用关键词对模板排序：模板里出现关键词越多越优先
  const scored = templates.map(t => {
    let s = 0;
    const text = fillTemplate(t, vars);
    for (const k of keywords) {
      if (k && text.includes(k)) s += 2;
    }
    return { tpl: t, score: s, text };
  });
  scored.sort((a, b) => b.score - a.score);
  // 选 3 条互不重复的中段句（去重逻辑：前 10 字不重复即可）
  const middleParts = [];
  const seenPrefix = new Set();
  for (const s of scored) {
    if (s.text.length < 8) continue;
    const prefix = s.text.slice(0, 10);
    if (seenPrefix.has(prefix)) continue;
    seenPrefix.add(prefix);
    middleParts.push(s.text);
    if (middleParts.length >= 3) break;
  }
  if (middleParts.length === 0) return null; // 没合适的就退回原流程

  // 拼装：开头 + 中段(用 / 或换行连接，保持自然) + 尾段
  const openerList = OPENERS[personality];
  const opener = Array.isArray(openerList)
    ? openerList[Math.floor(Math.random() * openerList.length)]
    : openerList;
  const tailList = TAILS[personality];
  const tail = Array.isArray(tailList)
    ? tailList[Math.floor(Math.random() * tailList.length)]
    : tailList;

  const openerFilled = fillTemplate(opener, vars);
  const tailFilled = fillTemplate(tail, vars);

  // 中段每段以换行分隔，让回复看起来像分点回应，有结构
  return [openerFilled, ...middleParts, tailFilled].join("\n");
}

/**
 * 💬 1v1 引擎：给大哥原话 → 8 个性格各 1 条专属卡（一次8张）
 * 核心改进：
 *  - 用原话分析结果替换 {user} 等变量（比如大哥让你叫他"老板"就自动换）
 *  - 越界场景时：5 个"非安全"性格自动降级为 warmup + 距离化润色
 *  - 返回结构和 generateReplies 兼容，可以直接复用 UI 渲染
 * @returns {Array<{personality, label, emoji, scenarioKey, scenario, intensity, text, isCrossLineSafe: boolean, stance: string, stanceLabel: string}>}
 */

/**
 * 🆕 立场判断：分析回复文本对大哥请求的"内心想法"
 * 返回：agree(同意) / disagree(不同意) / neutral(中立)
 *
 * 判断逻辑：
 *  - 越界场景（借钱/约炮/索照）：回复必须 disagree，否则是 neutral
 *  - 告白场景：含"在一起/答应/好呀/愿意"=agree；含"不行/拒绝/朋友/慢热/时间"=disagree
 *  - 邀约场景：含"好/行/可以/有空"=agree；含"再说/不了/不方便"=disagree
 *  - 点歌/PK/生日：默认 agree（这些是主播能给的）
 *  - 其他：neutral
 */
function judgeStance(text, analysis) {
  const t = text || "";
  const scenarioKey = analysis.scenarioKey;

  // 越界场景：回复必须表达"不同意"
  if (analysis.crossLine) {
    // 检测是否明确拒绝
    if (/不|别|不行|拒绝|不可以|不能|没有|滚|做梦|想得美|别想|休想|不可能/.test(t)) {
      return "disagree";
    }
    // 越界但回复没明确拒绝 → 标记为"需谨慎"（中立偏不同意）
    return "disagree";
  }

  // 告白场景
  if (scenarioKey === "confession") {
    if (/在一起|答应|愿意|好呀|好的呀|可以呀|我也喜欢你|我也挺喜欢|我们在一起/.test(t)) return "agree";
    if (/不行|拒绝|不能答应|朋友|慢热|时间|再了解|试用期|考察|不讨厌|没安全感|再想想|没准备好|矜持/.test(t)) return "disagree";
    return "neutral";
  }

  // 邀约场景
  if (scenarioKey === "invitation") {
    if (/好呀|行|可以|有空|好的呀|约|见面|吃饭|喝茶|咖啡/.test(t) && !/再说|不了|不方便|不行|没空/.test(t)) return "agree";
    if (/再说|不了|不方便|不行|没空|暂时|以后|下次|先不/.test(t)) return "disagree";
    return "neutral";
  }

  // 借钱/要钱（非越界场景但提到钱）
  if (/借.{0,6}钱|周转|能借|可以借/.test(analysis.scenarioKey === "reject" ? "" : "")) {
    // 已经被 crossLine 处理
  }

  // 点歌/PK/生日/节日：主播能给的 = 同意
  if (["late_night_song", "pk_support", "birthday", "festival", "gift_thanks", "compliment"].includes(scenarioKey)) {
    return "agree";
  }

  // 个人问题（年龄/单身/联系方式）：含"不方便/不能说/保密"=disagree；含"告诉你/可以"=agree
  if (scenarioKey === "personal_qa") {
    if (/不方便|不能说|保密|隐私|私人|不告诉|为啥要知道/.test(t)) return "disagree";
    if (/告诉你|可以|没问题|多大|单身/.test(t)) return "agree";
    return "neutral";
  }

  // 索要照片/视频（非越界但要婉拒）
  if (scenarioKey === "send_pic") {
    return "disagree";
  }

  // 默认中立
  return "neutral";
}

const STANCE_LABELS = {
  agree: "✅ 同意",
  disagree: "❌ 不同意",
  neutral: "🟡 中立",
};

export function generateOnePerPersonality(message, opts = {}) {
  if (!message || !message.trim()) return [];

  const analysis = analyzeBrotherQuote(message, opts);
  const scenarioKey = analysis.scenarioKey;
  const scenario = scenarios[scenarioKey];
  const intensity = analysis.suggestIntensity;
  const vars = analysis.customVars;

  // 映射 crossLineType → _crossLineSpecific 中的 key
  const crossLineKeyMap = {
    "借钱要钱": "借钱要钱",
    "索要私照/视频": "索要私照",
    "明确约炮/涉黄": "睡你类",
    "涉黄交易(开价类)": "开价交易",
    "急着加私人联系方式(线下邀约)": "打探隐私",
    "打探地址/个人隐私": "打探隐私",
  };
  const crossLineSpecificKey = analysis.crossLine ? crossLineKeyMap[analysis.crossLineType] : null;

  const results = [];
  const personalityKeys = Object.keys(personalities);

  for (const pk of personalityKeys) {
    const p = personalities[pk];
    if (!p) continue;

    // 优先使用 crossLine-specific 模板（如果可用）
    let templates = null;
    if (analysis.crossLine && crossLineSpecificKey && scriptData._crossLineSpecific) {
      const crossLineTemplates = scriptData._crossLineSpecific[pk];
      if (crossLineTemplates && crossLineTemplates[crossLineSpecificKey]) {
        templates = crossLineTemplates[crossLineSpecificKey];
      }
    }
    // 回退到场景通用模板
    if (!templates || templates.length === 0) {
      templates = scenario.templates[pk];
    }
    if (!templates || templates.length === 0) continue;

    // 🆕 用相关性加权挑模板（修复"答非所问"）
    let bestTpl = pickByRelevance(templates, message, vars);
    if (!bestTpl) bestTpl = templates[0];

    let rawText = fillTemplate(bestTpl, vars);

    // 🆕 长消息（≥80 字 或 多段）走分段回应，让回复也有结构、不短句
    const isLongMessage = (message || "").length >= 80 || (message || "").split(/\n+/).length >= 3;
    if (isLongMessage && !analysis.crossLine) {
      const longReply = buildLongMessageReply(message, analysis, pk, vars, templates);
      if (longReply) rawText = longReply;
    }

    // 越界时的安全处理
    let safeIntensity = intensity;
    if (analysis.crossLine) {
      if (["sweet","coquettish","lively"].includes(pk)) {
        safeIntensity = "warmup";
        rawText = `${vars["{user}"]} 我先说好哦 我这个人挺有原则的 你别吓我~ ${rawText}`;
      }
    }

    // 大哥画像微调
    if (analysis.brotherType === "刷量维护型" && ["gentle","mature","sweet"].includes(pk)) {
      if (!rawText.includes("记着") && !rawText.includes("记性")) {
        rawText = rawText.replace(/。(\s*)$/, "。 你对我好 我记性好 都记着。");
      }
    }
    if (analysis.brotherType === "失意求安慰型") {
      if (!rawText.includes("听着") && !rawText.includes("我懂")) {
        rawText = `${vars["{user}"]} 我听着呢 你说。${rawText}`;
      }
    }

    let text = humanizeText(rawText, pk, safeIntensity, { message });
    // 🆕 上下文记忆注入：如果有历史对话，让回复有记忆感
    if (opts.context && opts.context.length >= 2) {
      text = injectContextMemory(text, opts.context, analysis, pk);
    }
    // 🆕 方言语气适配（粤语/东北话/四川话等）
    text = applyDialectTone(text, analysis.dialect);
    text = applyEngagementSafety(text);
    // 🆕 立场判断：这条回复是"同意/不同意/中立"大哥的请求
    const stance = judgeStance(text, analysis);
    results.push({
      personality: pk,
      label: p.label,
      emoji: p.emoji,
      scenarioKey,
      scenario: scenario.label,
      intensity: safeIntensity,
      text,
      isCrossLineSafe: !analysis.crossLine || ["gentle","mature","sharp"].includes(pk),
      stance,
      stanceLabel: STANCE_LABELS[stance] || "🟡 中立",
    });
  }

  results._analysis = analysis;
  results._contextualTags = contextAwareTags(message, opts.context, analysis);
  return results;
}

/**
 * 🧠 上下文记忆：分析当前消息与历史对话的关联性，返回标签
 * @param {string} message 当前大哥消息
 * @param {Array} context 历史对话记录 [{ msg, scenario, ts }]
 * @param {Object} analysis 当前分析结果
 * @returns {Object} 上下文标签 { hasHistory, repeatedScenario, lastScenario, contextHint }
 */
function contextAwareTags(message, context, analysis) {
  if (!context || context.length === 0) {
    return { hasHistory: false };
  }
  const recent = context.slice(0, 5);
  const scenarios = recent.map(c => c.scenario).filter(Boolean);
  const currentScenario = analysis?.scenarioKey;
  const sameScenarioCount = scenarios.filter(s => s === currentScenario).length;
  const lastScenario = scenarios[0];

  // 检查是否有重复场景（比如连续都是"想你"）
  let pattern = null;
  if (sameScenarioCount >= 2 && currentScenario === "ambiguous") {
    pattern = "连续暧昧";
  } else if (sameScenarioCount >= 2 && currentScenario === "gift_thanks") {
    pattern = "连续刷礼";
  } else if (sameScenarioCount >= 2 && currentScenario === "comfort") {
    pattern = "连续求安慰";
  } else if (lastScenario && lastScenario !== currentScenario) {
    pattern = `从「${lastScenario}」转到「${currentScenario}」`;
  }

  return {
    hasHistory: true,
    contextCount: context.length,
    lastScenario,
    currentScenario,
    sameScenarioCount,
    pattern,
    contextHint: pattern ? `[记忆] ${context.length} 轮对话 · ${pattern}` : `[记忆] ${context.length} 轮对话`,
  };
}

/**
 * 🧠 在回复中注入上下文记忆（让回复有"记得之前聊过"的感觉）
 */
function injectContextMemory(text, context, analysis, personalityKey) {
  if (!context || context.length < 2) return text;

  const recent = context.slice(0, 3);
  const scenarios = recent.map(c => c.scenario).filter(Boolean);
  const currentScenario = analysis?.scenarioKey;

  // 如果最近聊过类似的，加一句"还记得上次..."
  if (scenarios.includes(currentScenario) && !analysis?.crossLine) {
    const memoryPhrases = {
      gentle: [
        "哥 你上次也说过类似的话 我记着呢~",
        "嘿嘿 这个你之前提过的 我没忘~",
        "你之前跟我说过的哦 我都记在心里呢",
      ],
      sweet: [
        "哥哥 你上次也这样说过 人家记得牢牢的~",
        "哼 你之前跟我说过的哦 别想赖账~",
        "你说过的话我都存着 一条都没丢~",
      ],
      coquettish: [
        "哥 这不是你上次说过的嘛~ 故意又来撩我？",
        "你上次也这样 我可都记着呢~",
      ],
      lively: [
        "哎哎哎 这个你之前说过！我记得！",
        "哈哈 你上次也来这招 没用的哦~",
      ],
      mature: [
        "你之前也提过这个 我记着的",
        "这事你上次说过 我有印象",
      ],
      tsundere: [
        "哼 你以为我会忘？上次也说过同样的话",
        "你说过的话我都存着 别想糊弄我",
      ],
      humorous: [
        "这是你第二次说这个了 我给你记着账呢",
        "你这话术上次用过了 换一个~",
      ],
      sharp: [
        "你上次也说过这个 结果呢？",
      ],
    };
    const phrases = memoryPhrases[personalityKey] || memoryPhrases.gentle;
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    // 在合适的位置插入记忆句
    if (text.length < 30) return `${phrase} ${text}`;
    return `${phrase} ${text}`;
  }

  return text;
}

/**
 * 📤 大哥档案 → 导出分享文本（主播复制给闺蜜/团队存档用）
 */
export function exportBrotherRecord(record) {
  const lines = [];
  lines.push(`【大哥原话】${record.brotherMessage || ""}`);
  if (record.nickname) lines.push(`【大哥称呼/备注】${record.nickname}`);
  if (record.analysis) {
    const a = record.analysis;
    lines.push(`【识别场景】${a.scenarioLabel}（${a.scenarioKey}） · 画像：${a.brotherType}`);
    if (a.crossLine) lines.push(`【⚠️ 越界】${a.crossLineType}`);
    lines.push(`【建议强度】${a.suggestIntensity} · 建议称呼：${a.suggestAddress}`);
    if (a.matchedWords.length) lines.push(`【关键词命中】${a.matchedWords.join("、")}`);
  }
  lines.push("");
  (record.replies || []).forEach((r, i) => {
    lines.push(`『${r.emoji} ${r.label}${r.intensity === "heatup" ? "·升温" : r.intensity === "warmup" ? "·保守" : ""}』`);
    lines.push(r.text);
    lines.push("");
  });
  return lines.join("\n").trim();
}
