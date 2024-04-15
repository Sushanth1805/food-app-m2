import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
// import fileUpload from "express-fileupload";
import twilio from "twilio";
import bodyParser from "body-parser";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import NodeCache from 'node-cache';
import nodemailer from 'nodemailer';
import randomize from 'randomatic';
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { User, Food, Order } from "./model.js";
import cron from 'node-cron';

dotenv.config();
// AJTW89PBET2Z8TGTH6FSV7AB
mongoose.connect("mongodb://localhost:27017/foodDB",);
//for sending messages
const accountSid = "AC12a97a9f00cc560f7a1c6ab4f52cad2d";
const authToken = "9451835fd200bacae7c3f307824b41a6";
const client = new twilio(accountSid, authToken);

const db = mongoose.connection;

db.on("error", console.error.bind(console, "MongoDB connection error"));

db.once("open", () => {
  console.log("MongoDB connected");
});

const app = express();

app.use(
  session({
    secret: process.env.SESSION_SECRET || "arjun",
    resave: false,
    saveUninitialized: true,
  })
);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sushanths385',
    pass: 'uens dlfg smwl dlro',
  },
});

// Routes

// Set up view engine
app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

// Serve static files
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());


app.get("/", (req, res) => {
  console.log("hello");
  res.render("home.ejs");
});
app.get("/orders", (req, res) => {
  res.render("orders.ejs");
});
app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});
// Route for rendering the map page
app.get("/track-order", (req, res) => {
  // Render the map page
  res.render("map");
});
app.get("/add-food", (req, res) => {
  res.render("addFood.ejs");
});

app.get("/foods", (req, res) => {
res.render("foodList.ejs");
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/homepage", async function (req, res) {
  try {
    let foundUsers = await User.find({ secret: { $ne: null } });
    if (foundUsers) {
      console.log(foundUsers);
      res.render("secrets.ejs", { usersWithSecrets: foundUsers });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/secrets",
  passport.authenticate("google", {
    successRedirect: "/homepage",
    failureRedirect: "/login",
  })
);

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/homepage",
    failureRedirect: "/login",
  })
);

