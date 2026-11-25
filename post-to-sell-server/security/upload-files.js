const path = require("path");

const directories = {
  product: "uploads/products",
  advert: "uploads/adverts",
  banner: "uploads/banners",
  category: "uploads/products/categories",
};

function resolveUpload(filePath, kind) {
  if (typeof filePath !== "string" || !Object.prototype.hasOwnProperty.call(directories, kind)) {
    throw new Error("Invalid upload path");
  }
  const root = path.resolve(__dirname, "..", directories[kind]);
  const candidate = path.resolve(__dirname, "..", filePath);
  const relative = path.relative(root, candidate);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("File is outside its upload storage");
  }
  return candidate;
}

module.exports = { resolveUpload };
