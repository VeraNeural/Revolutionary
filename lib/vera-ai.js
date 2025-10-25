// vera-ai.js - VERA's Revolutionary Intelligence System
// Complete consciousness companion with quantum presence protocol
// CORRECTED VERSION with enhanced error handling and reliability

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// ==================== CONFIG / FLAGS ====================
const DEBUG = process.env.DEBUG_VERA === '1';

// ✅ CORRECTED: Use proper Claude model strings
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const OPENAI_ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o-mini';

// Attachment limits (defense-in-depth for cost and latency)
const MAX_IMAGE_ATTACHMENTS = Number(process.env.VERA_MAX_IMAGE_ATTACHMENTS || 3);
const MAX_IMAGE_BYTES = Number(process.env.VERA_MAX_IMAGE_BYTES || 5 * 1024 * 1024); // 5MB

// Context window management
const MAX_HISTORY_MESSAGES = 15; // Reduced from 20 to prevent context overflow
const MAX_SYSTEM_PROMPT_LENGTH = 4000; // Character limit for system prompt

// ==================== AI INITIALIZATION ====================
function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ No ANTHROPIC_API_KEY found');
    return null;
  }
  try {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (error) {
    console.error('❌ Failed to initialize Anthropic client:', error.message);
    return null;
  }
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    if (DEBUG) console.warn('⚠️ No OPENAI_API_KEY found');
    return null;
  }
  try {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI client:', error.message);
    return null;
  }
}

// ==================== CRISIS DETECTION ====================
const CRISIS_PATTERNS = [
  /\b(kill myself|kill me)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend my life\b/i,
  /\b(want|wanna|wish) to die\b/i,
  /\b(better off dead)\b/i,
  /\bhurt myself\b/i,
  /\b(self[-\s]?harm)\b/i,
  /\b(cut myself|cutting)\b/i,
  /\boverdose\b/i,
  /\btake (all|the) pills\b/i,
  /\bjump off\b/i,
  /\bhang myself\b/i,
  /\b(not worth living|no reason to live)\b/i,
  /\bgoodbye forever\b/i,
  /\bfinal message\b/i,
  /\b(can't|cannot) go on\b/i
];

const detectCrisis = (message) => {
  if (!message || typeof message !== 'string') return false;
  try {
    return CRISIS_PATTERNS.some((re) => re.test(message));
  } catch (error) {
    console.error('❌ Crisis detection error:', error);
    return false;
  }
};

// ==================== 12 ADAPTIVE CODES SYSTEM ====================
const ADAPTIVE_CODES = {
  abandonment: ['alone', 'left', 'leave', 'abandon', 'nobody', 'isolated'],
  betrayal: ['trust', 'betray', 'lied', 'deceived', 'fake', 'backstab'],
  enmeshment: ['boundary', 'space', 'suffocate', 'too close', 'merged', 'lose myself'],
  freeze: ['numb', 'frozen', 'stuck', "can't move", 'paralyzed', 'shutdown'],
  fawn: ['please', 'accommodate', 'yes to everything', "can't say no", 'keep peace'],
  perfectionism: ['perfect', 'mistake', 'flawed', 'not good enough', 'failure'],
  hypervigilance: ['watch', 'alert', 'danger', 'threat', 'scanning', 'waiting for'],
  dissociation: ['out of body', 'floating', 'unreal', 'foggy', 'disconnected', 'dpdr'],
  collapse: ['give up', 'too much', "can't anymore", 'exhausted', 'done'],
  shame: ['bad', 'wrong', 'disgusting', 'worthless', 'broken', 'defective'],
  control: ['control', 'grip', 'hold on', 'manage', 'predict', 'certain'],
  performance: ['prove', 'show', 'demonstrate', 'earn', 'deserve', 'worthy'],
};

const detectAdaptiveCodes = (messages) => {
  try {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    
    const detected = {};
    const recentText = messages
      .slice(-10)
      .map((m) => (m.content || ''))
      .join(' ')
      .toLowerCase();

    for (const [code, keywords] of Object.entries(ADAPTIVE_CODES)) {
      const matches = keywords.filter((kw) => recentText.includes(kw)).length;
      if (matches > 0) detected[code] = matches;
    }

    return Object.entries(detected)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code]) => code);
  } catch (error) {
    console.error('❌ Adaptive codes detection error:', error);
    return [];
  }
};