app.post('/register', async (req, res) => {
  const { username: email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (user) return res.redirect('/login');

    const otp = randomize('0', 6);
    console.log("OTP is ", otp);
    const mailOptions = {
      from: "shettyarjun2003@gmail.com",
      to: email,
      subject: 'OTP for Registration',
      text: `Your OTP for registration is: ${otp}`,
    };
    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        console.error('Error sending OTP:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      const hash = await bcrypt.hash(password, Number(process.env.SALTROUNDS) || 10);
      const newUser = new User({
        _id: new mongoose.Types.ObjectId(),
        email,
        password: hash,
        otp,
      });

      await newUser.save();
      res.redirect('/login');
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get("/submit", function (req, res) {
  console.log(req.user, "submitUser");
  if (req.isAuthenticated()) {
    res.render("submit.ejs");
  } else {
    res.redirect("/login");
  }
});

app.post('/submit', async (req, res) => {
  if (req.isAuthenticated()) {
    console.log(req.body);
    console.log(req.user, 'user');

    try {
      if (!req.body || !req.body.secret)
        return res.status(400).json({ error: 'Bad Request. Missing secret in request body.' });

      const updatedUser = await User.findOneAndUpdate(
        { googleId: req.user.googleId },
        { $set: { feedback: req.body.secret } },
        { new: true }
      );

      console.log(updatedUser, 'updatedUser');
      res.send('feedback updated');
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});


app.get('/verify-otp', (req, res) => {
  const email = req.query.email;
  res.render('verify-otp.ejs', { email });
});

app.post('/verify-otp', async (req, res) => {
  const email = req.body.email;
  const userOTP = req.body.otp;

  try {
    const user = await User.findOne({ email });
    if (user && user.otp === userOTP) {
      await User.updateOne({ email }, { $set: { otp: null } });
      req.login(user, (err) => {
        if (err) {
          console.error('Error during login:', err);
        } else {
          res.redirect('/homepage');
        }
      });
    } else {
      res.redirect('/login');
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


passport.use(
  'local',
  new LocalStrategy(async (email, password, cb) => {
    try {
      const user = await User.findOne({ email });

      if (user) {
        const valid = await bcrypt.compare(password, user.password);
        return valid ? cb(null, user) : cb(null, false);
      } else {
        return cb(null, false, { message: 'User not found' });
      }
    } catch (err) {
      console.error(err, 'local error');
      return cb(err);
    }
  })
);

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/secrets",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        console.log(accessToken);
        console.log(profile);
        const user = await User.findOne({ email: profile.email });

        if (!user) {
          const newUser = new User({
            email: profile.email,
            googleId: profile.id,
          });
          await newUser.save();
          return cb(null, newUser);
        } else {
          return cb(null, user);
        }
      } catch (err) {
        return cb(err);
      }
    }
  )
);

passport.serializeUser((user, cb) => {
  cb(null, String(user._id));
});

passport.deserializeUser(async (id, cb) => {
  try {
    const user = await User.findById(id);
    cb(null, user);
  } catch (err) {
    cb(err);
  }
});

// Handle the POST request to add food
app.post("/add-food", async (req, res) => {
  try {
    const { id, name, description, price, image, category } = req.body;
    if (req.body) {
      const newfood = new Food({
        id,
        name,
        description,
        price,
        image,
        category,
      });
      await newfood.save();
      res.json({
        success: true,
        message: "Food added successfully",
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Handle the GET request to get all food
app.get("/get-food", async (req, res) => {
  try {
    const foods = await Food.find();
    res.json(foods);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Mock Payment Endpoint
app.post("/mock-payment", async (req, res) => {
  try {
    // Perform mock payment processing (replace this with actual payment processing code)
    const paymentDetails = {
      paymentStatus: "success",
      transactionId: "mock_transaction_id",
    };

    res.json(paymentDetails);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Handle the POST request to add order
app.post("/add-order", async (req, res) => {
  try {
    const { foodId, userId, userAddressId, paymentMode } = req.body;

    // Mock payment processing (replace this with actual payment processing code)
    const paymentDetailsResponse = await fetch("http://localhost:3000/mock-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const paymentDetails = await paymentDetailsResponse.json();

    // Create a new order
    const order = new Order({
      foodId,
      userId,
      status: "pending", // Set the initial status as pending
      rating: '',
      image: '',
      textFile: '',
      otpConfirmed: false, // Set OTP confirmation status as false initially
      userAddressId,
      paymentMode,
      invoiceId: paymentDetails.transactionId, // Store invoice ID from payment gateway
      paymentDetails,

    });

    // Save the order to the database
    await order.save();

    res.json({ success: true, message: "Order added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Handle the PUT request for updating order status
app.put("/update-order/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { status } = req.body;

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { $set: { status }, $currentDate: { updatedAt: true } },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(updatedOrder);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Handle the GET request to search for food
app.get("/search-food", async (req, res) => {
  try {
    const { keyword } = req.query;
    const regex = new RegExp(keyword, "i");

    const foundFoods = await Food.find({
      $or: [{ name: { $regex: regex } }, { description: { $regex: regex } }],
    });

    res.json(foundFoods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Handle the GET request to filter food by category
app.get("/filter-food", async (req, res) => {
  try {
    const { category } = req.query;

    const foundFoods = await Food.find({ category });

    res.json(foundFoods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Implement auto-recommendations based on entered letters. 
app.get("/auto-recommendation", async (req, res) => {
  try {
    const { keyword } = req.query;
    const regex = new RegExp(keyword, "i");

    const foundFoods = await Food.find({
      name: { $regex: regex },
    });

    res.json(foundFoods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



// Schedule a cron job to run every 20 min
// cron.schedule('*/20 * * * *', async () => {
// Schedule a cron job to run every 20 sec
cron.schedule('*/20 * * * * *', async () => {
  try {
    // Get the date 20 seconds ago
    const twentyAgo = new Date(Date.now() - 20 * 1000);
    const pendingOrders = await Order.find({
      status: 'pending',
      createdAt: { $lte: twentyAgo },
    });

    // Iterate through pending orders and cancel those without confirmation
    for (const order of pendingOrders) {
      // Check if OTP confirmation is not completed
      if (!order.otpConfirmed) {
        // Update order status to 'canceled'
        order.status = 'canceled';
        await order.save();
        console.log(`Order ${order._id} canceled due to unconfirmed OTP.`);
      }
    }
  } catch (error) {
    console.error('Error in cron job:', error);
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/data/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.originalname + '-' + uniqueSuffix);
  }
});

const upload = multer({ storage: storage });

// Handle the POST request to submit feedback
app.post("/feedback", upload.fields([{ name: 'image', maxCount: 1 }, { name: 'textFile', maxCount: 1 }]), async function (req, res) {
  try {
    console.log(req.files);
    console.log(req.body);

    // Extract necessary data from the request body
    const orderId = req.body.orderId;
    const feedback = parseInt(req.body.rating, 10); // Get feedback rating from form

    // Check if the files are provided in the request
    if (!req.files || !req.files['image'] || !req.files['textFile']) {
      return res.status(400).json({ error: "Image and text file are required" });
    }

    // Find the order by ID
    const order = await Order.findById(orderId);

    // Check if the order exists
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Set the imageData property of the order to the image path
    order.image = req.files['image'][0].path;
    // Set the textData property of the order to the file path
    order.textData = req.files['textFile'][0].path;

    // Update the order with feedback
    order.feedback = feedback;

    // Save the order with updated data
    await order.save();

    res.send("Feedback submitted successfully");
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


const otpSchema = new mongoose.Schema({
  phoneNumber: String,
  otp: String,
});

const OtpModel = mongoose.model("OTP", otpSchema);
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
}

// mobile otp
app.post("/send-motp", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    // Generate a random 6-digit OTP
    const otp = generateOTP();

    const otpDocument = new OtpModel({ phoneNumber, otp });
    await otpDocument.save();

    // Send the OTP to the user via SMS
    await client.messages.create({
      body: `Your OTP is ${otp}`,
      from: "(859) 474-2599",
      to: phoneNumber,
    });

    res.json({ success: true, otp });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// verify otp
app.post("/verify-motp", async (req, res) => {
  const { orderId, phoneNumber, useOTP } = req.body;

  const order = await Order.findById(orderId);
  try {
    const otpDocument = await OtpModel.findOne({ phoneNumber, otp: useOTP });
    if (otpDocument) {
      order.status = 'completed';
      order.otpConfirmed = true;
      await order.save();
      res.json({ success: true, message: "OTP verified successfully" });
    } else {
      res.status(400).json({ error: "Invalid OTP" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }

});



const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});