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
// router.post("/razorpay/customer", async (req, res) => {
//   try {
//     const customer = await razorpay.customers.create(req.body);
//     res.json({ success: true, customer });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.error?.description });
//   }
// });

const normalizeEmail = (email) => email?.trim().toLowerCase();

const normalizeContact = (contact) =>
  contact?.toString().replace(/\D/g, "").slice(-10); // last 10 digits


// ===============================
// 📦 FETCH ALL CUSTOMERS (PAGINATION)
// ===============================
const getAllCustomers = async () => {
  let allCustomers = [];
  let skip = 0;
  const count = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await razorpay.customers.all({ count, skip });

    allCustomers = [...allCustomers, ...response.items];

    if (response.items.length < count) {
      hasMore = false;
    } else {
      skip += count;
    }
  }

  return allCustomers;
};


// ===============================
// 🔍 FIND CUSTOMER (NORMALIZED MATCH)
// ===============================
const findCustomer = (customers, email, contact) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedContact = normalizeContact(contact);

  return customers.find((c) => {
    return (
      normalizeEmail(c.email) === normalizedEmail &&
      normalizeContact(c.contact) === normalizedContact
    );
  });
};


// ===============================
// 🚀 CREATE / FETCH CUSTOMER API
// ===============================
router.post("/razorpay/customer", async (req, res) => {
  try {
    const { name, email, contact } = req.body;

    if (!email || !contact) {
      return res.status(400).json({
        success: false,
        message: "Email and contact are required",
      });
    }

    // ===============================
    // 1️⃣ FETCH ALL CUSTOMERS
    // ===============================
    const customers = await getAllCustomers();

    // ===============================
    // 2️⃣ CHECK EXISTING CUSTOMER
    // ===============================
    const existingCustomer = findCustomer(customers, email, contact);

    if (existingCustomer) {
      return res.json({
        success: true,
        customer: existingCustomer,
        message: "Existing customer returned",
      });
    }

    // ===============================
    // 3️⃣ CREATE NEW CUSTOMER
    // ===============================
    try {
      const newCustomer = await razorpay.customers.create({
        name,
        email,
        contact,
      });

      return res.json({
        success: true,
        customer: newCustomer,
        message: "New customer created",
      });

    } catch (err) {

      // ===============================
      // 🔥 DUPLICATE ERROR HANDLING
      // ===============================
      if (
        err?.error?.description?.includes("Customer already exists")
      ) {
        console.log("⚠️ Duplicate detected, refetching...");

        const refreshedCustomers = await getAllCustomers();

        const matchedCustomer = findCustomer(
          refreshedCustomers,
          email,
          contact
        );

        if (matchedCustomer) {
          return res.json({
            success: true,
            customer: matchedCustomer,
            message: "Customer fetched after duplicate error",
          });
        }
      }

      throw err;
    }

  } catch (err) {
    console.error("Razorpay error:", err);

    return res.status(500).json({
      success: false,
      error:
        err?.error?.description ||
        err.message ||
        "Something went wrong",
    });
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

router.post("/razorpay/verify-subscription-payment", (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // ✅ SUCCESS — payment is authentic
    return res.status(200).json({
      success: true,
      message: "Subscription payment verified successfully",
      status: "AUTHORIZED",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Verification error",
    });
  }
});

module.exports = router;
