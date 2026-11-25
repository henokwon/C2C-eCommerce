const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const express = require("express");
const jwt = require("jsonwebtoken");

const root = path.resolve(__dirname, "..");
const A = "1".repeat(24), B = "2".repeat(24), ADMIN = "3".repeat(24);
const PRODUCT = "a".repeat(24), OTHER = "b".repeat(24);
const secret = "test-only-secret-not-used-by-the-application";
process.env.ACCESS_TOKEN_SECRET = secret;
let users, products, adverts, unlinks, server, base;

function userQuery(document) {
  return {
    select() {
      if (!document) return Promise.resolve(null);
      const { password, ...safe } = document;
      return Promise.resolve({ ...safe });
    },
    then(resolve, reject) { return Promise.resolve(document).then(resolve, reject); },
  };
}
const Users = {
  findById(id) { return userQuery(users.get(id)); },
  findOneAndUpdate(filter, update) {
    const user = users.get(filter._id);
    if (user) Object.assign(user, update.$set || update);
    return userQuery(user);
  },
  async find() { return []; },
};
const Products = {
  async findById(id) { return products.get(id) || null; },
  async findOneAndUpdate(filter, update) {
    const product = products.get(filter._id);
    if (!product || (filter.postPayment !== undefined && product.postPayment !== filter.postPayment)) return null;
    Object.assign(product, update.$set || update);
    return { ...product };
  },
  async findOneAndDelete(filter) { products.delete(filter._id); },
};
const Adverts = {
  async findById(id) { return adverts.get(typeof id === "object" ? id._id : id) || null; },
  async findOneAndUpdate(filter, update) {
    const advert = adverts.get(filter._id);
    if (!advert) return null;
    Object.assign(advert, update.$set || update);
    return { ...advert };
  },
  async findOneAndDelete(filter) { adverts.delete(filter._id); },
};

