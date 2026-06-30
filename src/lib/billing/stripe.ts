import Stripe from "stripe";

// SERVER ONLY. The placeholder keeps `next build` from throwing when the env
// var is absent; real requests use the configured STRIPE_SECRET_KEY.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
