module.exports = (req, res, next) => {
  // POST /webhook 요청 처리
  if (req.method === 'POST' && req.path === '/webhook') {
    const { sessionId, requestId } = req.body;
    
    // response 생성
    const response = {
      sessionId: sessionId,
      requestId: requestId,
      NLU_INTENT: {
        value: "ACT_01_0235"
      }
    };
    
    // 로깅
    console.log('Webhook Request:', req.body);
    console.log('Webhook Response:', response);
    
    // response 전송
    res.status(200).json(response);
  } else {
    // 다른 요청은 기본 json-server로 처리
    next();
  }
}; 
