// index.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5001;

// CORS + JSON
app.use(cors());
app.use(express.json());

// Raw body ONLY for Razorpay webhook
app.use(
  "/webhook/razorpay",
  express.raw({ type: "*/*" })
);

// Import Razorpay router
const razorpayRoutes = require("./routes/razorpay");

// Use router
app.use("/api", razorpayRoutes);

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
