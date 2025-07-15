module.exports = (req, res, next) => {
  // POST /webhook 요청 처리
  if (req.method === 'POST' && req.path === '/api/sentences/webhook') {
    const requestBody = req.body;
    
    // 요청에서 필요한 정보 추출
    const sessionId = requestBody.request?.sessionId || 'default-session';
    const requestId = requestBody.request?.requestId || 'default-request';
    const userInput = requestBody.request?.userInput?.content?.text || '';
    const memorySlots = requestBody.webhook?.memorySlots || {};
    
    // 사용자 입력에 따른 NLU_INTENT 결정
    let nluIntent = '';
    if (userInput.includes('ACT_01_0212') || userInput === 'ACT_01_0212') {
      nluIntent = 'ACT_01_0212';
    } else if (userInput.includes('ACT_01_0213') || userInput === 'ACT_01_0213') {
      nluIntent = 'ACT_01_0213';
    } else if (userInput.includes('ACT_01_0235') || userInput === 'ACT_01_0235') {
      nluIntent = 'ACT_01_0235';
    } else {
      // 기본값 또는 fallback
      nluIntent = 'ACT_01_0235';
    }
    
    // 응답 생성 (요구사항에 맞는 형식)
    const response = {
      version: "1.0",
      responseStatus: "SUCCESS",
      memorySlots: {
        ...memorySlots,
        NLU_INTENT: {
          value: [nluIntent]
        },
        STS_CONFIDENCE: {
          value: ["0.7431283"]
        },
        STS_IS_EXACT_MATCH: {
          value: ["false"]
        },
        STS_REPR: {
          value: [""]
        },
        USER_TEXT_INPUT: {
          value: [userInput]
        }
      },
      directives: []
    };
    
    // 로깅
    console.log('=== Webhook Request ===');
    console.log('Session ID:', sessionId);
    console.log('Request ID:', requestId);
    console.log('User Input:', userInput);
    console.log('NLU Intent:', nluIntent);
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('=== Webhook Response ===');
    console.log(JSON.stringify(response, null, 2));
    
    // response 전송
    res.status(200).json(response);
  } else if (req.method === 'POST' && req.path === '/apicall') {
    // POST /apicall 요청 처리 (이전 버전 호환)
    const requestBody = req.body;
    
    // 요청에서 필요한 정보 추출
    const sessionId = requestBody.sessionId || 'default-session';
    const requestId = requestBody.requestId || 'default-request';
    const userInput = requestBody.userInput || requestBody.text || '';
    
    // 사용자 입력에 따른 NLU_INTENT 결정 (이전 버전과 동일한 로직)
    let nluIntent = '';
    if (userInput.includes('ACT_01_0212') || userInput === 'ACT_01_0212') {
      nluIntent = 'ACT_01_0212';
    } else if (userInput.includes('ACT_01_0213') || userInput === 'ACT_01_0213') {
      nluIntent = 'ACT_01_0213';
    } else if (userInput.includes('ACT_01_0235') || userInput === 'ACT_01_0235') {
      nluIntent = 'ACT_01_0235';
    } else {
      // 기본값 또는 fallback
      nluIntent = 'ACT_01_0235';
    }
    
    // 이전 버전 응답 형식 (webhook과 동일한 형식으로 변경)
    const response = {
      version: "1.0",
      responseStatus: "SUCCESS",
      NLU_INTENT: {
        value: [nluIntent]
      },
      STS_CONFIDENCE: {
        value: ["0.7431283"]
      },
      STS_IS_EXACT_MATCH: {
        value: ["false"]
      },
      STS_REPR: {
        value: [""]
      },
      USER_TEXT_INPUT: {
        value: [userInput]
      },
      directives: []
    };
    
    // 로깅
    console.log('=== API Call Request (Legacy) ===');
    console.log('Session ID:', sessionId);
    console.log('Request ID:', requestId);
    console.log('User Input:', userInput);
    console.log('NLU Intent:', nluIntent);
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('=== API Call Response (Legacy) ===');
    console.log(JSON.stringify(response, null, 2));
    
    // response 전송
    res.status(200).json(response);
  } else {
    // 다른 요청은 기본 json-server로 처리
    next();
  }
}; 
