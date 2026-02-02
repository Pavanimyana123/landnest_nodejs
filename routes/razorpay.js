// routes/razorpay.js
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// -------------------- CREATE ORDER --------------------
router.post("/razorpay/orders", async (req, res) => {
  try {
    const options = {
      amount: req.body.amount,
      currency: req.body.currency || "INR",
      receipt: "receipt_" + Date.now(),
      payment_capture: 1,
    };

    const response = await razorpay.orders.create(options);

    res.json({
      order_id: response.id,
      amount: response.amount,
      currency: response.currency,
    });
  } catch (err) {
    console.error("Order error:", err);
    res.status(500).send("Error creating order");
  }
});

// -------------------- VERIFY PAYMENT --------------------
router.post("/razorpay/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  let generated_signature = hmac.digest("hex");

  if (generated_signature === razorpay_signature) {
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
});

// -------------------- CREATE CUSTOMER --------------------
router.post("/razorpay/customer", async (req, res) => {
  try {
    const customer = await razorpay.customers.create(req.body);
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.description });
  }
});

// -------------------- CREATE PLAN --------------------
router.post("/razorpay/plan", async (req, res) => {
  try {
    const plan = await razorpay.plans.create({
      period: req.body.period || "monthly",
      interval: req.body.interval || 1,
      item: {
        name: req.body.plan_name,
        amount: req.body.amount * 100,
        currency: req.body.currency || "INR",
      },
    });

    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.description });
  }
});

// -------------------- CREATE SUBSCRIPTION --------------------
router.post("/razorpay/subscription", async (req, res) => {
  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: req.body.plan_id,
      customer_id: req.body.customer_id,
      total_count: req.body.total_count,
      customer_notify: 1,
      notes: req.body.notes,
    });

    res.json({ success: true, subscription });
  } catch (err) {
    console.error("Razorpay Subscription Error:", err);
    res.status(500).json({
      success: false,
      error: err.error?.description || "Failed to create subscription",
    });
  }
});

router.post("/razorpay/verify-subscription-payment", async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;

    console.log("razorpay_payment_id:", razorpay_payment_id);
    console.log("razorpay_subscription_id:", razorpay_subscription_id);
    console.log("razorpay_signature:", razorpay_signature);

    if (
      !razorpay_payment_id ||
      !razorpay_subscription_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_payment_id + "|" + razorpay_subscription_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // ------------ OPTIONAL: Double verify from Razorpay ----------
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

    if (paymentDetails.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Payment not captured.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      payment: paymentDetails,
    });
  } catch (err) {
    console.error("Subscription Payment Verification Error:", err);
    res.status(500).json({
      success: false,
      message: "Payment verification error",
      error: err,
    });
  }
});

module.exports = router;
