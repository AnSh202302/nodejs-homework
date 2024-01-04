const ElasticEmail = require("@elasticemail/elasticemail-client");
require("dotenv").config();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const gravatar = require("gravatar");
const path = require("path");
const fs = require("fs/promises");
const { User } = require("../models/user");
const { HTTPError, ctrlWrapper } = require("../helpers");
const { SECRET_KEY } = process.env;
const avatarDir = path.join(__dirname, "../", "public/avatars");
const { nanoid } = require("nanoid");

const { ELASTIC_API_KEY, EMAIL_FROM } = process.env;
const defaultClient = ElasticEmail.ApiClient.instance;
const { apikey } = defaultClient.authentications;
apikey.apiKey = ELASTIC_API_KEY;
const api = new ElasticEmail.EmailsApi();

const register = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    throw HTTPError(409, "Email already in use");
  }
  const hashPassword = await bcrypt.hash(password, 10);
  const avatarURL = gravatar.url(email);
  const verificationToken = nanoid();
  const newUser = await User.create({
    ...req.body,
    password: hashPassword,
    avatarURL,
    verificationToken,
  });

  const mail = ElasticEmail.EmailMessageData.constructFromObject({
    Recipients: [new ElasticEmail.EmailRecipient(email)],
    Content: {
      Body: [
        ElasticEmail.BodyPart.constructFromObject({
          ContentType: "HTML",
          Content: "<strong>Test email</strong>",
        }),
      ],
      Subject: "Test email",
      From: EMAIL_FROM,
    },
  });

  const callback = function (error, data, response) {
    if (error) {
      console.error(error.message);
    } else {
      console.log("API called successfully.");
    }
  };

  api.emailsPost(mail, callback);
  res.status(201).json({
    user: {
      email: newUser.email,
      subscription: newUser.subscription,
    },
  });
};

const verifyEmail = async (req, res) => {
  const { verificationToken } = req.params;
  const user = await User.findOne({ verificationToken });
  if (!user) {
    throw HTTPError(404, "User not found");
  }
  await User.findByIdAndUpdate(user._id, {
    verify: true,
    verificationToken: "",
  });
  res.json({
    message: "Verification successful",
  });
};

const resendVerifyEmail = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne8(email);
  if (!user) {
    throw HTTPError(404, "User not found ");
  }
  if (user.verify) {
    throw HTTPError(400, "Verification has already been passed");
  }
  const mail = ElasticEmail.EmailMessageData.constructFromObject({
    Recipients: [new ElasticEmail.EmailRecipient(email)],
    Content: {
      Body: [
        ElasticEmail.BodyPart.constructFromObject({
          ContentType: "HTML",
          Content: "<strong>Resend Test email</strong>",
        }),
      ],
      Subject: "Test email",
      From: EMAIL_FROM,
    },
  });

  const callback = function (error, data, response) {
    if (error) {
      console.error(error.message);
    } else {
      console.log("API called successfully.");
    }
  };

  api.emailsPost(mail, callback);

  res.json({
    message: "Verification email sent",
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    throw HTTPError(401, "Email or password invalid");
  }
  const passwordCompare = await bcrypt.compare(password, user.password);
  if (!passwordCompare) {
    throw HTTPError(401, "Email or password invalid");
  }
  if (!user.verify) {
    throw HTTPError(400, "Email not verify");
  }
  const payload = {
    id: user._id,
  };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "23h" });
  const userWithToken = await User.findByIdAndUpdate(user._id, { token });
  res.json({
    token,
    user: {
      email: userWithToken.email,
      subscription: userWithToken.subscription,
    },
  });
};

const getCurrent = async (req, res) => {
  const { email, subscription } = req.user;
  res.json({
    email,
    subscription,
  });
};

const logout = async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: "" });
  res.status(204).send();
};

const updateAvatar = async (req, res) => {
  const { _id } = req.user;
  if (!req.file) {
    throw HTTPError(400, "File not found");
  }
  const { path: tempUpload, originalname } = req.file;
  const filename = `${_id}_${originalname}`;

  const resultUpload = path.join(avatarDir, filename);
  await fs.rename(tempUpload, resultUpload);

  const avatarURL = path.join("avatars", filename);
  await User.findByIdAndUpdate(_id, { avatarURL });

  res.json({
    avatarURL,
  });
};

module.exports = {
  register: ctrlWrapper(register),
  login: ctrlWrapper(login),
  getCurrent: ctrlWrapper(getCurrent),
  logout: ctrlWrapper(logout),
  updateAvatar: ctrlWrapper(updateAvatar),
  verifyEmail: ctrlWrapper(verifyEmail),
  resendVerifyEmail: ctrlWrapper(resendVerifyEmail),
};
