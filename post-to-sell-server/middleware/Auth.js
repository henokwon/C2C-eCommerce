const jwt = require("jsonwebtoken");
const Users = require("../models/userModel");

module.exports = (permissions) => async (req, res, next) => {
  const header = req.header("Authorization");
  if (!header) return res.status(401).json({ msg: "Authentication required" });
  try {
    const token = header.replace(/^Bearer\s+/i, "");
    const claims = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, { algorithms: ["HS256"] });
    if (!claims || typeof claims.id !== "string") {
      return res.status(401).json({ msg: "Invalid credentials" });
    }
    const profile = await Users.findById(claims.id).select("-password");
    if (!profile || profile.accountStatus !== "ON") {
      return res.status(401).json({ msg: "Account is unavailable" });
    }
    if (!permissions.includes(profile.role)) {
      return res.status(403).json({ msg: "Permission denied" });
    }
    req.user = { id: String(profile._id), role: profile.role };
    return next();
  } catch (error) {
    const invalid = ["TokenExpiredError", "JsonWebTokenError", "NotBeforeError", "CastError"].includes(error.name);
    return res.status(invalid ? 401 : 500).json({ msg: invalid ? "Invalid credentials" : "Authentication failed" });
  }
};
