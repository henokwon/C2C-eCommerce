module.exports = (parameter) => (req, res, next) => {
  if (!req.user || String(req.params[parameter]) !== String(req.user.id)) {
    return res.status(403).json({ msg: "You may only modify your own account" });
  }
  return next();
};
