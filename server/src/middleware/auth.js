const db = require('../db');
const { verifyToken } = require('../auth');

const selectUser = db.prepare(
  'SELECT id, username, name, role, is_admin, token_version, must_change_password FROM users WHERE id = ?'
);

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Brak tokenu autoryzacji.', code: 'no_token' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    const expired = e && e.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expired
        ? 'Sesja wygasła — zaloguj się ponownie.'
        : 'Token jest nieprawidłowy — zaloguj się ponownie.',
      code: expired ? 'token_expired' : 'token_invalid',
    });
  }

  const user = selectUser.get(payload.sub);
  if (!user) return res.status(401).json({ error: 'Konto nie istnieje.', code: 'no_account' });

  // Token wydany przed ostatnią zmianą hasła jest bezwartościowy — dzięki temu
  // reset hasła natychmiast wyrzuca z aplikacji wszystkie inne sesje konta.
  if ((payload.tv || 0) !== (user.token_version || 0)) {
    return res.status(401).json({
      error: 'Hasło do tego konta zostało zmienione — zaloguj się ponownie.',
      code: 'token_revoked',
    });
  }

  req.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isAdmin: !!user.is_admin,
    mustChangePassword: !!user.must_change_password,
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Ta operacja wymaga uprawnień administratora.', code: 'forbidden' });
  }
  next();
}

/**
 * Dopóki konto ma flagę "musi zmienić hasło", blokujemy wszystko poza
 * odczytem własnego profilu i samą zmianą hasła. Inaczej hasło startowe
 * z seeda mogłoby zostać w użyciu na zawsze.
 */
function blockUntilPasswordChanged(req, res, next) {
  if (req.user && req.user.mustChangePassword) {
    return res.status(403).json({
      error: 'Zanim zaczniesz korzystać z panelu, ustaw własne hasło.',
      code: 'password_change_required',
    });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, blockUntilPasswordChanged };
