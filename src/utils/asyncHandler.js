'use strict';
// Sem isto, uma promise rejeitada em rota async derruba o processo
// em vez de virar resposta HTTP.
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
