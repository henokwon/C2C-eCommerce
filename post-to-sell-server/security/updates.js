function allowedUpdate(body, fields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("An update object is required");
    error.status = 400;
    throw error;
  }
  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => !fields.includes(key))) {
    const error = new Error("Unsupported update fields");
    error.status = 400;
    throw error;
  }
  return Object.fromEntries(keys.map((key) => [key, body[key]]));
}

module.exports = { allowedUpdate };