// Load the real routes/controllers/middleware. Only the database, password hashing
// (not exercised here), and disk deletion are replaced with isolated adapters.
function applicationModule(filename, cache = new Map()) {
  filename = path.resolve(root, filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, loaded);
  loaded.require = (specifier) => {
    if (specifier === "bcrypt") return {};
    if (specifier === "fs") return {
      promises: { async unlink(file) { unlinks.push(file); } },
      unlink(file, callback) { unlinks.push(file); callback(null); },
    };
    const resolved = Module._resolveFilename(specifier, loaded);
    if (resolved === path.join(root, "models", "userModel.js")) return Users;
    if (resolved === path.join(root, "models", "productModel.js")) return Products;
    if (resolved === path.join(root, "models", "advertModel.js")) return Adverts;
    if (resolved.startsWith(root + path.sep) && !resolved.includes(`${path.sep}node_modules${path.sep}`)) {
      return applicationModule(resolved, cache);
    }
    return require(resolved);
  };
  loaded._compile(fs.readFileSync(filename, "utf8"), filename);
  return loaded.exports;
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", applicationModule("routes/userRoutes.js"));
  app.use("/api/products", applicationModule("routes/productRoutes.js"));
  app.use("/api/adverts", applicationModule("routes/advertRoutes.js"));
  server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
beforeEach(() => {
  users = new Map([A, B, ADMIN].map((id) => [id, {
    _id: id, role: id === ADMIN ? "admin" : "user", accountStatus: "ON", password: "never-return-this-hash",
  }]));
  products = new Map([
    [PRODUCT, { _id: PRODUCT, userId: A, images: ["uploads/products/owned.jpg"], postPayment: 0, status: "new" }],
    [OTHER, { _id: OTHER, userId: B, images: [], postPayment: 0, status: "new" }],
  ]);
  unlinks = [];
  adverts = new Map([
    [PRODUCT, { _id: PRODUCT, userId: A, advertBanner: "uploads/adverts/a.jpg", status: "new", advertPayment: false }],
    [OTHER, { _id: OTHER, userId: B, advertBanner: "uploads/adverts/b.jpg", status: "new", advertPayment: false }],
  ]);
});
async function request(route, body, actor = A, method = "PUT", algorithm = "HS256") {
  const headers = { "Content-Type": "application/json" };
  if (actor) headers.Authorization = `Bearer ${jwt.sign({ id: actor, role: "admin" }, secret, { algorithm })}`;
  const response = await fetch(base + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}

test("anonymous and disabled accounts cannot update profiles", async () => {
  assert.equal((await request(`/api/users/edit/${A}`, { fName: "Changed" }, null)).status, 401);
  users.get(A).accountStatus = "OFF";
  assert.equal((await request(`/api/users/edit/${A}`, { fName: "Changed" })).status, 401);
});
test("a user cannot update another account or its notifications", async () => {
  for (const route of [`edit/${B}`, `schedule_notification/${B}`, `update_notification_status/${B}`, `delete_notification/${B}`]) {
    assert.equal((await request(`/api/users/${route}`, { fName: "Changed" })).status, 403);
  }
  assert.equal(users.get(B).fName, undefined);
});
test("profile updates reject privilege, password and MongoDB operator injection", async () => {
  for (const body of [{ role: "admin" }, { password: "replacement" }, { accountStatus: "ON" }, { $set: { role: "admin" } }]) {
    assert.equal((await request(`/api/users/edit/${A}`, body)).status, 400);
  }
  assert.equal(users.get(A).role, "user");
});
test("normal self-service updates work and exclude the password hash", async () => {
  const response = await request(`/api/users/edit/${A}`, { fName: "Henok" });
  assert.equal(response.status, 200);
  assert.equal(users.get(A).fName, "Henok");
  assert.equal(response.body.updated.password, undefined);
});
test("token role claims and unsupported signing algorithms grant no privileges", async () => {
  assert.equal((await request(`/api/products/payment/update_status/${PRODUCT}`, { payFor: 1 })).status, 403);
  assert.equal((await request(`/api/users/edit/${A}`, { fName: "Changed" }, A, "PUT", "HS384")).status, 401);
});
test("users cannot delete others' products but owners and current admins can", async () => {
  assert.equal((await request(`/api/products/delete/${OTHER}`, undefined, A, "DELETE")).status, 403);
  assert.ok(products.has(OTHER));
  assert.equal((await request(`/api/products/delete/${OTHER}`, undefined, B, "DELETE")).status, 200);
  assert.equal(products.has(OTHER), false);
  assert.equal((await request(`/api/products/delete/${PRODUCT}`, undefined, ADMIN, "DELETE")).status, 200);
});
test("ordinary product edits cannot change owner, payment or moderation fields", async () => {
  for (const field of ["userId", "postPayment", "postExpireDate", "status", "images"]) {
    assert.equal((await request(`/api/products/edit/${PRODUCT}`, { [field]: "forged" })).status, 400);
  }
  assert.equal(products.get(PRODUCT).postPayment, 0);
  assert.equal((await request(`/api/products/edit/${PRODUCT}`, { productName: "Updated" })).status, 200);
});
test("manual admin confirmation validates duration and rejects replay", async () => {
  for (const payFor of [0, -1, 13, "1", 1.5]) {
    assert.equal((await request(`/api/products/payment/update_status/${PRODUCT}`, { payFor }, ADMIN)).status, 400);
  }
  assert.equal((await request(`/api/products/payment/update_status/${PRODUCT}`, { payFor: 1 }, ADMIN)).status, 200);
  const expiry = products.get(PRODUCT).postExpireDate;
  assert.equal((await request(`/api/products/payment/update_status/${PRODUCT}`, { payFor: 12 }, ADMIN)).status, 409);
  assert.equal(products.get(PRODUCT).postExpireDate, expiry);
});
test("image replacement cannot delete a path outside the owned product", async () => {
  const response = await request(`/api/products/edit/image/${PRODUCT}`, { url: "../../server.js" });
  assert.equal(response.status, 400);
  assert.deepEqual(unlinks, []);
});
test("product file paths stay inside upload storage", () => {
  const { resolveUpload } = require("../security/upload-files");
  assert.ok(resolveUpload("uploads/products/owned.jpg", "product").endsWith("owned.jpg"));
  for (const value of ["../../server.js", "uploads/products/../../../server.js", "/etc/passwd", "uploads/products", null]) {
    assert.throws(() => resolveUpload(value, "product"));
  }
  assert.throws(() => resolveUpload("uploads/products/owned.jpg", "advert"));
  assert.throws(() => resolveUpload("uploads/adverts/b.jpg", "banner"));
});
test("advert deletion is restricted to its owner or a current administrator", async () => {
  assert.equal((await request(`/api/adverts/delete/${OTHER}`, undefined, A, "DELETE")).status, 403);
  assert.ok(adverts.has(OTHER));
  assert.deepEqual(unlinks, []);
  assert.equal((await request(`/api/adverts/delete/${OTHER}`, undefined, B, "DELETE")).status, 200);
  assert.equal((await request(`/api/adverts/delete/${PRODUCT}`, undefined, ADMIN, "DELETE")).status, 200);
});
test("advert edits cannot forge ownership, payment, status or a file path", async () => {
  for (const field of ["userId", "advertPayment", "status", "advertBanner"]) {
    assert.equal((await request(`/api/adverts/edit/${PRODUCT}`, { [field]: "forged" })).status, 400);
  }
  assert.equal(adverts.get(PRODUCT).status, "new");
  assert.equal((await request(`/api/adverts/edit/${PRODUCT}`, { title: "Updated" })).status, 200);
});
