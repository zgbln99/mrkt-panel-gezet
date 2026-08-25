const db = require('../db');
const { verifyToken } = require('../auth');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Brak tokenu autoryzacji.' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    return res.status(401).json({ error: 'Sesja wygasła lub token jest nieprawidłowy — zaloguj się ponownie.' });
  }

  const user = db.prepare('SELECT id, username, name, role, is_admin FROM users WHERE id = ?').get(payload.sub);
  if (!user) return res.status(401).json({ error: 'Konto nie istnieje.' });

  req.user = { id: user.id, username: user.username, name: user.name, role: user.role, isAdmin: !!user.is_admin };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Ta operacja wymaga uprawnień administratora.' });
  next();
}

module.exports = { requireAuth, requireAdmin };