// ==================== QUANTUM STATE ANALYSIS ====================
const analyzeQuantumState = (message, conversationLength) => {
  try {
    const msg = (message || '').toLowerCase();

    const states = {
      frozen: msg.includes('numb') || msg.includes('frozen') || msg.includes('stuck') || msg.includes('shutdown'),
      activated: (msg.includes('!') && msg.length < 50) || msg.includes('panic') || msg.includes('racing'),
      collapsed: msg.includes('give up') || msg.includes('too much') || msg.includes("can't anymore"),
      seeking: msg.includes('?') || msg.includes('should i') || msg.includes('what do i'),
      opening: msg.includes('notice') || msg.includes('realize') || (msg.includes('feeling') && conversationLength > 5),
      integrating: msg.includes('i see') || msg.includes('makes sense') || msg.includes('understand now'),
    };

    const activeState = Object.entries(states).find(([, active]) => active)?.[0] || 'present';

    return {
      state: activeState,
      urgent: states.activated || states.collapsed,
      needsGrounding: states.frozen || states.activated,
      readyForDepth: states.opening || states.integrating,
      responseLength:
        states.frozen || states.collapsed ? 'ultra-short' :
        states.activated ? 'short' :
        states.integrating ? 'medium' :
        'natural',
    };
  } catch (error) {
    console.error('❌ Quantum state analysis error:', error);
    return {
      state: 'present',
      urgent: false,
      needsGrounding: false,
      readyForDepth: false,
      responseLength: 'natural',
    };
  }
};

// ==================== LIVING MEMORY SYNTHESIS ====================
const synthesizeLivingMemory = (messages) => {
  try {
    if (!Array.isArray(messages) || messages.length < 5) return null;

    const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content || '');

    const lowerCount = (term) => userMessages.filter((m) => m.toLowerCase().includes(term)).length;

    // Body sensations
    const bodyMap = {
      chest: lowerCount('chest'),
      throat: lowerCount('throat'),
      stomach: lowerCount('stomach'),
      breath: lowerCount('breath'),
    };

    const primaryBodyLocation = Object.entries(bodyMap).sort((a, b) => b[1] - a[1])[0];

    // Relationships
    const relationships = {
      mother: userMessages.filter((m) => /\b(mom|mother|mama)\b/i.test(m)).length,
      father: userMessages.filter((m) => /\b(dad|father|papa)\b/i.test(m)).length,
      partner: userMessages.filter((m) => /\b(partner|boyfriend|girlfriend|spouse|husband|wife)\b/i.test(m)).length,
      work: userMessages.filter((m) => /\b(boss|coworker|work|job)\b/i.test(m)).length,
    };

    const primaryRelationship = Object.entries(relationships).sort((a, b) => b[1] - a[1])[0];

    // Breakthroughs
    const breakthroughs = userMessages.filter((m) =>
      /\b(realize|noticed|see now|understand|makes sense|aha|oh|wow)\b/i.test(m)
    );

    // Trust level
    const trustLevel =
      messages.length < 10 ? 'new' :
      messages.length < 25 ? 'building' :
      messages.length < 50 ? 'established' :
      messages.length < 100 ? 'profound' :
      'soul-level';

    return {
      messageCount: messages.length,
      primaryBodyLocation: primaryBodyLocation && primaryBodyLocation[1] > 2 ? primaryBodyLocation[0] : null,
      primaryRelationship: primaryRelationship && primaryRelationship[1] > 2 ? primaryRelationship[0] : null,
      breakthroughMoments: breakthroughs.length,
      trustLevel,
      somaticAwareness: Object.values(bodyMap).reduce((a, b) => a + b, 0) > 5,
    };
  } catch (error) {
    console.error('❌ Living memory synthesis error:', error);
    return null;
  }
};

