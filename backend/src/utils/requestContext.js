// Ngữ cảnh của request đang xử lý (request id, route) cho log truy vấn chậm — không phải truyền tay qua
// từng hàm. Chỉ giữ nhãn kỹ thuật, không giữ dữ liệu người dùng.
import {AsyncLocalStorage} from 'node:async_hooks';

const store = new AsyncLocalStorage();

// Gom các đường dẫn cùng loại: số và uuid trong path thành ":id".
export const routeLabel = (method, path) =>
  `${method} ${String(path).replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id').replace(/\/\d+(?=\/|$)/g, '/:id')}`;

export function requestContextMiddleware(req, _res, next) {
  if (process.env.SLOW_QUERY_CONTEXT === '0') return next();
  store.run({requestId: req.requestId || null, route: routeLabel(req.method, req.originalUrl.split('?')[0])}, next);
}

export const requestContext = () => store.getStore() || null;
