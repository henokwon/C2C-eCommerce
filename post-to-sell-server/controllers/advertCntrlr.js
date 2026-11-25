const Adverts = require("../models/advertModel");

const fs = require("fs");
const { allowedUpdate } = require("../security/updates");
const { resolveUpload } = require("../security/upload-files");

const advertCntrlr = {
  addAdvert: async (req, res) => {
    try {
      const { title, description, type, link, duration } = req.body;

      const newAdvert = new Adverts({
        userId: req.user.id,
        title,
        description,
        type,
        advertBanner: "uploads/adverts/" + req.file.filename,
        link,
        duration,
      });
      await newAdvert.save();
      res.json({ msg: "Advert added successfuly!" });
    } catch (error) {
      await removeAdvetBanner("uploads/adverts/" + req.file.filename);
      res.status(500).json({ msg: error.message });
    }
  },
  getAllAdvert: async (req, res) => {
    try {
      res.json(await Adverts.find().sort({ createdAt: -1 }));
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  },
  getAllUserAdvert: async (req, res) => {
    // Fetch all user adverts
    try {
      res.json(
        await Adverts.find({ userId: req.params.id }).sort({ createdAt: -1 })
      );
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  },
  editAdvert: async (req, res) => {
    try {
      const validUser = await validatAdvertOwner(req.user.id, req.params.id);

      if (!validUser)
        return res.status(400).json({ msg: "Perimission denied!" });

      await Adverts.findOneAndUpdate(
        { _id: req.params.id },
        { $set: allowedUpdate(req.body, ["title", "description", "type", "link", "duration"]) },
        { runValidators: true }
      );
      res.json({ msg: "Advert eited successfuly!" });
    } catch (error) {
      res.status(error.status || 400).json({ msg: "Unable to update advert" });
    }
  },
  editAdvertBanner: async (req, res) => {
    try {
      if (req.file) {
        const validUser = await validatAdvertOwner(req.user.id, req.params.id);

        if (!validUser)
          return res.status(400).json({ msg: "Perimission denied!" });

        const advert = await Adverts.findById({ _id: req.params.id });
        await removeAdvetBanner(advert.advertBanner);
        await Adverts.findOneAndUpdate(
          { _id: req.params.id },
          { advertBanner: "uploads/adverts/" + req.file.filename }
        );
        res.json({ msg: "Banner updated successfuly!" });
      } else {
        return res.status(400).json({ msg: "Banner required!" });
      }
    } catch (error) {
      await removeAdvetBanner("uploads/adverts/" + req.file.filename);
      res.status(500).json({ msg: error.message });
    }
  },

  deleteAdvert: () => {
    return async (req, res) => {
      try {
        const advert = await Adverts.findById({ _id: req.params.id });
        if (!advert) return res.status(404).json({ msg: "Advert not found" });
        if (req.user.role !== "admin" && advert.userId !== req.user.id) {
          return res.status(403).json({ msg: "Permission denied" });
        }
        await removeAdvetBanner(advert.advertBanner);
        await Adverts.findOneAndDelete({ _id: req.params.id });
        res.json({ msg: "Advert deleted successfuly!" });
      } catch (error) {
        res.status(500).json({ msg: error.message });
      }
    };
  },

  // Approve Advert:- Means the Advert content is formal, And it can be seen in the public adverts list
  approveAdvert: async (req, res) => {
    try {
      const updatedData = await Adverts.findOneAndUpdate(
        { _id: req.params.id },
        {
          status: "active",
        },
        { new: true }
      );
      res.json({ data: updatedData, msg: "Advert approved successfully!" });
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  },

  // Archive advert:- Means the Advert will not be display in the public page any more, But exitst in the database
  archiveAdvert: async (req, res) => {
    try {
      const updatedData = await Adverts.findOneAndUpdate(
        { _id: req.params.id },
        {
          status: "archived",
        },
        { new: true }
      );
      res.json({ data: updatedData, msg: "Advert archived successfully!" });
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  },
};

// Check which user is trying to take this action And,
// Allow only the owner of the advert and the admin for this action
const validatAdvertOwner = async (userId, advertId) => {
  const advert = await Adverts.findById(advertId);
  if (advert) {
    if (advert.userId === userId) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
};
const removeAdvetBanner = async (advertBannerPath) => {
  try {
    await fs.promises.unlink(resolveUpload(advertBannerPath, "advert"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};

module.exports = advertCntrlr;
