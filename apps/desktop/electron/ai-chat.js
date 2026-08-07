/**
 * AI 对话：本地规则 + OpenAI 兼容 API + 降级
 */

'use strict';

const log = require('./logger');
const { resolveAiCredentials } = require('./ai-settings');

/** AI 请求超时（ms） */
const AI_CHAT_TIMEOUT_MS = 12_000;

/**
 * @param {unknown} err
 * @returns {string}
 */
function formatErr(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 无 API Key 时的本地规则回复
 * @param {string} message
 * @param {string} petName
 * @param {{ hunger?: number; mood?: number } | null | undefined} vitals
 * @returns {{ reply: string; action: string | null }}
 */
function localRuleChat(message, petName, vitals) {
  const name = petName || '小宠';
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const hunger =
    vitals && typeof vitals.hunger === 'number' ? vitals.hunger : null;

  if (/饿|饿了|好饿|肚子|想吃|feed|hungry|eat|吃饭|投喂/.test(text + lower)) {
    if (hunger !== null && hunger <= 30) {
      return {
        reply: `咕～${name}好饿…想吃东西…`,
        action: 'hungry',
      };
    }
    return {
      reply: `${name}：咕～想吃东西…谢谢投喂！`,
      action: 'eat',
    };
  }
  if (/摸|摸摸|摸摸头|rua|pat|头|抱抱|贴贴/.test(text)) {
    return {
      reply: `${name}：咕～好舒服…再摸一下嘛～`,
      action: 'happy',
    };
  }
  // hunt 须在 play 之前（「出去玩」含「玩」）
  if (/出去玩|觅食|探险|hunt|出去转转|打猎/.test(text + lower)) {
    return {
      reply: `${name}：出发！去外面逛逛～咕！`,
      action: 'hunt',
    };
  }
  if (/玩|玩耍|游戏|陪我玩|play/.test(text + lower)) {
    return {
      reply: `${name}：耶！一起玩！咕咕～`,
      action: 'play',
    };
  }
  if (/再见|拜拜|走了|bye|晚安|睡觉|休息|sleep/.test(text + lower)) {
    if (/睡|休息|晚安|sleep/.test(text + lower)) {
      return {
        reply: `${name}：呼…先眯一会儿…咕…`,
        action: 'sleep',
      };
    }
    return {
      reply: `${name}：拜拜～记得常来看我哦，咕～`,
      action: 'idle',
    };
  }
  if (/走|散步|走走|walk/.test(text + lower)) {
    return {
      reply: `${name}：走走走～咕！`,
      action: 'walk',
    };
  }
  if (/不舒服|生病|难受|sick|感冒|生病了/.test(text + lower)) {
    return {
      reply: `${name}：呜…有点不舒服…咕…`,
      action: 'sick',
    };
  }

  const defaults = [
    `${name}：咕～在呢～`,
    `${name}：嗯嗯，听到啦！`,
    `${name}：咕咕…怎么啦？`,
    `${name}：陪你待着就很开心～`,
    `${name}：（歪头）咕？`,
  ];
  return {
    reply: defaults[Math.floor(Math.random() * defaults.length)],
    action: null,
  };
}

/**
 * 从模型输出解析 JSON 或纯文本
 * @param {string} content
 * @returns {{ reply: string; action: string | null }}
 */
function parseAiChatContent(content) {
  const raw = String(content || '').trim();
  if (!raw) {
    return { reply: '……', action: null };
  }
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      const reply =
        typeof obj.reply === 'string' && obj.reply.trim()
          ? obj.reply.trim()
          : raw.slice(0, 120);
      let action =
        obj.action === null || obj.action === undefined
          ? null
          : String(obj.action);
      if (action === 'null' || action === '') action = null;
      return { reply, action };
    } catch {
      /* fallthrough */
    }
  }
  return { reply: raw.slice(0, 200), action: null };
}

/**
 * 调用 OpenAI 兼容 Chat Completions；失败抛错
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.baseUrl
 * @param {string} opts.model
 * @param {string} opts.personaText
 * @param {string} opts.petName
 * @param {string} opts.message
 * @param {{ hunger?: number; mood?: number } | null | undefined} opts.vitals
 */
