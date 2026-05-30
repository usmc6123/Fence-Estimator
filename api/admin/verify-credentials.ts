import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';

export default async function handler(req: any, res: any) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Token, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Accepting POST as well as GET/other HTTP verbs for safety (but POST is standard)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  console.log('[Verify Credentials Log] Received Authorization/X-Admin-Token header:', authHeader ? 'Present' : 'Missing');

  if (!authHeader) {
    console.warn('[Verify Credentials Log] Verification skipped/failed: Missing credential headers.');
    return res.status(401).json({
      success: false,
      valid: false,
      error: 'Admin authentication is required. Token is missing.'
    });
  }

  const authStr = typeof authHeader === 'string' ? authHeader : String(authHeader);
  const token = authStr.toLowerCase().startsWith('bearer ')
    ? authStr.substring(7).trim()
    : authStr.trim();

  console.log('[Verify Credentials Log] Parsed token length:', token.length);
  if (token.length > 15) {
    console.log('[Verify Credentials Log] Token snippet:', `${token.substring(0, 10)}...${token.substring(token.length - 8)}`);
  }

  if (!token || token === 'null' || token === 'undefined' || token === '') {
    console.warn('[Verify Credentials Log] Denying verification: Token resolved to empty, null, or undefined.');
    return res.status(401).json({
      success: false,
      valid: false,
      error: 'Admin authentication is required. Token is invalid or empty.'
    });
  }

  let decoded: any = null;

  // 1. Try process.env.JWT_SECRET if specified
  if (process.env.JWT_SECRET) {
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('[Verify Credentials Log] Successfully verified token with custom JWT_SECRET.');
    } catch (err: any) {
      console.warn('[Verify Credentials Log] Custom JWT_SECRET verification failed:', err.message || err);
    }
  }

  // 2. Try the fallback secret 'lone-star-fence-secret'
  if (!decoded) {
    try {
      decoded = jwt.verify(token, 'lone-star-fence-secret');
      console.log('[Verify Credentials Log] Successfully verified token with fallback "lone-star-fence-secret".');
    } catch (err: any) {
      console.error('[Verify Credentials Log] Failed to verify token with both custom and fallback secrets.');
      console.error('[Verify Credentials Log] Detail:', err.message || err);
      return res.status(401).json({
        success: false,
        valid: false,
        error: `Access denied. Invalid or expired admin token. Reason: ${err.message || 'unknown'}`
      });
    }
  }

  // 3. Ensure isAdmin is true
  if (decoded && typeof decoded === 'object' && decoded.isAdmin) {
    console.log('[Verify Credentials Log] Verified admin user:', decoded.email);

    // Generate a fresh 24-hour token using the secret that successfully validated it
    const activeSecret = process.env.JWT_SECRET || 'lone-star-fence-secret';
    const refreshedToken = jwt.sign(
      { email: decoded.email, isAdmin: true, uid: decoded.uid },
      activeSecret,
      { expiresIn: '24h' }
    );

    console.log('[Verify Credentials Log] Successfully generated fresh 24h JWT token for:', decoded.email);

    return res.status(200).json({
      success: true,
      valid: true,
      token: refreshedToken,
      admin: {
        email: decoded.email,
        uid: decoded.uid,
        isAdmin: true
      }
    });
  }

  console.warn('[Verify Credentials Log] Decoded token is valid, but missing isAdmin role flag. Payload:', decoded);
  return res.status(401).json({
    success: false,
    valid: false,
    error: 'Access denied. Account is not an administrator.'
  });
}
