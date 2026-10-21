// Função da Vercel: atende todas as rotas /api/* (veja os rewrites em vercel.json).
module.exports = require("../lib/app").handleApi;