async function callOpenAiCompatibleChat({
  apiKey,
  baseUrl,
  model,
  personaText,
  petName,
  message,
  vitals,
}) {
  const systemParts = [
    personaText || `你是桌面宠物「${petName}」。`,
    '',
    '规则：',
    '- 用角色口吻简短回复，1～3 句，口语化',
    '- 不要 Markdown、不要列表',
    '- 必须只输出一行 JSON：{"reply":"短回复","action":"happy|eat|idle|walk|play|sleep|hungry|sick|hunt|null"}',
    '- action 无行为时用 null；reply 内不要再嵌套 JSON',
  ];
  if (vitals && typeof vitals === 'object') {
    const h =
      typeof vitals.hunger === 'number' ? Math.round(vitals.hunger) : '?';
    const m =
      typeof vitals.mood === 'number' ? Math.round(vitals.mood) : '?';
    systemParts.push(`当前养成：饱食 ${h}，心情 ${m}。`);
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = {
    model,
    temperature: 0.8,
    max_tokens: 160,
    messages: [
      { role: 'system', content: systemParts.join('\n') },
      { role: 'user', content: String(message || '').slice(0, 500) },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AI HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const rawJson = await res.json();
    /** @type {{ choices?: Array<{ message?: { content?: string }; text?: string }> }} */
    const data =
      rawJson && typeof rawJson === 'object'
        ? /** @type {{ choices?: Array<{ message?: { content?: string }; text?: string }> }} */ (
            rawJson
          )
        : {};
    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      '';
    return parseAiChatContent(content);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 分类云端调用错误，便于 UI 区分超时 / 网络 / HTTP
 * @param {unknown} err
 * @returns {'timeout' | 'network' | 'http' | 'unknown'}
 */
function classifyAiError(err) {
  const msg = formatErr(err).toLowerCase();
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String(/** @type {{ name?: string }} */ (err).name)
      : '';
  if (
    name === 'AbortError' ||
    msg.includes('abort') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  ) {
    return 'timeout';
  }
  if (msg.includes('ai http') || /http\s+\d{3}/.test(msg)) {
    return 'http';
  }
  if (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('certificate')
  ) {
    return 'network';
  }
  return 'unknown';
}

/**
 * @param {'timeout' | 'network' | 'http' | 'unknown'} kind
 * @returns {string}
 */
function cloudFallbackNotice(kind) {
  if (kind === 'timeout') {
    return '（云端超时，已用本地回复）';
  }
  if (kind === 'network') {
    return '（网络异常，已用本地回复）';
  }
  if (kind === 'http') {
    return '（云端接口错误，已用本地回复）';
  }
  return '（云端暂不可用，已用本地回复）';
}

/**
 * 处理 ai:chat：凭证来自 resolveAiCredentials（env > 本地加密存储），否则本地规则
 * 返回 mode/source：local | cloud；降级时 errorKind 区分超时/网络等
 * @param {{ message?: string; vitals?: { hunger?: number; mood?: number } }} input
 * @param {{
 *   getPetName: () => string;
 *   getPersonaText: () => string;
 *   resolveCredentials?: () => { apiKey: string; baseUrl: string; model: string };
 * }} ctx
 * @returns {Promise<import('../shared/pet-payload').PetChatResult>}
 */
async function handleAiChat(input, ctx) {
  const message =
    input && typeof input.message === 'string' ? input.message.trim() : '';
  const petName = (ctx && ctx.getPetName && ctx.getPetName()) || '小宠';
  const personaText =
    (ctx && ctx.getPersonaText && ctx.getPersonaText()) || '';
  const vitals = input && input.vitals && typeof input.vitals === 'object'
    ? input.vitals
    : null;

  if (!message) {
    return {
      reply: `${petName}：……？`,
      action: null,
      mode: 'local',
      source: 'local',
    };
  }

  const resolve =
    (ctx && typeof ctx.resolveCredentials === 'function'
      ? ctx.resolveCredentials
      : null) || resolveAiCredentials;
  const cred = resolve();
  const apiKey = (cred && cred.apiKey) || '';
  if (apiKey) {
    try {
      const baseUrl =
        (cred && cred.baseUrl) || 'https://api.openai.com/v1';
      const model = (cred && cred.model) || 'gpt-4o-mini';
      const result = await callOpenAiCompatibleChat({
        apiKey,
        baseUrl,
        model,
        personaText,
        petName,
        message,
        vitals,
      });
      return {
        reply: result.reply,
        action: result.action,
        mode: 'cloud',
        source: 'cloud',
      };
    } catch (err) {
      const errorKind = classifyAiError(err);
      // 禁止打印 apiKey / Authorization
      log.warn(
        '[ai] 远程调用失败，降级本地:',
        errorKind,
        formatErr(err),
      );
      const fallback = localRuleChat(message, petName, vitals);
      const notice = cloudFallbackNotice(errorKind);
      return {
        reply: `${fallback.reply}\n${notice}`,
        action: fallback.action,
        mode: 'local',
        source: 'local',
        errorKind,
        notice,
      };
    }
  }

  const local = localRuleChat(message, petName, vitals);
  return {
    reply: local.reply,
    action: local.action,
    mode: 'local',
    source: 'local',
    errorKind: 'no-key',
  };
}

module.exports = {
  AI_CHAT_TIMEOUT_MS,
  localRuleChat,
  parseAiChatContent,
  callOpenAiCompatibleChat,
  handleAiChat,
  classifyAiError,
  cloudFallbackNotice,
};