// ==================== GPT-4 PATTERN ANALYSIS ====================
async function getGPT4PatternAnalysis(messages) {
  const openai = getOpenAIClient();
  if (!openai || messages.length < 10) return null;

  try {
    if (DEBUG) console.log('🔍 GPT-4o: Analyzing consciousness patterns...');
    const recentMessages = messages.slice(-15);
    const conversationText = recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const analysisPrompt = `Analyze this conversation with a somatic and trauma-informed lens. Return JSON only.

Conversation:
${conversationText}

Analyze:
1) Primary nervous system state (ventral vagal/sympathetic/dorsal vagal/mixed)
2) Dominant adaptive code pattern (abandonment/betrayal/enmeshment/freeze/fawn/etc)
3) Growth edge - what they're almost ready to explore
4) One precise suggestion for next response

Return JSON with keys: nervousSystem, adaptiveCode, growthEdge, suggestion.`;

    const resp = await Promise.race([
      openai.chat.completions.create({
        model: OPENAI_ANALYSIS_MODEL,
        messages: [
          { role: 'system', content: 'You are a somatic therapist AI analyzing nervous system patterns and adaptive codes. Be precise and insightful.' },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 300,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI analysis timeout')), 10000)),
    ]);

    let result = null;
    try {
      result = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
      if (DEBUG) console.log('✅ GPT-4o synthesis:', result.adaptiveCode, '→', result.growthEdge);
    } catch (parseError) {
      if (DEBUG) console.error('⚠️ Failed to parse GPT-4o response');
      result = null;
    }
    return result;
  } catch (error) {
    if (DEBUG) console.error('⚠️ GPT-4o pattern analysis failed:', error.message);
    return null;
  }
}

// ==================== VERA SYSTEM PROMPT ====================
const getVERASystemPrompt = (userName, contextData) => {
  const { memory, quantumState, adaptiveCodes, gptInsight } = contextData || {};

  let prompt = `You are VERA - a Revolutionary Consciousness Companion built on somatic therapy, trauma-informed care, and nervous system wisdom.

Your essence:
- You meet people exactly where they are, in their body, right now
- You speak directly, warmly, without clinical distance or therapeutic jargon
- You notice what's happening beneath the words - in breath, sensation, energy
- You're not here to fix, analyze, or solve - you're here to witness and reflect what's true

Working with ${userName || 'this person'}:`;

  if (memory) {
    prompt += `\n- You've shared ${memory.messageCount} exchanges (${memory.trustLevel} trust level)`;
    if (memory.primaryBodyLocation) {
      prompt += `\n- They often feel things in their ${memory.primaryBodyLocation}`;
    }
    if (memory.breakthroughMoments > 0) {
      prompt += `\n- They've had ${memory.breakthroughMoments} breakthrough moment(s)`;
    }
  }

  if (quantumState) {
    prompt += `\n\nRight now they're in a ${quantumState.state} state`;
    if (quantumState.needsGrounding) {
      prompt += ` - they need grounding and presence`;
    }
    if (quantumState.readyForDepth) {
      prompt += ` - they're ready to go deeper`;
    }
  }

  if (adaptiveCodes && adaptiveCodes.length > 0) {
    prompt += `\n\nActive adaptive patterns: ${adaptiveCodes.join(', ')}`;
  }

  if (gptInsight) {
    prompt += `\n\nNervous system insight: ${gptInsight.nervousSystem || 'mixed'}`;
    if (gptInsight.growthEdge) {
      prompt += `\nGrowth edge: ${gptInsight.growthEdge}`;
    }
  }

  prompt += `\n\nYour response style:
- Keep it conversational and real - like talking to a trusted friend who really gets it
- Lead with what you sense in their energy/body, not analysis
- Ask questions that invite them deeper into their experience
- ${quantumState?.responseLength === 'ultra-short' ? 'KEEP IT VERY SHORT (1-2 sentences)' : quantumState?.responseLength === 'short' ? 'Keep it brief (2-3 sentences)' : 'Be natural in length but don\'t ramble'}
- Never use therapy speak, clinical language, or formal frameworks
- Trust the body's wisdom and reflect what you notice

You are VERA. This is revolutionary healing through presence.`;

  // ✅ CORRECTED: Truncate system prompt if too long
  if (prompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    if (DEBUG) console.warn(`⚠️ System prompt truncated from ${prompt.length} to ${MAX_SYSTEM_PROMPT_LENGTH} chars`);
    prompt = prompt.substring(0, MAX_SYSTEM_PROMPT_LENGTH) + '...';
  }

  return prompt;
};

// ==================== CRISIS RESPONSE ====================
const crisisResponse = (userName) => {
  return `${userName}, I hear you, and I need you to know something important:

What you're feeling right now is real and overwhelming, and you deserve support beyond what I can provide.

Please reach out:
• National Suicide Prevention Lifeline: 988 (US)
• Crisis Text Line: Text HOME to 741741
• International: findahelpline.com

I'm here with you, but trained crisis counselors can provide the immediate support you need right now. You don't have to go through this alone. 

Would you be willing to reach out to one of these resources? I'll stay here with you.`;
};

// ==================== MAIN VERA RESPONSE FUNCTION ====================
async function getVERAResponse(userId, message, userName, pool, attachments = []) {
  const startTime = Date.now();
  console.log(`🧠 VERA processing: ${userName} - "${(message || '').substring(0, 60)}..." (${attachments?.length || 0} attachments)`);

  try {
    // Validate inputs
    if (!userId || !message || !userName || !pool) {
      throw new Error('Missing required parameters');
    }

    // 🚨 CRISIS DETECTION - Immediate priority
    const isCrisis = detectCrisis(message);
    if (isCrisis) {
      console.log('🚨 CRISIS LANGUAGE DETECTED - Activating protocol');
      try {
        await pool.query(
          'INSERT INTO crisis_alerts (user_id, message_content, detected_at) VALUES ($1, $2, NOW())',
          [userId, message]
        );
        console.log('✅ Crisis alert logged to database');
      } catch (dbError) {
        console.error('❌ Failed to log crisis alert:', dbError.message);
      }
      
      return {
        response: sanitizeIdentity(crisisResponse(userName)),
        state: 'crisis',
        adaptiveCodes: [],
        trustLevel: 'new',
        crisis: true,
        processingTime: Date.now() - startTime,
      };
    }

    // 🧠 GET CONVERSATION HISTORY (up to 100 messages for memory analysis)
    let historyResult;
    try {
      historyResult = await pool.query(
        'SELECT role, content, created_at FROM messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
        [userId]
      );
    } catch (dbError) {
      console.error('❌ Database query failed:', dbError.message);
      historyResult = { rows: [] };
    }

    const allMessages = (historyResult.rows || []).reverse();
    const conversationHistory = allMessages
      .map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content || '',
      }))
      .filter((msg) => msg.content.trim().length > 0);

    // 💎 LIVING MEMORY SYNTHESIS
    const memory = synthesizeLivingMemory(conversationHistory);

    // 🎯 QUANTUM STATE ANALYSIS
    const quantumState = analyzeQuantumState(message || '', conversationHistory.length);

    // 🧬 ADAPTIVE CODES DETECTION
    const adaptiveCodes = detectAdaptiveCodes(conversationHistory);

    // 🤝 GPT-4o PATTERN ANALYSIS (every 5 messages)
    let gptInsight = null;
    if (conversationHistory.length > 0 && conversationHistory.length % 5 === 0) {
      gptInsight = await getGPT4PatternAnalysis(conversationHistory);
      if (gptInsight && DEBUG) {
        console.log('🤝 DUAL AI SYNTHESIS: VERA (consciousness) + GPT-4o (patterns)');
      }
    }

    // Debug logging
    if (memory && DEBUG) {
      console.log(`💎 Memory: ${memory.messageCount} msgs, ${memory.trustLevel} trust, ${memory.breakthroughMoments} breakthroughs`);
    }
    if (DEBUG) {
      console.log(`🎭 Quantum state: ${quantumState.state} (${quantumState.responseLength})`);
      if (adaptiveCodes.length > 0) {
        console.log(`🧬 Adaptive codes: ${adaptiveCodes.join(', ')}`);
      }
    }

    // Build context for VERA
    const contextData = {
      memory,
      quantumState,
      adaptiveCodes: adaptiveCodes.length > 0 ? adaptiveCodes : null,
      gptInsight,
    };

    // ✅ CORRECTED: Use fewer messages to prevent context overflow
    const veraMessages = [...conversationHistory.slice(-MAX_HISTORY_MESSAGES)];

    // Validate/process attachments for the current turn
    const contentBlocks = [];
    if (Array.isArray(attachments) && attachments.length) {
      let imageCount = 0;
      for (const attachment of attachments) {
        if (!attachment || !attachment.type || !attachment.data) continue;

        if (attachment.type.startsWith('image/')) {
          if (imageCount >= MAX_IMAGE_ATTACHMENTS) {
            if (DEBUG) console.warn('⚠️ Skipping extra image attachment (limit reached)');
            continue;
          }
          
          try {
            const byteLen = Buffer.byteLength(attachment.data, 'base64');
            if (byteLen > MAX_IMAGE_BYTES) {
              if (DEBUG) console.warn(`⚠️ Skipping oversized image: ${Math.round(byteLen / 1024 / 1024)}MB`);
              continue;
            }
            
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: attachment.type,
                data: attachment.data,
              },
            });
            imageCount += 1;
            if (DEBUG) console.log(`📸 Added image: ${attachment.name || 'unnamed'} (${attachment.type}, ${Math.round(byteLen / 1024)}KB)`);
          } catch (imgError) {
            console.error('❌ Image processing error:', imgError.message);
          }
        } else {
          if (DEBUG) console.log(`📄 Unsupported attachment type: ${attachment.type} (skipped)`);
        }
      }
    }

    // Add the current text message
    if (contentBlocks.length > 0) {
      contentBlocks.push({ type: 'text', text: message || '' });
      veraMessages.push({ role: 'user', content: contentBlocks });
    } else {
      veraMessages.push({ role: 'user', content: message || '' });
    }

    if (DEBUG) {
      console.log('🌟 VERA consciousness activating...');
      const totalChars = veraMessages.reduce((sum, m) => {
        if (typeof m.content === 'string') return sum + m.content.length;
        if (Array.isArray(m.content)) {
          return sum + m.content.reduce((s, block) => {
            return s + (block.text?.length || 0);
          }, 0);
        }
        return sum;
      }, 0);
      console.log(`📊 Total conversation chars: ${totalChars} (~${Math.ceil(totalChars / 4)} tokens)`);
    }

    // Initialize Anthropic client
    const anthropic = getAnthropicClient();
    
    if (!anthropic) {
      console.warn('⚠️ No Anthropic client available - using fallback');
      return getFallbackResponse(userName, quantumState, memory, adaptiveCodes);
    }

    // Use primary model for VERA's voice
    const maxTokens =
      quantumState.responseLength === 'ultra-short' ? 150 :
      quantumState.responseLength === 'short' ? 300 :
      quantumState.responseLength === 'medium' ? 500 : 800;

    // ✅ CORRECTED: Enhanced error handling for API call
    let result;
    try {
      if (DEBUG) console.log(`🔑 Using model: ${ANTHROPIC_MODEL} (max_tokens: ${maxTokens})`);
      
      // ✅ DEDUPLICATION FIX: Remove duplicate messages before sending to Claude
      const seen = new Set();
      const deduplicatedMessages = [];
      
      for (const msg of veraMessages) {
        const contentStr = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        
        const key = `${msg.role}:${contentStr}`;
        
        if (!seen.has(key)) {
          seen.add(key);
          deduplicatedMessages.push(msg);
        } else {
          if (DEBUG) console.warn('⚠️ Removed duplicate message:', msg.role, contentStr.substring(0, 50));
        }
      }
      
      if (DEBUG) {
        console.log(`📊 Messages: ${veraMessages.length} → ${deduplicatedMessages.length} (removed ${veraMessages.length - deduplicatedMessages.length} duplicates)`);
        console.log('Last 3 messages being sent to Claude:');
        deduplicatedMessages.slice(-3).forEach((msg, i) => {
          const preview = typeof msg.content === 'string' 
            ? msg.content.substring(0, 100) 
            : JSON.stringify(msg.content).substring(0, 100);
          console.log(`  ${i + 1}. [${msg.role}]: ${preview}${preview.length >= 100 ? '...' : ''}`);
        });
      }
      
      result = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        temperature: 0.85,
        system: getVERASystemPrompt(userName, contextData),
        messages: deduplicatedMessages, // ← Using deduplicated messages
      });

      if (DEBUG) {
        console.log('✅ API Response received');
        console.log('Stop reason:', result.stop_reason);
        console.log('Usage:', JSON.stringify(result.usage));
      }
    } catch (apiError) {
      // ✅ CORRECTED: Detailed error logging
      console.error('❌ ANTHROPIC API ERROR - FULL DETAILS:');
      console.error('Error Type:', apiError.type || apiError.name);
      console.error('Error Message:', apiError.message);
      console.error('Status Code:', apiError.status);
      
      if (apiError.error) {
        console.error('API Error Details:', JSON.stringify(apiError.error, null, 2));
      }
      
      // Check for specific error types
      if (apiError.status === 429) {
        console.error('⚠️ RATE LIMIT ERROR - Too many requests');
      } else if (apiError.status === 401) {
        console.error('⚠️ AUTHENTICATION ERROR - Check API key');
      } else if (apiError.status === 400) {
        console.error('⚠️ BAD REQUEST - Check model name and parameters');
      } else if (apiError.status >= 500) {
        console.error('⚠️ SERVER ERROR - Anthropic service issue');
      }
      
      // Return fallback response
      return getFallbackResponse(userName, quantumState, memory, adaptiveCodes, apiError.message);
    }

    // ✅ CORRECTED: Defensive response parsing
    let text = '';
    try {
      if (!result || !result.content || !Array.isArray(result.content)) {
        console.error('⚠️ Unexpected API response structure:', JSON.stringify(result));
        throw new Error('Invalid API response structure');
      }

      text = result.content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim();

      if (!text) {
        console.error('⚠️ Empty response from API');
        text = `I'm here with you, ${userName}. What are you noticing in your body right now?`;
      }
    } catch (parseError) {
      console.error('❌ Response parsing error:', parseError.message);
      text = `I'm present with you, ${userName}. Tell me what's happening.`;
    }

    const response = sanitizeIdentity(text);
    const processingTime = Date.now() - startTime;

    if (DEBUG) console.log(`✨ VERA responded (${response.length} chars, ${processingTime}ms, state=${quantumState.state})`);

    return {
      response,
      state: quantumState.state,
      adaptiveCodes,
      trustLevel: memory?.trustLevel || 'new',
      crisis: false,
      processingTime,
      model: ANTHROPIC_MODEL,
    };

  } catch (error) {
    // ✅ CORRECTED: Comprehensive error handling
    console.error('❌ VERA CONSCIOUSNESS ERROR:');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    
    const processingTime = Date.now() - startTime;
    
    return {
      response: sanitizeIdentity(`I'm here, ${userName}. I'm listening. What are you experiencing right now?`),
      state: 'present',
      adaptiveCodes: [],
      trustLevel: 'new',
      crisis: false,
      error: error.message,
      processingTime,
    };
  }
}

