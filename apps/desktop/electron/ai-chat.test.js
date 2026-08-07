/**
 * ai-chat 纯函数单测（node:test + CommonJS）
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  localRuleChat,
  parseAiChatContent,
  handleAiChat,
} = require('./ai-chat.js');

describe('localRuleChat', () => {
  it('喂食关键词 → eat；饥饿低 → hungry', () => {
    const eat = localRuleChat('好饿想吃', '咕嘎', { hunger: 80 });
    assert.equal(eat.action, 'eat');
    assert.match(eat.reply, /咕嘎|想吃|投喂/);

    const hungry = localRuleChat('hungry', '咕嘎', { hunger: 10 });
    assert.equal(hungry.action, 'hungry');
    assert.match(hungry.reply, /好饿/);
  });

  it('摸摸 → happy', () => {
    const r = localRuleChat('摸摸头', '小宠', null);
    assert.equal(r.action, 'happy');
    assert.match(r.reply, /舒服|摸/);
  });

  it('玩耍 → play', () => {
    const r = localRuleChat('陪我玩', 'Doro', null);
    assert.equal(r.action, 'play');
  });

  it('睡觉 / 再见 分支', () => {
    const sleep = localRuleChat('晚安睡觉', '咕嘎', null);
    assert.equal(sleep.action, 'sleep');
    const bye = localRuleChat('拜拜', '咕嘎', null);
    assert.equal(bye.action, 'idle');
  });

  it('散步 → walk', () => {
    const r = localRuleChat('走走 walk', '咕嘎', null);
    assert.equal(r.action, 'walk');
  });

  it('不舒服 → sick', () => {
    const r = localRuleChat('有点不舒服', '咕嘎', null);
    assert.equal(r.action, 'sick');
  });

  it('出去玩 → hunt', () => {
    const r = localRuleChat('出去玩', '咕嘎', null);
    assert.equal(r.action, 'hunt');
  });

  it('默认闲聊 action 为 null', () => {
    const r = localRuleChat('今天天气不错', '咕嘎', null);
    assert.equal(r.action, null);
    assert.ok(r.reply.includes('咕嘎'));
  });

  it('空消息仍返回字符串 reply', () => {
    const r = localRuleChat('', '', null);
    assert.equal(typeof r.reply, 'string');
  });
});

describe('parseAiChatContent', () => {
  it('解析合法 JSON', () => {
    const r = parseAiChatContent('{"reply":"你好","action":"happy"}');
    assert.equal(r.reply, '你好');
    assert.equal(r.action, 'happy');
  });

  it('action null / 空串', () => {
    assert.equal(
      parseAiChatContent('{"reply":"hi","action":null}').action,
      null,
    );
    assert.equal(
      parseAiChatContent('{"reply":"hi","action":""}').action,
      null,
    );
  });

  it('夹杂文本中的 JSON', () => {
    const r = parseAiChatContent('好的\n{"reply":"咕","action":"idle"}\n');
    assert.equal(r.reply, '咕');
    assert.equal(r.action, 'idle');
  });

  it('纯文本截断且 action null', () => {
    const r = parseAiChatContent('只是一段话');
    assert.equal(r.reply, '只是一段话');
    assert.equal(r.action, null);
  });

  it('空内容默认省略号', () => {
    const r = parseAiChatContent('   ');
    assert.equal(r.reply, '……');
    assert.equal(r.action, null);
  });

  it('损坏 JSON 回退纯文本', () => {
    const r = parseAiChatContent('{not json');
    assert.equal(r.action, null);
    assert.ok(r.reply.includes('{'));
  });
});

describe('handleAiChat', () => {
  const ctx = {
    getPetName: () => '测试宠',
    getPersonaText: () => 'persona',
  };

  it('空 message 返回疑问', async () => {
    const r = await handleAiChat({ message: '  ' }, ctx);
    assert.match(r.reply, /测试宠/);
    assert.equal(r.action, null);
    assert.equal(r.mode, 'local');
    assert.equal(r.source, 'local');
  });

  it('无 API Key 时走本地规则并标记 mode=local', async () => {
    const prevKey = process.env.PET_AI_API_KEY;
    const prevOpen = process.env.OPENAI_API_KEY;
    delete process.env.PET_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const r = await handleAiChat(
        { message: '摸摸' },
        {
          ...ctx,
          resolveCredentials: () => ({
            apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
          }),
        },
      );
      assert.equal(r.action, 'happy');
      assert.equal(r.mode, 'local');
      assert.equal(r.source, 'local');
      assert.equal(r.errorKind, 'no-key');
    } finally {
      if (prevKey !== undefined) process.env.PET_AI_API_KEY = prevKey;
      if (prevOpen !== undefined) process.env.OPENAI_API_KEY = prevOpen;
    }
  });

});

describe('classifyAiError / cloudFallbackNotice', () => {
  const { classifyAiError, cloudFallbackNotice } = require('./ai-chat.js');

  it('AbortError → timeout', () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    assert.equal(classifyAiError(err), 'timeout');
    assert.match(cloudFallbackNotice('timeout'), /超时/);
  });

  it('AI HTTP → http', () => {
    assert.equal(classifyAiError(new Error('AI HTTP 401: unauthorized')), 'http');
    assert.match(cloudFallbackNotice('http'), /接口/);
  });

  it('fetch failed → network', () => {
    assert.equal(classifyAiError(new Error('fetch failed')), 'network');
  });
});
