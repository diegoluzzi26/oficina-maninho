'use strict';
const { runComOficina } = require('../config/db');
const config = require('../services/config.service');
const AppError = require('../utils/AppError');

/**
 * Instala o contexto da oficina do usuário logado, pra que todas as
 * queries subsequentes rodem com `search_path = oficina_<slug>, public`.
 *
 * Deve ser registrado depois do `auth` (precisa de req.user).
 * Sem oficina_slug no JWT (tokens antigos, pré-multi-oficina), rejeita
 * pedindo re-login — assim ninguém acessa dados sem contexto definido.
 */
module.exports = function oficinaContext(req, res, next) {
  const slug = req.user?.oficina_slug;
  if (!slug) {
    return next(AppError.unauthorized('Sessão sem oficina — entre novamente'));
  }
  // Carrega a config desta oficina no cache antes de seguir, pra que
  // config.get/whatsapp() resolvam os valores certos (ex: número próprio).
  runComOficina(slug, () => {
    config.carregar().then(() => next()).catch(next);
  });
};