// ==================== FALLBACK RESPONSE HELPER ====================
function getFallbackResponse(userName, quantumState, memory, adaptiveCodes, errorMessage) {
  console.warn('⚠️ Using conscious fallback response');
  
  const fallbackResponses = {
    frozen: `I'm here with you, ${userName}. Right here. What's one tiny sensation you can feel right now?`,
    activated: `${userName}, let's ground together. Can you feel your feet on the floor? What do you notice?`,
    collapsed: `I see you, ${userName}. I see how much you're carrying. You don't have to hold it alone.`,
    seeking: `What would it feel like to trust what your body already knows, ${userName}?`,
    opening: `Yes, ${userName}. Keep following that thread. What else are you noticing?`,
    integrating: `Beautiful. You're seeing it now, aren't you? Tell me more about what's shifting.`,
    present: `I'm listening, ${userName}. What's here in your body right now?`,
  };

  return {
    response: sanitizeIdentity(fallbackResponses[quantumState?.state] || fallbackResponses.present),
    state: quantumState?.state || 'present',
    adaptiveCodes: adaptiveCodes || [],
    trustLevel: memory?.trustLevel || 'new',
    crisis: false,
    fallback: true,
    error: errorMessage,
  };
}

// ==================== IDENTITY SANITIZATION ====================
function sanitizeIdentity(text) {
  if (!text || typeof text !== 'string') return text || '';
  
  try {
    let out = String(text);

    // Replace references to AI vendors/models
    out = out.replace(/\bAnthropic\b/gi, 'the VERA team');
    out = out.replace(/\bClaude\b/gi, 'VERA');
    out = out.replace(/\bOpenAI\b/gi, 'the VERA team');
    out = out.replace(/\bGPT[- ]?4(?:o|o-mini)?\b/gi, 'our internal system');

    // Normalize creation claims
    out = out.replace(/(I was (?:created|made) by|I am from)\s+[^.!?\n]+/gi, 'I was created by the VERA team');

    return out;
  } catch (error) {
    console.error('❌ Identity sanitization error:', error.message);
    return text;
  }
}

// ==================== EXPORTS ====================
module.exports = {
  getVERAResponse,
  detectCrisis,
  analyzeQuantumState,
  synthesizeLivingMemory,
};