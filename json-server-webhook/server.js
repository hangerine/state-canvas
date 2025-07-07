const jsonServer = require('json-server');
const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();
const customMiddleware = require('./middleware');

// 기본 middleware 설정
server.use(middlewares);

// body parser 설정 (POST 요청 처리를 위해)
server.use(jsonServer.bodyParser);

// custom middleware 적용
server.use(customMiddleware);

// 기본 라우터 사용
server.use(router);

// 서버 시작
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`JSON Server is running on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhook`);
}); 