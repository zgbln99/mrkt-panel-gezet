/**
 * Express 4 nie przechwytuje odrzuconych promise'ów z handlerów `async` —
 * bez tego opakowania błąd w takiej funkcji kończy się wiszącym żądaniem
 * (klient czeka do timeoutu), zamiast odpowiedzią 500 z centralnego handlera.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
