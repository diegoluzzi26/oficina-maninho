'use strict';
const AppError = require('../utils/AppError');

/**
 * validate({ body: schema, query: schema, params: schema })
 * Substitui req.body pelo valor parseado (com defaults e coerções do Zod).
 */
module.exports = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (!schemas[key]) continue;
      const result = schemas[key].safeParse(req[key]);
      if (!result.success) {
        const details = result.error.issues.map((i) => ({
          campo: i.path.join('.') || '(raiz)',
          erro: i.message,
        }));
        throw new AppError('Dados inválidos', 422, details);
      }
      if (key === 'query') {
        // req.query é getter-only no Express 5; mutação direta quebra.
        Object.defineProperty(req, 'query', { value: result.data, writable: true });
      } else {
        req[key] = result.data;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};
